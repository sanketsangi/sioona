"""Provider attempts and explicit zero-cost cache hits; no prompt/transcript text."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

INFERENCE_STAGES = frozenset(
    {"screen", "detect", "verify", "action_draft", "report"}
)
INFERENCE_STATUSES = frozenset(
    {"pending", "succeeded", "failed", "timeout", "cancelled"}
)
FINALIZED_INFERENCE_STATUSES = frozenset(
    {"succeeded", "failed", "timeout", "cancelled"}
)
USAGE_STATUSES = frozenset({"reported", "estimated", "unknown"})
COST_STATUSES = frozenset({"estimated", "reconciled", "unknown"})


class InferenceAttempt(Base):
    """One provider attempt or cache hit. Additive; wipe only on tenant delete."""

    __tablename__ = "inference_attempts"
    __table_args__ = (
        CheckConstraint("NOT cache_hit OR (status = 'succeeded' AND usage_status = 'reported' AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND cached_input_tokens IS NOT NULL AND reasoning_tokens IS NOT NULL AND estimated_cost_usd IS NOT NULL AND input_tokens = 0 AND output_tokens = 0 AND cached_input_tokens = 0 AND reasoning_tokens = 0 AND estimated_cost_usd = 0 AND cost_status = 'reconciled' AND provider_request_id IS NULL)", name="ck_inference_cache_hit"),
        UniqueConstraint(
            "tenant_id",
            "attempt_id",
            name="uq_inference_attempts_tenant_attempt",
        ),
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'timeout', 'cancelled')",
            name="ck_inference_attempts_status",
        ),
        CheckConstraint(
            "usage_status IN ('reported', 'estimated', 'unknown')",
            name="ck_inference_attempts_usage_status",
        ),
        CheckConstraint(
            "cost_status IN ('estimated', 'reconciled', 'unknown')",
            name="ck_inference_attempts_cost_status",
        ),
        CheckConstraint(
            "COALESCE(input_tokens, 0) >= 0 AND COALESCE(cached_input_tokens, 0) >= 0"
            " AND COALESCE(output_tokens, 0) >= 0 AND COALESCE(reasoning_tokens, 0) >= 0",
            name="ck_inference_attempts_tokens_nonnegative",
        ),
        CheckConstraint(
            "attempt_ordinal >= 1",
            name="ck_inference_attempts_ordinal_positive",
        ),
        Index("ix_inference_attempts_tenant_started", "tenant_id", "started_at"),
        Index("ix_inference_attempts_tenant_run", "tenant_id", "detection_run_id"),
        Index("ix_inference_attempts_job_conversation", "tenant_id", "job_id", "conversation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    attempt_id: Mapped[str] = mapped_column(String(64), nullable=False)
    logical_operation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    attempt_ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    conversation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    detection_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    route_version: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(128), nullable=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    error_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    usage_status: Mapped[str] = mapped_column(String(16), nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cached_input_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    reasoning_tokens: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rate_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 8), nullable=True
    )
    cost_status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
