"""Add acted flag on signal_predictions so Shadow Mode Acted survives hydrate.

Revision ID: 004_prediction_acted
Revises: 003_conversations_messages
Create Date: 2026-08-14

JSON was the only Acted SoT. Feedback already lives on signal_feedback.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_prediction_acted"
down_revision: Union[str, None] = "003_conversations_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "signal_predictions",
        sa.Column(
            "acted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("signal_predictions", "acted")
