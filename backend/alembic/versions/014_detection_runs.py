"""Versioned detection output with historical predictions retained."""
import sqlalchemy as sa
from alembic import op
revision = "014_detection_runs"
down_revision = "013_pilot_requests"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("detection_runs",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("run_id", sa.String(64), primary_key=True),
        sa.Column("conversation_id", sa.String(), primary_key=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("model_version", sa.String(128), nullable=False),
        sa.Column("prompt_version", sa.String(128), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("output", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_detection_run_tenant_conversation", "detection_runs", ["tenant_id", "conversation_id", "created_at"])
    with op.batch_alter_table("signal_predictions") as batch:
        batch.add_column(sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("detection_run_id", sa.String(64), nullable=True))
        batch.drop_constraint("uq_signal_predictions_tenant_conv_type", type_="unique")
    op.create_index("uq_signal_predictions_active_tenant_conv_type", "signal_predictions", ["tenant_id", "conversation_id", "signal_type"], unique=True,
                    postgresql_where=sa.text("active = true"), sqlite_where=sa.text("active = 1"))


def downgrade():
    # Historical duplicate keys cannot be collapsed without deleting audit data.
    raise RuntimeError("Detection revision downgrade requires an explicit archival migration")
