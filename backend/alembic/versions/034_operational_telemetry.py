"""Text-free tenant operational receipts for CB-15."""
from alembic import op
import sqlalchemy as sa

revision = "034_operational_telemetry"
down_revision = "033_supervised_action_executions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("operational_samples",
        sa.Column("tenant_id", sa.String(256), primary_key=True),
        sa.Column("sample_id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(32), primary_key=True),
        sa.Column("duration_ms", sa.Float(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("kind IN ('ledger_flush_failure','database_query')", name="ck_operational_kind"),
        sa.CheckConstraint("duration_ms >= 0 AND duration_ms <= 3600000", name="ck_operational_duration"))
    op.create_index("ix_operational_window", "operational_samples", ["tenant_id", "observed_at", "kind"])
    op.execute("ALTER TABLE operational_samples ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE operational_samples FORCE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY tenant_isolation ON operational_samples USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))")
    op.execute("GRANT SELECT, INSERT, DELETE ON operational_samples TO sioona_runtime")
    op.execute("CREATE TRIGGER lifecycle_fence BEFORE INSERT OR UPDATE ON operational_samples FOR EACH ROW EXECUTE FUNCTION cb18_write_barrier()")

    # Insert telemetry cleanup before membership removal; existing in-flight
    # checkpoints continue at their original step. No receipts existed pre-034.
    op.execute("UPDATE tenant_deletions SET checkpoint = checkpoint + 1 WHERE fenced AND state <> 'completed' AND checkpoint >= 27")


def downgrade():
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM operational_samples) THEN RAISE EXCEPTION 'operational_history_not_empty'; END IF; END $$")
    op.execute("UPDATE tenant_deletions SET checkpoint = checkpoint - 1 WHERE fenced AND state <> 'completed' AND checkpoint > 27")
    op.drop_table("operational_samples")
