"""Request/response schemas for the inference attempt ledger. Never includes text."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

InferenceStage = Literal["screen", "detect", "verify", "action_draft", "report"]
InferenceStatus = Literal["pending", "succeeded", "failed", "timeout", "cancelled"]
UsageStatus = Literal["reported", "estimated", "unknown"]
CostStatus = Literal["estimated", "reconciled", "unknown"]
GroupBy = Literal["day", "model", "stage", "run"]


class InferenceAttemptIn(BaseModel):
    """One attempt row from the web buffer. Prompt/transcript text is rejected."""

    attempt_id: str = Field(min_length=1, max_length=64)
    logical_operation_id: str = Field(min_length=1, max_length=64)
    attempt_ordinal: int = Field(ge=1, le=10_000)
    tenant_id: str = Field(min_length=1, max_length=256)
    conversation_id: str | None = Field(default=None, max_length=256)
    detection_run_id: str | None = Field(default=None, max_length=64)
    job_id: str | None = Field(default=None, max_length=64)
    stage: InferenceStage
    route_version: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=128)
    prompt_version: str = Field(min_length=1, max_length=128)
    status: InferenceStatus
    error_category: str | None = Field(default=None, max_length=32)
    http_status: int | None = Field(default=None, ge=100, le=599)
    provider_request_id: str | None = Field(default=None, max_length=128)
    usage_status: UsageStatus
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    latency_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    started_at: datetime
    finished_at: datetime | None = None

    @field_validator(
        "attempt_id",
        "logical_operation_id",
        "tenant_id",
        "conversation_id",
        "detection_run_id",
        "job_id",
        "route_version",
        "provider",
        "model",
        "prompt_version",
        "error_category",
        "provider_request_id",
        mode="before",
    )
    @classmethod
    def strip_strings(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def usage_consistency(self) -> InferenceAttemptIn:
        if self.usage_status == "unknown":
            if any(
                value is not None
                for value in (
                    self.input_tokens,
                    self.cached_input_tokens,
                    self.output_tokens,
                    self.reasoning_tokens,
                )
            ):
                raise ValueError("unknown usage cannot carry token counts")
        if self.status != "pending" and self.finished_at is None:
            raise ValueError("finalized attempts require finished_at")
        if (
            self.cached_input_tokens is not None
            and self.input_tokens is not None
            and self.cached_input_tokens > self.input_tokens
        ):
            raise ValueError("cached_input_tokens cannot exceed input_tokens")
        return self


class InferenceAttemptBatch(BaseModel):
    attempts: list[InferenceAttemptIn] = Field(min_length=1, max_length=500)


class InferenceAttemptOut(BaseModel):
    id: UUID
    tenant_id: str
    attempt_id: str
    logical_operation_id: str
    attempt_ordinal: int
    conversation_id: str | None
    detection_run_id: str | None
    job_id: str | None
    stage: str
    route_version: str
    provider: str
    model: str
    prompt_version: str
    status: str
    error_category: str | None
    http_status: int | None
    provider_request_id: str | None
    usage_status: str
    input_tokens: int | None
    cached_input_tokens: int | None
    output_tokens: int | None
    reasoning_tokens: int | None
    latency_ms: int | None
    started_at: datetime
    finished_at: datetime | None
    rate_version: str | None
    estimated_cost_usd: Decimal | None
    cost_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InferenceAttemptBatchResult(BaseModel):
    accepted: int = Field(ge=0)
    inserted: int = Field(ge=0)
    unchanged: int = Field(ge=0)
    attempts: list[InferenceAttemptOut]


class InferenceUsageBucket(BaseModel):
    key: str
    attempts: int = Field(ge=0)
    succeeded: int = Field(ge=0)
    failed: int = Field(ge=0)
    timeout: int = Field(ge=0)
    cancelled: int = Field(ge=0)
    pending: int = Field(ge=0)
    reported_input_tokens: int | None = None
    reported_output_tokens: int | None = None
    unknown_usage_count: int = Field(ge=0)
    estimated_cost_usd: Decimal | None = None
    unknown_cost_count: int = Field(ge=0)


class InferenceUsageResponse(BaseModel):
    tenant_id: str
    group_by: GroupBy
    from_ts: datetime = Field(alias="from")
    to_ts: datetime = Field(alias="to")
    buckets: list[InferenceUsageBucket]

    model_config = {"populate_by_name": True}


class DetectionRunInferenceResponse(BaseModel):
    tenant_id: str
    detection_run_id: str
    attempts: int = Field(ge=0)
    succeeded: int = Field(ge=0)
    failed: int = Field(ge=0)
    timeout: int = Field(ge=0)
    cancelled: int = Field(ge=0)
    pending: int = Field(ge=0)
    reported_input_tokens: int | None = None
    reported_output_tokens: int | None = None
    unknown_usage_count: int = Field(ge=0)
    estimated_cost_usd: Decimal | None = None
    unknown_cost_count: int = Field(ge=0)
    rows: list[InferenceAttemptOut]
