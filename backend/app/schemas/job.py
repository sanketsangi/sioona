"""Bounded canonical input. Outbox stores only digests and an upload reference."""

from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.ingestion import Ingestion


class JobUpload(Ingestion):
    model_config = ConfigDict(extra="forbid")
    detections: list = Field(default_factory=list, max_length=0)

    @model_validator(mode="after")
    def identities(self):
        ids = [c.conversation_id for c in self.conversations]
        mids = [m.message_id for c in self.conversations for m in c.messages]
        if len(ids) != len(set(ids)) or len(mids) != len(set(mids)):
            raise ValueError("Duplicate canonical identity")
        if self.files:
            file_ids = [cid for f in self.files for cid in f.conversation_ids]
            if len(set(file_ids)) != len(file_ids) or set(file_ids) != set(ids):
                raise ValueError("Files must partition the imported corpus")
        return self


class DetectJobIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conversation_ids: list[str] = Field(min_length=1, max_length=1000)
    request_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")

    @model_validator(mode="after")
    def bounded_ids(self):
        if any(not cid.strip() or len(cid) > 256 for cid in self.conversation_ids):
            raise ValueError("Invalid conversation reference")
        if len(set(self.conversation_ids)) != len(self.conversation_ids):
            raise ValueError("Duplicate conversation reference")
        return self


class HistoricalDetectJobIn(DetectJobIn):
    conversation_ids: list[str] = Field(min_length=1, max_length=10000)
