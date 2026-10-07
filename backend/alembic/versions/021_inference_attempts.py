"""Inference attempt ledger: one row per billable provider attempt; never stores prompt or transcript text.

Revision ID: 021_inference_attempts
Revises: 020_workspaces_memberships
Create Date: 2026-10-08

Hosted Neon was already stamped at this revision on 2026-10-08, including
ck_inference_attempts_ordinal_positive. This file matches that table.
Do not upgrade hosted Neon from an agent session.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021_inference_attempts"
down_revision: Union[str, None] = "020_workspaces_memberships"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inference_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.String(64), nullable=False),
        sa.Column("logical_operation_id", sa.String(64), nullable=False),
        sa.Column("attempt_ordinal", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=True),
        sa.Column("detection_run_id", sa.String(64), nullable=True),
        sa.Column("job_id", sa.String(64), nullable=True),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("route_version", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("prompt_version", sa.String(128), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error_category", sa.String(32), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("provider_request_id", sa.String(128), nullable=True),
        sa.Column("usage_status", sa.String(16), nullable=False),
        sa.Column("input_tokens", sa.BigInteger(), nullable=True),
        sa.Column("cached_input_tokens", sa.BigInteger(), nullable=True),
        sa.Column("output_tokens", sa.BigInteger(), nullable=True),
        sa.Column("reasoning_tokens", sa.BigInteger(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rate_version", sa.String(64), nullable=True),
        sa.Column("estimated_cost_usd", sa.Numeric(14, 8), nullable=True),
        sa.Column("cost_status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "attempt_id", name="uq_inference_attempts_tenant_attempt"),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'timeout', 'cancelled')",
            name="ck_inference_attempts_status",
        ),
        sa.CheckConstraint(
            "usage_status IN ('reported', 'estimated', 'unknown')",
            name="ck_inference_attempts_usage_status",
        ),
        sa.CheckConstraint(
            "cost_status IN ('estimated', 'reconciled', 'unknown')",
            name="ck_inference_attempts_cost_status",
        ),
        sa.CheckConstraint(
            "attempt_ordinal >= 1",
            name="ck_inference_attempts_ordinal_positive",
        ),
        sa.CheckConstraint(
            "COALESCE(input_tokens, 0) >= 0 AND COALESCE(cached_input_tokens, 0) >= 0"
            " AND COALESCE(output_tokens, 0) >= 0 AND COALESCE(reasoning_tokens, 0) >= 0",
            name="ck_inference_attempts_tokens_nonnegative",
        ),
    )
    op.create_index("ix_inference_attempts_tenant_started", "inference_attempts", ["tenant_id", "started_at"])
    op.create_index("ix_inference_attempts_tenant_run", "inference_attempts", ["tenant_id", "detection_run_id"])


def downgrade() -> None:
    op.drop_index("ix_inference_attempts_tenant_run", table_name="inference_attempts")
    op.drop_index("ix_inference_attempts_tenant_started", table_name="inference_attempts")
    op.drop_table("inference_attempts")
