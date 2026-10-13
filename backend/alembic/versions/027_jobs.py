"""Bounded, tenant-isolated durable detection outbox.

Revision ID: 027_jobs
Revises: 026_weekly_upload_receipts
"""

from alembic import op
import sqlalchemy as sa

revision = "027_jobs"
down_revision = "026_weekly_upload_receipts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "jobs",
        sa.Column("tenant_id", sa.String(256), nullable=False),
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("job_type", sa.String(16), nullable=False),
        sa.Column("upload_id", sa.String(64), nullable=False),
        sa.Column("conversation_ids_sha256", sa.String(64), nullable=False),
        sa.Column("conversation_count", sa.Integer(), nullable=False),
        sa.Column("config_sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), server_default="queued", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default="3", nullable=False),
        sa.Column("cursor", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "run_after",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("lease_owner", sa.String(128)),
        sa.Column("lease_token", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("leased_at", sa.DateTime(timezone=True)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True)),
        sa.Column("last_error_category", sa.String(32)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("tenant_id", "id"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "upload_id"], ["uploads.tenant_id", "uploads.upload_id"]
        ),
        sa.CheckConstraint("job_type IN ('upload','detect')", name="ck_jobs_type"),
        sa.CheckConstraint(
            "status IN ('queued','leased','succeeded','failed','cancelled','dead_lettered')",
            name="ck_jobs_status",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0 AND max_attempts BETWEEN 1 AND 3 AND attempt_count <= max_attempts",
            name="ck_jobs_attempts",
        ),
        sa.CheckConstraint(
            "lease_token >= 0 AND cursor >= 0 AND conversation_count BETWEEN 1 AND 1000 AND cursor <= conversation_count",
            name="ck_jobs_cursor",
        ),
        sa.CheckConstraint(
            "length(config_sha256) = 64 AND length(conversation_ids_sha256) = 64",
            name="ck_jobs_digests",
        ),
        sa.CheckConstraint(
            "status != 'leased' OR (lease_owner IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL)",
            name="ck_jobs_lease",
        ),
    )
    op.create_index(
        "ix_jobs_claim",
        "jobs",
        ["tenant_id", "status", "run_after", "priority", "created_at"],
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO sioona_runtime")
    op.execute("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE jobs FORCE ROW LEVEL SECURITY")
    op.execute("""CREATE POLICY tenant_isolation ON jobs
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))""")


def downgrade():
    op.drop_table("jobs")
