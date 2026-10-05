"""Index tenant-scoped active prediction keyset queries."""
from alembic import op
revision = "016_review_cursor_index"
down_revision = "015_ingestion_payload"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_prediction_tenant_active_id", "signal_predictions", ["tenant_id", "active", "id"])


def downgrade():
    op.drop_index("ix_prediction_tenant_active_id", table_name="signal_predictions")
