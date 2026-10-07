"""Ledger request and aggregate responses. No prompt or transcript fields."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AttemptStatus = Literal["pending", "succeeded", "failed", "timeout", "cancelled"]
UsageStatus = Literal["reported", "estimated", "unknown"]
Stage = Literal["screen", "detect", "verify", "action_draft", "report"]


class InferenceAttemptIn(BaseModel):
    attempt_id: str = Field(min_length=1, max_length=64)
    logical_operation_id: str = Field(min_length=1, max_length=64)
    attempt_ordinal: int = Field(ge=1)
    tenant_id: str | None = Field(default=None, max_length=256)
    conversation_id: str | None = Field(default=None, max_length=256)
    detection_run_id: str | None = Field(default=None, max_length=64)
    job_id: str | None = Field(default=None, max_length=64)
    stage: Stage
    route_version: str = Field(min_length=1, max_length=64)
    provider: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=128)
    prompt_version: str = Field(min_length=1, max_length=128)
    status: AttemptStatus
    error_category: str | None = Field(default=None, max_length=32)
    http_status: int | None = Field(default=None, ge=100, le=599)
    provider_request_id: str | None = Field(default=None, max_length=128)
    usage_status: UsageStatus
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    latency_ms: int | None = Field(default=None, ge=0)
    started_at: datetime
    finished_at: datetime | None = None


class InferenceAttemptBatch(BaseModel):
    attempts: list[InferenceAttemptIn] = Field(max_length=500)


class InferenceAttemptWriteResult(BaseModel):
    inserted: int
    replayed: int


class InferenceUsageGroup(BaseModel):
    provider: str | None = None
    model: str | None = None
    stage: str | None = None
    detection_run_id: str | None = None
    day: str | None = None
    attempts: int
    retries_or_fallbacks: int
    input_tokens: int | None
    output_tokens: int | None
    unknown_usage: int
    total_latency_ms: int | None
    estimated_cost_usd: str | None
    unknown_cost: int


class InferenceUsageResponse(BaseModel):
    tenant_id: str
    groups: list[InferenceUsageGroup]
