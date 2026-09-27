"""Store supervised draft decisions so production Insights can show them.

Revision ID: 009_supervised_actions
Revises: 008_feedback_reviewed_at
Create Date: 2026-09-28

Approve / Edit / Dismiss survive Vercel ``/tmp``. Unique on
tenant + conversation + action type. Nothing is sent.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_supervised_actions"
down_revision: Union[str, None] = "008_feedback_reviewed_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "supervised_action_decisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("evidence_quote", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "decided_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action_type IN ("
            "'lead_outreach_draft', 'upsell_note_draft', "
            "'retention_email_draft', 'retention_followup_draft')",
            name="ck_supervised_action_type",
        ),
        sa.CheckConstraint(
            "status IN ('approved', 'edited', 'dismissed')",
            name="ck_supervised_action_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "conversation_id",
            "action_type",
            name="uq_supervised_action_tenant_conv_type",
        ),
    )
    op.create_index(
        "ix_supervised_action_decisions_tenant_id",
        "supervised_action_decisions",
        ["tenant_id"],
    )
    op.create_index(
        "ix_supervised_action_decisions_tenant_conv",
        "supervised_action_decisions",
        ["tenant_id", "conversation_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_supervised_action_decisions_tenant_conv",
        table_name="supervised_action_decisions",
    )
    op.drop_index(
        "ix_supervised_action_decisions_tenant_id",
        table_name="supervised_action_decisions",
    )
    op.drop_table("supervised_action_decisions")
