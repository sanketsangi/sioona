"""Index signal_feedback by tenant and reviewed_at for week-window scores.

Revision ID: 008_feedback_reviewed_at
Revises: 007_pilot_upload_name
Create Date: 2026-09-27

Week SignalScore filters ``signal_feedback`` on tenant_id + reviewed_at.
Score formula is unchanged.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008_feedback_reviewed_at"
down_revision: Union[str, None] = "007_pilot_upload_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_signal_feedback_tenant_reviewed_at",
        "signal_feedback",
        ["tenant_id", "reviewed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_signal_feedback_tenant_reviewed_at",
        table_name="signal_feedback",
    )
