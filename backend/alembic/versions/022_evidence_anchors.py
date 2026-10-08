"""Additive evidence anchors. Message hashes stay separate from upload digests.

Revision ID: 022_evidence_anchors
Revises: 021_inference_attempts
Create Date: 2026-10-08

``messages.content_sha256`` and ``signal_predictions.evidence_status`` are
nullable so existing rows stay valid. ``signal_evidence.message_id`` is a
string, not a foreign key: deleting a message must not delete anchors.
Deleting a prediction removes only that prediction's anchors.

Deploy order: run ``alembic upgrade`` to ``022_evidence_anchors`` before
the API that SELECTs these columns. Revision ``021_inference_attempts``
does not have them; that app revision 500s prediction list/review reads.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "022_evidence_anchors"
down_revision: Union[str, None] = "021_inference_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_messages_content_sha256",
        "messages",
        "content_sha256 IS NULL OR length(content_sha256) = 64",
    )
    op.add_column(
        "signal_predictions",
        sa.Column("evidence_status", sa.String(), nullable=True),
    )
    op.create_check_constraint(
        "ck_signal_predictions_evidence_status",
        "signal_predictions",
        "evidence_status IS NULL OR evidence_status IN ('valid', 'unresolved', 'stale')",
    )
    op.create_table(
        "signal_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("prediction_id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("start_cp", sa.Integer(), nullable=False),
        sa.Column("end_cp", sa.Integer(), nullable=False),
        sa.Column("text_sha256", sa.String(length=64), nullable=False),
        sa.Column("candidate_turns", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["prediction_id"],
            ["signal_predictions.id"],
            name="fk_signal_evidence_prediction",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "prediction_id",
            "message_id",
            "start_cp",
            "end_cp",
            name="uq_signal_evidence_span",
        ),
        sa.CheckConstraint(
            "start_cp >= 0 AND end_cp > start_cp",
            name="ck_signal_evidence_span",
        ),
        sa.CheckConstraint(
            "candidate_turns >= 1",
            name="ck_signal_evidence_candidate_turns",
        ),
        sa.CheckConstraint(
            "length(text_sha256) = 64",
            name="ck_signal_evidence_text_sha256",
        ),
    )
    op.create_index(
        "ix_signal_evidence_tenant_prediction",
        "signal_evidence",
        ["tenant_id", "prediction_id"],
    )
    op.create_index(
        "ix_signal_evidence_tenant_message",
        "signal_evidence",
        ["tenant_id", "message_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_signal_evidence_tenant_message",
        table_name="signal_evidence",
    )
    op.drop_index(
        "ix_signal_evidence_tenant_prediction",
        table_name="signal_evidence",
    )
    op.drop_table("signal_evidence")
    op.drop_constraint(
        "ck_signal_predictions_evidence_status",
        "signal_predictions",
        type_="check",
    )
    op.drop_column("signal_predictions", "evidence_status")
    op.drop_constraint(
        "ck_messages_content_sha256",
        "messages",
        type_="check",
    )
    op.drop_column("messages", "content_sha256")
