"""Outcomes, taxonomy overrides, and prediction→conversation FK.

Revision ID: 010_outcomes_taxonomy_fk
Revises: 009_supervised_actions
Create Date: 2026-10-01

Outcome columns feed the revenue-leak totals on Eval.
Taxonomy overrides survive the ephemeral JSON store.
The foreign key is Postgres-only: SQLite tests insert predictions
without a conversation row and keep ``PRAGMA foreign_keys=ON``.
Orphan predictions are backfilled as stub conversations before the
constraint is added (``ON DELETE RESTRICT``).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_outcomes_taxonomy_fk"
down_revision: Union[str, None] = "009_supervised_actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "signal_predictions",
        sa.Column("outcome", sa.String(), nullable=True),
    )
    op.add_column(
        "signal_predictions",
        sa.Column("outcome_value_inr", sa.Float(), nullable=True),
    )
    op.add_column(
        "signal_predictions",
        sa.Column("outcome_recorded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_signal_predictions_outcome",
        "signal_predictions",
        "outcome IS NULL OR outcome IN "
        "('retained', 'churned', 'converted', 'no_change', 'unknown')",
    )
    op.create_table(
        "taxonomy_overrides",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("signal_type", sa.String(), nullable=False),
        sa.Column("phrases", sa.JSON(), nullable=False),
        sa.Column("keywords", sa.JSON(), nullable=False),
        sa.Column("negative_phrases", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "signal_type",
            name="uq_taxonomy_overrides_tenant_type",
        ),
    )
    op.create_index(
        "ix_taxonomy_overrides_tenant_id",
        "taxonomy_overrides",
        ["tenant_id"],
    )

    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        INSERT INTO conversations (
            id, tenant_id, conversation_id, channel, customer_name,
            started_at, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            p.tenant_id,
            p.conversation_id,
            'unknown',
            NULL,
            now(),
            now(),
            now()
        FROM (
            SELECT DISTINCT tenant_id, conversation_id
            FROM signal_predictions
        ) AS p
        WHERE NOT EXISTS (
            SELECT 1 FROM conversations AS c
            WHERE c.tenant_id = p.tenant_id
              AND c.conversation_id = p.conversation_id
        )
        """
    )
    op.create_foreign_key(
        "fk_signal_predictions_conversation",
        "signal_predictions",
        "conversations",
        ["tenant_id", "conversation_id"],
        ["tenant_id", "conversation_id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_constraint(
            "fk_signal_predictions_conversation",
            "signal_predictions",
            type_="foreignkey",
        )
    op.drop_index("ix_taxonomy_overrides_tenant_id", table_name="taxonomy_overrides")
    op.drop_table("taxonomy_overrides")
    op.drop_constraint(
        "ck_signal_predictions_outcome",
        "signal_predictions",
        type_="check",
    )
    op.drop_column("signal_predictions", "outcome_recorded_at")
    op.drop_column("signal_predictions", "outcome_value_inr")
    op.drop_column("signal_predictions", "outcome")
