"""Retain validated import payloads for recovery after process interruption."""
import sqlalchemy as sa
from alembic import op
revision = "015_ingestion_payload"
down_revision = "014_detection_runs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("uploads", sa.Column("payload", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("uploads", "payload")
