"""Historical references and tenant-scoped classification cache.

Revision ID: 028_batch_cache
Revises: 027_jobs
"""
from alembic import op
import sqlalchemy as sa

revision = "028_batch_cache"
down_revision = "027_jobs"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_jobs_type", "jobs", type_="check")
    op.create_check_constraint("ck_jobs_type", "jobs", "job_type IN ('upload','detect','historical')")
    op.drop_constraint("ck_jobs_cursor", "jobs", type_="check")
    op.create_check_constraint("ck_jobs_cursor", "jobs", "lease_token >= 0 AND cursor >= 0 AND conversation_count BETWEEN 1 AND 10000 AND (job_type = 'historical' OR conversation_count <= 1000) AND cursor <= conversation_count")
    op.add_column("inference_attempts", sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_inference_attempts_job_conversation", "inference_attempts", ["tenant_id", "job_id", "conversation_id"])
    op.create_check_constraint("ck_inference_cache_hit", "inference_attempts", "NOT cache_hit OR (status = 'succeeded' AND usage_status = 'reported' AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND cached_input_tokens IS NOT NULL AND reasoning_tokens IS NOT NULL AND estimated_cost_usd IS NOT NULL AND input_tokens = 0 AND output_tokens = 0 AND cached_input_tokens = 0 AND reasoning_tokens = 0 AND estimated_cost_usd = 0 AND cost_status = 'reconciled' AND provider_request_id IS NULL)")
    op.create_table("classification_cache",
        sa.Column("tenant_id", sa.String(256), primary_key=True),
        sa.Column("content_sha256", sa.String(64), primary_key=True),
        sa.Column("prompt_version", sa.String(128), primary_key=True),
        sa.Column("model_id", sa.String(128), primary_key=True),
        sa.Column("route_version", sa.String(64), primary_key=True),
        sa.Column("taxonomy_hash", sa.String(64), primary_key=True),
        sa.Column("classification", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("job_conversations",
        sa.Column("tenant_id", sa.String(256), primary_key=True),
        sa.Column("job_id", sa.String(64), primary_key=True),
        sa.Column("conversation_id", sa.String(256), primary_key=True),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("context_sha256", sa.String(64), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["tenant_id", "job_id"], ["jobs.tenant_id", "jobs.id"]),
        sa.UniqueConstraint("tenant_id", "job_id", "ordinal", name="uq_job_conversations_ordinal"))
    op.create_index("ix_job_conversations_page", "job_conversations", ["tenant_id", "job_id", "completed", "ordinal"])
    for table in ("classification_cache", "job_conversations"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO sioona_runtime")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))")


def downgrade():
    # Refuse to silently destroy an active historical job on rollback.
    op.execute("DO $$ BEGIN IF EXISTS (SELECT 1 FROM jobs WHERE job_type='historical') THEN RAISE EXCEPTION 'historical jobs must be retained; rollback blocked'; END IF; END $$")
    op.drop_table("job_conversations")
    op.drop_table("classification_cache")
    op.drop_constraint("ck_inference_cache_hit", "inference_attempts", type_="check")
    op.drop_index("ix_inference_attempts_job_conversation", table_name="inference_attempts")
    op.drop_column("inference_attempts", "cache_hit")
    op.drop_constraint("ck_jobs_type", "jobs", type_="check")
    op.create_check_constraint("ck_jobs_type", "jobs", "job_type IN ('upload','detect')")
    op.drop_constraint("ck_jobs_cursor", "jobs", type_="check")
    op.create_check_constraint("ck_jobs_cursor", "jobs", "lease_token >= 0 AND cursor >= 0 AND conversation_count BETWEEN 1 AND 1000 AND cursor <= conversation_count")
