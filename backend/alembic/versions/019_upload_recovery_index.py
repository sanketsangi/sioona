"""Index bounded recovery scans across tenants by status and age."""
from alembic import op
revision = "019_upload_recovery_index"
down_revision = "018_commercial_value_evidence"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_upload_recovery_scan", "uploads", ["status", "imported_at", "tenant_id", "upload_id"])


def downgrade():
    op.drop_index("ix_upload_recovery_scan", table_name="uploads")
