"""Reference-only durable jobs with runtime-role tenant isolation.

Revision ID: 027_jobs
Revises: 026_weekly_upload_receipts
Prepared only; applying this migration is an operator action.
"""
import sqlalchemy as sa
from alembic import op

revision = "027_jobs"
down_revision = "026_weekly_upload_receipts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "jobs",
        sa.Column("tenant_id", sa.String(128), primary_key=True),
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="detection"),
        sa.Column("upload_id", sa.String(128), nullable=False),
        sa.Column("config_sha256", sa.String(64), nullable=False),
        sa.Column("conversation_digest", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("run_after", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("lease_owner", sa.String(128)),
        sa.Column("lease_token", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("leased_at", sa.DateTime(timezone=True)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True)),
        sa.Column("cursor", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error_category", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "kind", "upload_id", "config_sha256", "conversation_digest", name="uq_jobs_identity"),
        sa.CheckConstraint("status IN ('queued','leased','succeeded','failed','cancelled','dead_lettered')", name="ck_jobs_status"),
        sa.CheckConstraint("kind = 'detection'", name="ck_jobs_kind"),
        sa.CheckConstraint("attempt_count >= 0 AND max_attempts BETWEEN 1 AND 3 AND attempt_count <= max_attempts", name="ck_jobs_attempts"),
        sa.CheckConstraint("lease_token >= 0 AND cursor >= 0", name="ck_jobs_cursor_token"),
        sa.CheckConstraint("length(config_sha256) = 64 AND length(conversation_digest) = 64", name="ck_jobs_digests"),
        sa.CheckConstraint("(status = 'leased' AND lease_owner IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL) OR (status <> 'leased' AND lease_owner IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL)", name="ck_jobs_lease"),
    )
    op.create_index("ix_jobs_claim", "jobs", ["tenant_id", "status", "run_after", "priority", "created_at"])
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sioona_runtime') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO sioona_runtime;
        END IF;
    END $$""")
    op.execute("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE jobs FORCE ROW LEVEL SECURITY")
    op.execute("""CREATE POLICY tenant_isolation ON jobs
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))""")


def downgrade():
    op.drop_table("jobs")
