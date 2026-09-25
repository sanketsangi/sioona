"""Schemas for human signal feedback."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

FeedbackLabel = Literal["correct", "incorrect", "partially_correct"]


class FeedbackCreate(BaseModel):
    """Payload to submit or update human feedback on a signal."""

    feedback: FeedbackLabel
    reviewed_by: str = Field(..., min_length=1)
    note: str | None = None
    reviewed_at: datetime | None = None
    if_absent: bool = False


class FeedbackResponse(BaseModel):
    """Stored feedback returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: str
    signal_id: UUID
    feedback: FeedbackLabel
    note: str | None
    reviewed_by: str
    reviewed_at: datetime