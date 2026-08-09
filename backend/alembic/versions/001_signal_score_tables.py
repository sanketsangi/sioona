"""Create signal_predictions and signal_feedback tables.

Revision ID: 001_signal_score
Revises:
Create Date: 2026-08-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_signal_score"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "signal_predictions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("signal_type", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_signal_predictions_tenant_id",
        "signal_predictions",
        ["tenant_id"],
    )
    op.create_index(
        "ix_signal_predictions_conversation_id",
        "signal_predictions",
        ["conversation_id"],
    )
    op.create_index(
        "ix_signal_predictions_signal_type",
        "signal_predictions",
        ["signal_type"],
    )
    op.create_index(
        "ix_signal_predictions_tenant_created",
        "signal_predictions",
        ["tenant_id", "created_at"],
    )

    op.create_table(
        "signal_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("signal_id", sa.Uuid(), nullable=False),
        sa.Column("feedback", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.String(), nullable=False),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["signal_id"], ["signal_predictions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("signal_id", name="uq_signal_feedback_signal_id"),
    )
    op.create_index(
        "ix_signal_feedback_tenant_id",
        "signal_feedback",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_signal_feedback_tenant_id", table_name="signal_feedback")
    op.drop_table("signal_feedback")
    op.drop_index(
        "ix_signal_predictions_tenant_created",
        table_name="signal_predictions",
    )
    op.drop_index(
        "ix_signal_predictions_signal_type",
        table_name="signal_predictions",
    )
    op.drop_index(
        "ix_signal_predictions_conversation_id",
        table_name="signal_predictions",
    )
    op.drop_index(
        "ix_signal_predictions_tenant_id",
        table_name="signal_predictions",
    )
    op.drop_table("signal_predictions")