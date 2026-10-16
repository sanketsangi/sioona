"""Typed, text-free tenant economics dashboard contract."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class UnavailableMetric(BaseModel):
    status: Literal["unavailable"] = "unavailable"
    reason: str


class MeasuredMetric(BaseModel):
    status: Literal["available"] = "available"
    value: float
    unit: str
    samples: int = Field(ge=0)
    reason: str


class QualityByType(BaseModel):
    signal_type: str
    reviewed: int = Field(ge=0)
    correct: int = Field(ge=0)
    acceptance_rate: float | None = Field(default=None, ge=0, le=1)


class FunnelPanel(BaseModel):
    ingested: int = Field(ge=0)
    processed: int = Field(ge=0)
    surfaced: int = Field(ge=0)
    reviewed: int = Field(ge=0)
    correct: int = Field(ge=0)
    acted: int = Field(ge=0)
    positive_outcomes: int = Field(ge=0)
    influenced_value_inr: Decimal
    denominators: dict[str, int | None]
    definitions: dict[str, str]


class QualityPanel(BaseModel):
    signal_score: float | None = Field(default=None, ge=0, le=1)
    reviewed: int = Field(ge=0)
    correct: int = Field(ge=0)
    incorrect: int = Field(ge=0)
    partially_correct: int = Field(ge=0)
    false_positive_rate: float | None = Field(default=None, ge=0, le=1)
    evidence_valid: int = Field(ge=0)
    evidence_unresolved: int = Field(ge=0)
    evidence_stale: int = Field(ge=0)
    evidence_failure_rate: float | None = Field(default=None, ge=0, le=1)
    abstained: int = Field(ge=0)
    abstention_rate: float | None = Field(default=None, ge=0, le=1)
    by_signal_type: list[QualityByType]
    gold_set_precision: UnavailableMetric
    gold_set_recall: UnavailableMetric
    calibration: UnavailableMetric


class ReliabilityPanel(BaseModel):
    jobs_by_status: dict[str, int]
    recovered_jobs: int = Field(ge=0)
    queue_depth: int = Field(ge=0)
    oldest_queue_age_seconds: int | None = Field(default=None, ge=0)
    attempts_by_status: dict[str, int]
    retry_or_fallback_attempts: int = Field(ge=0)
    retry_rate: float | None = Field(default=None, ge=0, le=1)
    http_429_attempts: int = Field(ge=0)
    error_rate: float | None = Field(default=None, ge=0, le=1)
    unfinished_attempts: int = Field(ge=0)
    p50_latency_ms: float | None = Field(default=None, ge=0)
    p95_latency_ms: float | None = Field(default=None, ge=0)
    p50_processing_latency_ms: float | None = Field(default=None, ge=0)
    p95_processing_latency_ms: float | None = Field(default=None, ge=0)
    ledger_flush_failures: MeasuredMetric | UnavailableMetric
    reservation_drift: MeasuredMetric | UnavailableMetric
    database_latency: MeasuredMetric | UnavailableMetric
    connector_errors: MeasuredMetric | UnavailableMetric


class CostProjection(BaseModel):
    conversations: int = Field(gt=0)
    estimated_cost_usd: Decimal | None = None
    status: Literal["available", "unavailable"]
    incomplete: bool


class EconomicsPanel(BaseModel):
    attempts: int = Field(ge=0)
    input_tokens: int = Field(ge=0)
    cached_input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    unknown_usage_count: int = Field(ge=0)
    unknown_usage_rate: float | None = Field(default=None, ge=0, le=1)
    unknown_cost_count: int = Field(ge=0)
    unknown_cost_rate: float | None = Field(default=None, ge=0, le=1)
    known_cost_coverage: float | None = Field(default=None, ge=0, le=1)
    estimated_cost_usd: Decimal
    reconciled_cost_usd: Decimal
    known_cost_usd: Decimal
    cost_per_processed_conversation_usd: Decimal | None = None
    cost_per_surfaced_signal_usd: Decimal | None = None
    cost_per_correct_signal_usd: Decimal | None = None
    cost_per_acted_signal_usd: Decimal | None = None
    projections: list[CostProjection]


class DashboardAlert(BaseModel):
    key: str
    label: str
    status: Literal["ok", "warning", "alert", "unavailable"]
    owner: str
    runbook: str
    detail: str


class EconomicsDashboardResponse(BaseModel):
    tenant_id: str
    from_ts: datetime
    to_ts: datetime
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    cost_currency: Literal["USD"] = "USD"
    influenced_value_currency: Literal["INR"] = "INR"
    funnel: FunnelPanel
    quality: QualityPanel
    reliability: ReliabilityPanel
    economics: EconomicsPanel
    alerts: list[DashboardAlert]
