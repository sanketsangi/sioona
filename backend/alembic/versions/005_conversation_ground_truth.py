"""Add nullable ground_truth on conversations so labeled Eval survives hydrate.

Revision ID: 005_conversation_ground_truth
Revises: 004_prediction_acted
Create Date: 2026-08-14

JSON was the only groundTruth SoT. Taxonomy stays JSON; no signal_predictions GT.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_conversation_ground_truth"
down_revision: Union[str, None] = "004_prediction_acted"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("ground_truth", sa.String(), nullable=True),
    )
    op.create_check_constraint(
        "ck_conversations_ground_truth",
        "conversations",
        "ground_truth IS NULL OR ground_truth IN ('lead', 'retention', 'upsell', 'none')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_conversations_ground_truth",
        "conversations",
        type_="check",
    )
    op.drop_column("conversations", "ground_truth")
