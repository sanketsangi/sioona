"""Schemas for SignalScore responses."""

from pydantic import BaseModel


class SignalScoreByType(BaseModel):
    """Per-signal-type SignalScore breakdown."""

    signal_type: str
    signal_score: float | None
    reviewed_count: int
    correct_count: int
    incorrect_count: int
    partially_correct_count: int


class SignalScoreResponse(BaseModel):
    """Overall SignalScore plus per-type breakdown."""

    tenant_id: str
    signal_score: float | None
    reviewed_count: int
    correct_count: int
    incorrect_count: int
    partially_correct_count: int
    by_signal_type: list[SignalScoreByType]