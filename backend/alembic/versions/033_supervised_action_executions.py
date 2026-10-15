"""CB-17 exact, expiring sandbox approval and durable execution outbox."""
from alembic import op
import sqlalchemy as sa

revision = '033_supervised_action_executions'
down_revision = '032_live_ingest'
branch_labels = None
depends_on = None

OPERATIONS = "'hold_placed','hold_released','export_created','export_read','deletion_requested','deletion_confirmed','deletion_step','deletion_completed','deletion_blocked','deletion_failed','retention_sweep','inference_paused','inference_enabled','integration_configured','integration_revoked','live_requeued'"
RESOURCES = "'tenant','hold','export','deletion','retention','inference_control','global_inference_control','integration','live_event'"
ACTIONS = "'action_proposed','action_approved','action_attempted','action_succeeded','action_failed','action_unknown','action_invalidated','action_reconciled'"

def constraints(extra):
    for name, col, old, new in [('ck_audit_operation','operation',OPERATIONS,ACTIONS), ('ck_audit_resource','resource_type',RESOURCES,"'action'")]:
        op.drop_constraint(name, 'audit_events', type_='check')
        op.create_check_constraint(name, 'audit_events', f'{col} IN ({old}{","+new if extra else ""})')

def upgrade():
    # Frozen table copies below avoid future ORM drift in migration replay.
    op.create_unique_constraint('uq_supervised_action_tenant_id', 'supervised_action_decisions', ['tenant_id','id'])
    op.create_table('action_proposals',
        sa.Column('tenant_id', sa.String(256), primary_key=True), sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('decision_id', sa.Uuid(), nullable=False), sa.Column('action_version', sa.Integer(), nullable=False),
        sa.Column('action_type', sa.String(32), nullable=False), sa.Column('target', sa.String(128), nullable=False),
        sa.Column('payload_json', sa.JSON(), nullable=False), sa.Column('payload_sha256', sa.String(64), nullable=False),
        sa.Column('state', sa.String(16), nullable=False), sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id','decision_id'], ['supervised_action_decisions.tenant_id','supervised_action_decisions.id']),
        sa.UniqueConstraint('tenant_id','decision_id','action_version', name='uq_action_proposal_version'),
        sa.CheckConstraint('action_version > 0 AND length(payload_sha256) = 64', name='ck_action_proposal_version'),
        sa.CheckConstraint("state IN ('proposed','superseded')", name='ck_action_proposal_state'),
        sa.CheckConstraint("action_type = 'intercom_internal_note'", name='ck_external_action_type'))
    op.create_table('action_executions',
        sa.Column('tenant_id', sa.String(256), primary_key=True), sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('proposal_id', sa.String(36), nullable=False), sa.Column('payload_sha256', sa.String(64), nullable=False),
        sa.Column('target', sa.String(128), nullable=False), sa.Column('actor_id', sa.String(36), nullable=False),
        sa.Column('action_version', sa.Integer(), nullable=False), sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('state', sa.String(16), nullable=False), sa.Column('provider_receipt', sa.String(128)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id','proposal_id'], ['action_proposals.tenant_id','action_proposals.id']),
        sa.UniqueConstraint('tenant_id','proposal_id', name='uq_action_execution_proposal'),
        sa.CheckConstraint("state IN ('approved','attempted','succeeded','failed','unknown')", name='ck_action_execution_state'))
    for table in ('action_proposals','action_executions'):
        op.execute(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE {table} FORCE ROW LEVEL SECURITY')
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))")
        op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO sioona_runtime')
        op.execute(f'CREATE TRIGGER lifecycle_fence BEFORE INSERT OR UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION cb18_write_barrier()')
    op.execute("UPDATE tenant_deletions SET checkpoint = checkpoint + 2 WHERE fenced AND state <> 'completed'")
    op.execute("""CREATE FUNCTION cb17_immutable_binding() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_TABLE_NAME = 'action_proposals' THEN
        IF (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
          RAISE EXCEPTION 'immutable_action_proposal';
        END IF;
        IF NEW.state <> OLD.state AND NOT (OLD.state='proposed' AND NEW.state='superseded') THEN
          RAISE EXCEPTION 'invalid_proposal_transition';
        END IF;
      ELSE
        IF (to_jsonb(NEW) - 'state' - 'provider_receipt') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'provider_receipt') THEN
          RAISE EXCEPTION 'immutable_action_approval';
        END IF;
        IF NEW.state <> OLD.state AND NOT (
          (OLD.state='approved' AND NEW.state IN ('attempted','failed')) OR
          (OLD.state='attempted' AND NEW.state IN ('succeeded','failed','unknown')) OR
          (OLD.state='unknown' AND NEW.state IN ('succeeded','failed'))
        ) THEN RAISE EXCEPTION 'invalid_execution_transition'; END IF;
      END IF;
      RETURN NEW;
    END $$""")
    for table in ('action_proposals','action_executions'):
        op.execute(f'CREATE TRIGGER immutable_action_binding BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION cb17_immutable_binding()')
    constraints(True)
    op.drop_constraint('ck_audit_version', 'audit_events', type_='check')
    op.create_check_constraint('ck_audit_version', 'audit_events',
        "resource_version = 'cb18.v1' OR (resource_type = 'action' AND resource_version ~ '^[1-9][0-9]{0,15}$')")

def downgrade():
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM action_proposals) OR EXISTS (SELECT 1 FROM audit_events WHERE operation LIKE 'action_%') THEN RAISE EXCEPTION 'action_history_not_empty'; END IF; END $$")
    op.execute("UPDATE tenant_deletions SET checkpoint = greatest(0, checkpoint - 2) WHERE fenced AND state <> 'completed'")
    op.drop_table('action_executions'); op.drop_table('action_proposals')
    op.execute('DROP FUNCTION cb17_immutable_binding()')
    op.drop_constraint('uq_supervised_action_tenant_id', 'supervised_action_decisions', type_='unique')
    constraints(False)
    op.drop_constraint('ck_audit_version', 'audit_events', type_='check')
    op.create_check_constraint('ck_audit_version', 'audit_events', "resource_version = 'cb18.v1'")
