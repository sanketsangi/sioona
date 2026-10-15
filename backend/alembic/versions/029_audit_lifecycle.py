"""D11 audit and lifecycle primitives (additive; no sweep or scheduler).

Revision ID: 029_audit_lifecycle
Revises: 028_batch_cache
"""
from alembic import op

revision = '029_audit_lifecycle'
down_revision = '028_batch_cache'
branch_labels = None
depends_on = None

TABLES = ('audit_events', 'legal_holds', 'tenant_deletions', 'tenant_exports', 'lifecycle_ledger_summaries')
FENCED_TABLES = ('signal_evidence', 'signal_feedback', 'supervised_action_decisions', 'signal_predictions', 'inference_reservations', 'inference_attempts', 'messages', 'detection_runs', 'job_conversations', 'classification_cache', 'jobs', 'upload_conversations', 'uploads', 'conversations', 'detection_resume', 'weekly_upload_receipts', 'pilot_settings', 'taxonomy_overrides', 'inference_run_budgets', 'inference_budgets', 'inference_controls', 'memberships', 'workspaces')


def upgrade():
    op.execute("""
CREATE TABLE audit_events (
	id VARCHAR(36) NOT NULL, 
	tenant_id VARCHAR(256) NOT NULL, 
	actor_id VARCHAR(36) NOT NULL, 
	actor_role VARCHAR(16) NOT NULL, 
	resource_type VARCHAR(32) NOT NULL, 
	resource_id VARCHAR(64) NOT NULL, 
	resource_version VARCHAR(16) NOT NULL, 
	operation VARCHAR(32) NOT NULL, 
	result VARCHAR(16) NOT NULL, 
	reason_code VARCHAR(32) NOT NULL, 
	correlation_id VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_audit_role CHECK (actor_role = 'admin'), 
	CONSTRAINT ck_audit_operation CHECK (operation IN ('hold_placed','hold_released','export_created','export_read','deletion_requested','deletion_confirmed','deletion_step','deletion_completed','deletion_blocked','deletion_failed','retention_sweep')), 
	CONSTRAINT ck_audit_result CHECK (result IN ('succeeded','blocked','failed')), 
	CONSTRAINT ck_audit_reason CHECK (reason_code IN ('approved','litigation','regulatory','investigation','legal_hold','internal_error','expired')), 
	CONSTRAINT ck_audit_resource CHECK (resource_type IN ('tenant','hold','export','deletion','retention'))
)
    """)
    op.execute('CREATE INDEX ix_audit_events_tenant_id ON audit_events (tenant_id)')
    op.execute("""
CREATE TABLE legal_holds (
	id VARCHAR(36) NOT NULL, 
	tenant_id VARCHAR(256) NOT NULL, 
	reason_code VARCHAR(32) NOT NULL, 
	resource_type VARCHAR(32) NOT NULL, 
	resource_id VARCHAR(256), 
	active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_hold_reason CHECK (reason_code IN ('litigation','regulatory','investigation')), 
	CONSTRAINT ck_hold_resource CHECK (resource_type IN ('tenant','conversation','upload')), 
	CONSTRAINT ck_hold_scope CHECK ((resource_type = 'tenant' AND resource_id IS NULL) OR (resource_type <> 'tenant' AND resource_id IS NOT NULL))
)
    """)
    op.execute('CREATE INDEX ix_legal_holds_tenant_id ON legal_holds (tenant_id)')
    op.execute("""
CREATE TABLE tenant_deletions (
	tenant_id VARCHAR(256) NOT NULL, 
	id VARCHAR(36) NOT NULL, 
	requested_by VARCHAR(36) NOT NULL, 
	state VARCHAR(16) NOT NULL, 
	fenced BOOLEAN NOT NULL, 
	checkpoint INTEGER NOT NULL, 
	counts JSON NOT NULL, 
	reason_code VARCHAR(32), 
	policy_version VARCHAR(16) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (tenant_id), 
	CONSTRAINT ck_deletion_state CHECK (state IN ('requested','confirmed','running','completed','blocked','failed')), 
	CONSTRAINT ck_deletion_checkpoint CHECK (checkpoint >= 0), 
	UNIQUE (id)
)
    """)
    op.execute("""
CREATE TABLE tenant_exports (
	id VARCHAR(36) NOT NULL, 
	tenant_id VARCHAR(256) NOT NULL, 
	bundle JSON, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
)
    """)
    op.execute('CREATE INDEX ix_tenant_exports_tenant_id ON tenant_exports (tenant_id)')
    op.execute("""
CREATE TABLE lifecycle_ledger_summaries (
	tenant_id VARCHAR(256) NOT NULL, 
	id VARCHAR(36) NOT NULL, 
	attempts INTEGER NOT NULL, 
	unknown_attempts INTEGER NOT NULL, 
	reserved_usd NUMERIC(14, 8) NOT NULL, 
	spent_usd NUMERIC(14, 8) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (tenant_id, id), 
	CONSTRAINT ck_lifecycle_ledger_totals CHECK (attempts >= 0 AND unknown_attempts >= 0 AND reserved_usd >= 0 AND spent_usd >= 0)
)
    """)
    for table in TABLES:
        op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE {table} FORCE ROW LEVEL SECURITY')
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))")
        privileges = 'SELECT, INSERT' if table in ('audit_events', 'lifecycle_ledger_summaries') else 'SELECT, INSERT, UPDATE, DELETE'
        op.execute(f'GRANT {privileges} ON {table} TO sioona_runtime')
    op.execute('REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM sioona_runtime')
    op.execute('REVOKE DELETE, TRUNCATE ON tenant_deletions FROM sioona_runtime')
    op.execute("""CREATE FUNCTION cb18_sticky_fence() RETURNS trigger
        LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
        BEGIN
          IF OLD.fenced AND NOT NEW.fenced THEN RAISE EXCEPTION 'deletion_fence_is_permanent'; END IF;
          RETURN NEW;
        END $$""")
    op.execute('CREATE TRIGGER cb18_sticky_fence BEFORE UPDATE ON tenant_deletions FOR EACH ROW EXECUTE FUNCTION cb18_sticky_fence()')
    # A transaction-scoped shared lock protocol serializes every canonical write
    # with the persistent deletion fence, even legacy writers and late workers.
    op.execute("""CREATE FUNCTION cb18_write_barrier() RETURNS trigger
        LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
        DECLARE lock_key bigint;
        BEGIN
          IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
          lock_key := ('x' || substr(encode(sha256(convert_to('cb18:' || NEW.tenant_id, 'UTF8')), 'hex'), 1, 16))::bit(64)::bigint;
          PERFORM pg_advisory_xact_lock_shared(lock_key);
          IF EXISTS (SELECT 1 FROM public.tenant_deletions
                     WHERE tenant_id = NEW.tenant_id AND fenced) THEN
            RAISE EXCEPTION 'tenant_deleting' USING ERRCODE = '55000';
          END IF;
          RETURN NEW;
        END $$""")
    for table in FENCED_TABLES:
        op.execute(f'CREATE TRIGGER cb18_fence BEFORE INSERT OR UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION cb18_write_barrier()')
    # Only this narrow definer path may inspect other workspace memberships.
    # row_security=off fails closed if the migration owner cannot bypass RLS.
    op.execute("""CREATE FUNCTION cb18_remove_membership(target text, uid uuid) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET row_security = off AS $$
        BEGIN
          IF target IS DISTINCT FROM current_setting('app.tenant_id', true)
             OR NOT EXISTS (SELECT 1 FROM public.tenant_deletions WHERE tenant_id=target AND fenced) THEN
            RAISE EXCEPTION 'tenant_deletion_required';
          END IF;
          PERFORM 1 FROM public.users WHERE id=uid FOR UPDATE;
          DELETE FROM public.memberships WHERE tenant_id=target AND user_id=uid;
          DELETE FROM public.users WHERE id=uid AND NOT EXISTS
            (SELECT 1 FROM public.memberships WHERE user_id=uid);
        END $$""")
    op.execute('REVOKE ALL ON FUNCTION cb18_remove_membership(text, uuid) FROM PUBLIC')
    op.execute('GRANT EXECUTE ON FUNCTION cb18_remove_membership(text, uuid) TO sioona_runtime')
    # Narrow manual expiry: no caller-selectable cutoff and no unexpired deletion.
    op.execute("""CREATE FUNCTION cb18_expire_summaries(target text) RETURNS integer
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET row_security = off AS $$
        DECLARE removed integer; other_removed integer;
        BEGIN
          IF target IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
            RAISE EXCEPTION 'tenant_mismatch';
          END IF;
          IF EXISTS (SELECT 1 FROM public.legal_holds WHERE tenant_id=target AND active) THEN
            RAISE EXCEPTION 'legal_hold';
          END IF;
          DELETE FROM public.audit_events WHERE id IN
            (SELECT id FROM public.audit_events WHERE tenant_id=target AND created_at < now() - interval '365 days' ORDER BY created_at LIMIT 250);
          GET DIAGNOSTICS removed = ROW_COUNT;
          DELETE FROM public.lifecycle_ledger_summaries WHERE tenant_id=target AND id IN
            (SELECT id FROM public.lifecycle_ledger_summaries WHERE tenant_id=target AND created_at < now() - interval '365 days' ORDER BY created_at LIMIT 250);
          GET DIAGNOSTICS other_removed = ROW_COUNT;
          RETURN removed + other_removed;
        END $$""")
    op.execute('REVOKE ALL ON FUNCTION cb18_expire_summaries(text) FROM PUBLIC')
    op.execute('GRANT EXECUTE ON FUNCTION cb18_expire_summaries(text) TO sioona_runtime')
    # Audit metadata is schema bounded as well as application bounded.
    for field in ('id','actor_id','resource_id','correlation_id'):
        op.execute(f"ALTER TABLE audit_events ADD CONSTRAINT ck_audit_{field}_uuid CHECK ({field} ~ '^[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}}$')")
    op.execute("ALTER TABLE audit_events ADD CONSTRAINT ck_audit_version CHECK (resource_version = 'cb18.v1')")


def downgrade():
    # A rollback must never discard a durable deletion fence or receipt.
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM tenant_deletions) THEN RAISE EXCEPTION 'lifecycle receipts must be retained; rollback blocked'; END IF; END $$")
    for table in FENCED_TABLES:
        op.execute(f'DROP TRIGGER cb18_fence ON {table}')
    op.execute('DROP TRIGGER cb18_sticky_fence ON tenant_deletions')
    op.execute('DROP FUNCTION cb18_sticky_fence()')
    op.execute('DROP FUNCTION cb18_write_barrier()')
    op.execute('DROP FUNCTION cb18_expire_summaries(text)')
    op.execute('DROP FUNCTION cb18_remove_membership(text, uuid)')
    for table in reversed(TABLES):
        op.drop_table(table)
