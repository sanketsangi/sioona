"""Schemas for durable conversations and messages."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MessageRole = Literal["customer", "agent", "system"]


class MessageUpsert(BaseModel):
    """One message inside a conversation upsert."""

    message_id: str = Field(..., min_length=1)
    role: MessageRole
    content: str = Field(..., min_length=1)
    timestamp: datetime


class ConversationUpsert(BaseModel):
    """Upsert one conversation (and optional nested messages)."""

    conversation_id: str = Field(..., min_length=1)
    channel: str = Field(..., min_length=1)
    customer_name: str | None = None
    started_at: datetime
    external_id: str | None = None
    # str (not Literal) so invalid values reach the service as 400, not 422.
    ground_truth: str | None = None
    clear_ground_truth: bool = False
    messages: list[MessageUpsert] = Field(default_factory=list)


class ConversationGroundTruthPatch(BaseModel):
    """Dedicated GT mutation. ``null`` is the explicit Unset clear."""

    ground_truth: str | None


class ConversationBulkUpsert(BaseModel):
    """Bulk upsert — Partner Demo ~41 conversations in one request."""

    conversations: list[ConversationUpsert] = Field(default_factory=list)


class MessageResponse(BaseModel):
    """Stored message returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: str
    conversation_id: str
    message_id: str
    role: str
    content: str
    timestamp: datetime
    created_at: datetime


class ConversationResponse(BaseModel):
    """Stored conversation returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: str
    conversation_id: str
    channel: str
    customer_name: str | None
    started_at: datetime
    external_id: str | None
    ground_truth: str | None
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse] = Field(default_factory=list)


class ConversationBulkResponse(BaseModel):
    """Bulk upsert result with per-row conversations and counts."""

    conversations: list[ConversationResponse]
    created: int
    updated: int
    messages_created: int
    messages_updated: int


class ConversationDeleteResponse(BaseModel):
    """Result of deleting one tenant-scoped conversation."""

    deleted: bool


class ConversationPruneRequest(BaseModel):
    """Keep these conversation_ids; delete the rest for this tenant."""

    keep_conversation_ids: list[str] = Field(default_factory=list)


class ConversationPruneResponse(BaseModel):
    """How many tenant conversations were dropped vs kept."""

    deleted: int
    kept: int
