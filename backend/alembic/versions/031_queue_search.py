"""Persisted queue text search indexes; existing forced tenant RLS stays in force."""
from alembic import op

revision = "031_queue_search"
down_revision = "030_inference_control_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for table, column, prefix, predicate in (
        ("messages", "content", "ix_messages_customer_search", " WHERE role = 'customer'"),
        ("signal_predictions", "summary", "ix_predictions_search", ""),
    ):
        op.execute(f"CREATE INDEX {prefix}_fts ON {table} USING gin (to_tsvector('simple'::regconfig, {column})){predicate}")
        op.execute(f"CREATE INDEX {prefix}_trgm ON {table} USING gin ({column} gin_trgm_ops){predicate}")


def downgrade():
    for prefix in ("ix_messages_customer_search", "ix_predictions_search"):
        for suffix in ("fts", "trgm"):
            op.drop_index(f"{prefix}_{suffix}")
