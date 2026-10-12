"""Schemas for the tenant detection resume cursor."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


ConversationId = Annotated[str, Field(min_length=1, max_length=256)]


class DetectionResumeUpsert(BaseModel):
    """Full replace of the chats still waiting for classification."""

    failed_conversation_ids: list[ConversationId] = Field(max_length=5000)
    skipped_conversation_ids: list[ConversationId] = Field(max_length=5000)


class DetectionResumeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: str
    failed_conversation_ids: list[str]
    skipped_conversation_ids: list[str]
    updated_at: datetime
