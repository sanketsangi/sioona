"""Schemas for signal predictions."""

from datetime import datetime
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
    created_at: datetime


class PredictionBulkResponse(BaseModel):
    """Bulk upsert result with per-row predictions and counts."""

    predictions: list[PredictionResponse]
    created: int
    updated: int


class PredictionWithFeedbackResponse(PredictionResponse):
    """Prediction plus optional human feedback (hydrate / reviewed list)."""

    feedback: FeedbackResponse | None = None
