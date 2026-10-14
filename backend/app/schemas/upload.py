"""Validated upload identity and membership API contract."""
from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field


class UploadPublish(BaseModel):
    replace: bool = False
    source: str = Field(min_length=1, max_length=512)
    content_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    conversation_ids: list[str] = Field(min_length=1, max_length=10000)


class UploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    tenant_id: str
    upload_id: str
    source: str
    content_sha256: str
    status: str
    imported_at: datetime


class UploadMembership(BaseModel):
    upload: UploadResponse
    conversation_ids: list[str]


class PublishedConversationLookup(BaseModel):
    include_content_hashes: bool = False
    conversation_ids: list[Annotated[str, Field(min_length=1, max_length=256)]] = Field(min_length=1, max_length=50)
