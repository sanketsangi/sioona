"""CB-16 additive installation authority, durable inbox and source watermarks."""
from alembic import op
import sqlalchemy as sa

revision = '032_live_ingest'
down_revision = '031_queue_search'
branch_labels = None
depends_on = None

OLD_OPERATIONS = "'hold_placed','hold_released','export_created','export_read','deletion_requested','deletion_confirmed','deletion_step','deletion_completed','deletion_blocked','deletion_failed','retention_sweep','inference_paused','inference_enabled'"
OLD_RESOURCES = "'tenant','hold','export','deletion','retention','inference_control','global_inference_control'"

def audit_constraints(extra=True):
    for name, column, old, additions in (
        ('ck_audit_operation', 'operation', OLD_OPERATIONS, ",'integration_configured','integration_revoked','live_requeued'"),
        ('ck_audit_resource', 'resource_type', OLD_RESOURCES, ",'integration','live_event'"),
    ):
        op.drop_constraint(name, 'audit_events', type_='check')
        op.create_check_constraint(name, 'audit_events', f'{column} IN ({old}{additions if extra else ""})')

def upgrade():
    op.create_table('live_installations',
        sa.Column('tenant_id', sa.String(256), primary_key=True), sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('workspace_id', sa.String(128), nullable=False),
        sa.Column('credential_ref', sa.String(64), nullable=False), sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('consent_reference', sa.String(128), nullable=False), sa.Column('monitoring_reference', sa.String(128), nullable=False),
        sa.Column('reconciliation_cursor', sa.String(256)), sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('workspace_id', name='uq_live_intercom_workspace'),
        sa.CheckConstraint("credential_ref = 'INTERCOM_CLIENT_SECRET'", name='ck_live_credential'))
    op.create_table('live_events',
        sa.Column('tenant_id', sa.String(256), primary_key=True), sa.Column('installation_id', sa.String(64), primary_key=True),
        sa.Column('event_id', sa.String(128), primary_key=True), sa.Column('source_id', sa.String(256), nullable=False),
        sa.Column('provider_object_id', sa.String(256)), sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False), sa.Column('payload_sha256', sa.String(64), nullable=False),
        sa.Column('content_sha256', sa.String(64)), sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('state', sa.String(16), nullable=False), sa.Column('payload', sa.JSON(none_as_null=True)), sa.Column('job_id', sa.String(64)),
        sa.Column('reason', sa.String(32)), sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id','installation_id'], ['live_installations.tenant_id','live_installations.id']),
        sa.CheckConstraint("state IN ('pending','dispatched','succeeded','ignored','dead_lettered','cancelled')", name='ck_live_event_state'),
        sa.CheckConstraint("kind IN ('upsert','delete','unresolved')", name='ck_live_event_kind'),
        sa.CheckConstraint('source_version >= 0 AND length(payload_sha256) = 64', name='ck_live_event_digest'))
    op.create_index('ix_live_event_pending', 'live_events', ['tenant_id','state','received_at'])
    op.create_table('live_sources',
        sa.Column('tenant_id', sa.String(256), primary_key=True), sa.Column('installation_id', sa.String(64), primary_key=True),
        sa.Column('source_id', sa.String(256), primary_key=True), sa.Column('source_version', sa.Integer(), nullable=False),
        sa.Column('content_sha256', sa.String(64), nullable=False), sa.Column('conversation_id', sa.String(256)),
        sa.Column('deleted', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id','installation_id'], ['live_installations.tenant_id','live_installations.id']))
    for table in ('live_installations','live_events','live_sources'):
        op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE {table} FORCE ROW LEVEL SECURITY')
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))")
        op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO sioona_runtime')
        # Existing lifecycle fence function rejects inserts/updates after deletion confirmation.
        op.execute(f'CREATE TRIGGER lifecycle_fence BEFORE INSERT OR UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION cb18_write_barrier()')
    # New empty tables precede the old deletion order. Preserve in-flight checkpoints.
    op.execute("UPDATE tenant_deletions SET checkpoint = checkpoint + 3 WHERE fenced AND state <> 'completed'")
    audit_constraints()

def downgrade():
    # Never discard accepted events or append-only integration audit receipts.
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM live_events) OR EXISTS (SELECT 1 FROM live_installations) OR EXISTS (SELECT 1 FROM audit_events WHERE operation IN ('integration_configured','integration_revoked','live_requeued')) THEN RAISE EXCEPTION 'live_ingest_not_empty'; END IF; END $$")
    op.execute("UPDATE tenant_deletions SET checkpoint = greatest(0, checkpoint - 3) WHERE fenced AND state <> 'completed'")
    for table in ('live_sources','live_events','live_installations'):
        op.drop_table(table)
    audit_constraints(False)
