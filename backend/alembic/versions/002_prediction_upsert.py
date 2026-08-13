"""Dedupe predictions and unique (tenant, conversation, type) for upsert.

Revision ID: 002_prediction_upsert
Revises: 001_signal_score
Create Date: 2026-08-13

"""

from typing import Sequence, Union

from alembic import op

revision: str = "002_prediction_upsert"
down_revision: Union[str, None] = "001_signal_score"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep the row that has feedback, else the newest. Drop the rest.
    op.execute(
        """
        DELETE FROM signal_feedback
        WHERE signal_id IN (
            SELECT id FROM (
                SELECT p.id,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.tenant_id, p.conversation_id, p.signal_type
                        ORDER BY CASE WHEN f.id IS NOT NULL THEN 0 ELSE 1 END,
                                 p.created_at DESC
                    ) AS rn
                FROM signal_predictions p
                LEFT JOIN signal_feedback f ON f.signal_id = p.id
            ) ranked
            WHERE rn > 1
        )
        """
    )
    op.execute(
        """
        DELETE FROM signal_predictions
        WHERE id IN (
            SELECT id FROM (
                SELECT p.id,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.tenant_id, p.conversation_id, p.signal_type
                        ORDER BY CASE WHEN f.id IS NOT NULL THEN 0 ELSE 1 END,
                                 p.created_at DESC
                    ) AS rn
                FROM signal_predictions p
                LEFT JOIN signal_feedback f ON f.signal_id = p.id
            ) ranked
            WHERE rn > 1
        )
        """
    )
    op.create_unique_constraint(
        "uq_signal_predictions_tenant_conv_type",
        "signal_predictions",
        ["tenant_id", "conversation_id", "signal_type"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_signal_predictions_tenant_conv_type",
        "signal_predictions",
        type_="unique",
    )
