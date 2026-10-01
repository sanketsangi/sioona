"""Schemas for signal predictions."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.feedback import FeedbackResponse

CanonicalSignalType = Literal["lead", "retention", "upsell"]


class PredictionCreate(BaseModel):
    """Payload to record a model prediction."""

    conversation_id: str = Field(..., min_length=1)
    signal_type: CanonicalSignalType
    confidence: float = Field(..., ge=0.0, le=1.0)
    summary: str = Field(..., min_length=1)


class PredictionBulkUpsert(BaseModel):
    """Bulk upsert — Partner Demo / ingest dual-write (~50–100 signals)."""

    predictions: list[PredictionCreate] = Field(default_factory=list)


class PredictionActedUpdate(BaseModel):
    """Shadow Mode: persist Acted on a reviewed prediction."""

    acted: bool


SignalOutcomeLabel = Literal[
    "retained", "churned", "converted", "no_change", "unknown"
]


class PredictionOutcomeUpdate(BaseModel):
    """What happened after the signal, for the revenue-leak totals."""

    outcome: SignalOutcomeLabel
    value_inr: float | None = Field(default=None, ge=0)
    recorded_on: date | None = None


class PredictionResponse(BaseModel):
    """Stored prediction returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: str
    conversation_id: str
    signal_type: str
    confidence: float
    summary: str
    acted: bool = False
    outcome: str | None = None
    outcome_value_inr: float | None = None
    outcome_recorded_at: datetime | None = None
    created_at: datetime


class PredictionBulkResponse(BaseModel):
    """Bulk upsert result with per-row predictions and counts."""

    predictions: list[PredictionResponse]
    created: int
    updated: int


class PredictionWithFeedbackResponse(PredictionResponse):
    """Prediction plus optional human feedback (hydrate / reviewed list)."""

    feedback: FeedbackResponse | None = None
