"""Schemas for supervised draft decisions. Nothing is sent."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

SupervisedActionType = Literal[
    "lead_outreach_draft",
    "upsell_note_draft",
    "retention_email_draft",
    "retention_followup_draft",
]
SupervisedActionStatus = Literal["approved", "edited", "dismissed"]


class SupervisedActionDecisionUpsert(BaseModel):
    """Create or replace the decision for one conversation + draft kind."""

    conversation_id: str = Field(..., min_length=1)
    action_type: SupervisedActionType
    status: SupervisedActionStatus
    subject: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
    evidence_quote: str = ""
    decided_at: datetime | None = None


class SupervisedActionDecisionResponse(BaseModel):
    """Stored decision returned to Insights overlay."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: str
    conversation_id: str
    action_type: SupervisedActionType
    status: SupervisedActionStatus
    subject: str
    body: str
    evidence_quote: str
    created_at: datetime
    decided_at: datetime
