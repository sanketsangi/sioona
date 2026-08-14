"""Add pilot_settings so weeklyExportCount + Eval baseline survive /tmp wipe.

Revision ID: 006_pilot_settings
Revises: 005_conversation_ground_truth
Create Date: 2026-08-14

One row per tenant. Taxonomy stays JSON; no history table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_pilot_settings"
down_revision: Union[str, None] = "005_conversation_ground_truth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pilot_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column(
            "baseline_opportunities",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("baseline_note", sa.Text(), nullable=True),
        sa.Column("weekly_export_count", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "baseline_opportunities >= 0",
            name="ck_pilot_settings_baseline_opportunities",
        ),
        sa.CheckConstraint(
            "weekly_export_count IS NULL OR weekly_export_count >= 0",
            name="ck_pilot_settings_weekly_export_count",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_pilot_settings_tenant_id"),
    )
    op.create_index(
        "ix_pilot_settings_tenant_id",
        "pilot_settings",
        ["tenant_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_pilot_settings_tenant_id", table_name="pilot_settings")
    op.drop_table("pilot_settings")
