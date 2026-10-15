from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.ingestion import IngestionConversation

class InstallationIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    workspace_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,128}$')
    consent_reference: str = Field(pattern=r'^[A-Za-z0-9_:/.-]{1,128}$')
    monitoring_reference: str = Field(pattern=r'^[A-Za-z0-9_:/.-]{1,128}$')

class LiveEventIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    installation_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')
    workspace_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,128}$')
    event_id: str = Field(pattern=r'^[A-Za-z0-9_-]{1,128}$')
    source_id: str = Field(min_length=1, max_length=256)
    provider_object_id: str | None = Field(default=None, max_length=256)
    source_version: int = Field(ge=0, le=2147483647, strict=True)
    occurred_at: datetime
    payload_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    kind: Literal['upsert','delete','unresolved']
    conversation: IngestionConversation | None = None

    @model_validator(mode='after')
    def canonical(self):
        if self.kind == 'upsert' and (self.conversation is None or not self.conversation.messages):
            raise ValueError('canonical_conversation_required')
        if self.kind != 'upsert' and self.conversation is not None:
            raise ValueError('unexpected_conversation')
        if self.conversation and (self.conversation.channel != 'intercom' and self.conversation.channel != 'upload'):
            raise ValueError('invalid_live_channel')
        return self
