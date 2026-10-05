"""Durable contact intake receipts."""
import sqlalchemy as sa
from alembic import op
revision = "013_pilot_requests"
down_revision = "012_durable_uploads"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("pilot_requests",
        sa.Column("receipt_id", sa.String(64), primary_key=True),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("company", sa.String(160), nullable=False),
        sa.Column("role", sa.String(120), nullable=False),
        sa.Column("platform", sa.String(120), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_pilot_request_email_created", "pilot_requests", ["email", "created_at"])


def downgrade():
    op.drop_table("pilot_requests")
