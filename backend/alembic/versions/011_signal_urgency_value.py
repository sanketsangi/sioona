"""Urgency and mentioned rupee value on each prediction.

Revision ID: 011_signal_urgency_value
Revises: 010_outcomes_taxonomy_fk
Create Date: 2026-10-01

Nullable. Existing rows stay valid. Does not change SignalScore.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_signal_urgency_value"
down_revision: Union[str, None] = "010_outcomes_taxonomy_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "signal_predictions",
        sa.Column("urgency", sa.String(), nullable=True),
    )
    op.add_column(
        "signal_predictions",
        sa.Column("urgency_timeframe", sa.String(), nullable=True),
    )
    op.add_column(
        "signal_predictions",
        sa.Column("mentioned_value_inr", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("signal_predictions", "mentioned_value_inr")
    op.drop_column("signal_predictions", "urgency_timeframe")
    op.drop_column("signal_predictions", "urgency")
