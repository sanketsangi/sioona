"""Schemas for SignalScore responses."""

from datetime import datetime

from pydantic import BaseModel, Field


class SignalScoreByType(BaseModel):
    """Per-signal-type SignalScore breakdown."""

    signal_type: str
    signal_score: float | None
    reviewed_count: int
    correct_count: int
    incorrect_count: int
    partially_correct_count: int


class SignalScoreRequest(BaseModel):
    """POST keep-set body — avoids truncating large ``conversation_id`` query lists."""

    date_from: datetime | None = None
    date_to: datetime | None = None
    signal_type: str | None = None
    conversation_ids: list[str] | None = Field(
        default=None,
        description="Keep-set ids. [] → 0 reviewed. Omitted → Neon conversations.",
    )


class SignalScoreResponse(BaseModel):
    """Overall SignalScore plus per-type breakdown."""

    tenant_id: str
    signal_score: float | None
    reviewed_count: int
    correct_count: int
    incorrect_count: int
    partially_correct_count: int
    by_signal_type: list[SignalScoreByType]