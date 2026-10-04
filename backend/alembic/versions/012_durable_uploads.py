"""Durable immutable uploads and tenant-scoped membership."""
import sqlalchemy as sa
from alembic import op

revision = "012_durable_uploads"
down_revision = "011_signal_urgency_value"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("uploads",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("upload_id", sa.String(64), primary_key=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("source", sa.String(512), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('staged', 'completed', 'failed')", name="ck_upload_status"))
    op.create_index("ix_upload_tenant_status_imported", "uploads", ["tenant_id", "status", "imported_at"])
    op.create_table("upload_conversations",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("upload_id", sa.String(64), primary_key=True),
        sa.Column("conversation_id", sa.String(), primary_key=True),
        sa.ForeignKeyConstraint(["tenant_id", "upload_id"], ["uploads.tenant_id", "uploads.upload_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id", "conversation_id"], ["conversations.tenant_id", "conversations.conversation_id"]))
    op.create_index("ix_upload_conversation_tenant_conversation", "upload_conversations", ["tenant_id", "conversation_id"])


def downgrade():
    op.drop_table("upload_conversations")
    op.drop_table("uploads")
