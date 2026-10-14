from typing import Annotated
from pydantic import BaseModel, Field, model_serializer, model_validator
from app.schemas.conversation import ConversationUpsert, MessageUpsert
from app.schemas.detection_run import ConversationDetection


class IngestionMessage(MessageUpsert):
    message_id: str = Field(min_length=1, max_length=256)
    content: str = Field(min_length=1, max_length=262144)


class IngestionConversation(ConversationUpsert):
    conversation_id: str = Field(min_length=1, max_length=256)
    channel: str = Field(min_length=1, max_length=64)
    customer_name: str | None = Field(default=None, max_length=512)
    external_id: str | None = Field(default=None, max_length=512)
    messages: list[IngestionMessage] = Field(default_factory=list, max_length=10000)


class IngestionFile(BaseModel):
    source: str = Field(min_length=1, max_length=512)
    conversation_ids: list[str] = Field(min_length=1, max_length=1000)
    counts_as_weekly: bool = False

    @model_serializer(mode="wrap")
    def serialize_file(self, handler):
        result = handler(self)
        if not result.get("counts_as_weekly"):
            result.pop("counts_as_weekly", None)
        return result


class Ingestion(BaseModel):
    source: str = Field(min_length=1, max_length=512)
    replace: bool = False
    append_only: bool = False
    record_upload_metadata: bool = False
    expected_content_hashes: dict[Annotated[str, Field(min_length=1, max_length=256)],
        Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None] | None = Field(default=None, max_length=1000)
    conversations: list[IngestionConversation] = Field(min_length=1, max_length=1000)
    detections: list[ConversationDetection] = Field(min_length=1, max_length=1000)


    files: list[IngestionFile] | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def bounded_transcripts(self):
        if self.append_only and self.replace:
            raise ValueError("Append-only ingestion cannot replace the corpus")
        if self.expected_content_hashes is not None:
            chats = {chat.conversation_id: chat for chat in self.conversations}
            if (not self.append_only or not self.expected_content_hashes
                    or any(cid not in chats or chats[cid].channel != "intercom"
                           for cid in self.expected_content_hashes)):
                raise ValueError("Revision preconditions require append-only Intercom conversations")
        total_messages = 0
        total_bytes = 0
        for chat in self.conversations:
            total_messages += len(chat.messages)
            if total_messages > 100000:
                raise ValueError("Upload exceeds 100000 messages")
            for message in chat.messages:
                size = len(message.content.encode("utf-8"))
                if size > 262144:
                    raise ValueError("Message exceeds 256 KiB of UTF-8 text")
                total_bytes += size
                if total_bytes > 16 * 1024 * 1024:
                    raise ValueError("Upload exceeds 16 MiB of transcript text")
        return self

    @model_serializer(mode="wrap")
    def serialize_request(self, handler):
        result = handler(self)
        if not result.get("append_only"):
            result.pop("append_only", None)
        if not result.get("record_upload_metadata"):
            result.pop("record_upload_metadata", None)
        if result.get("files") is None:
            result.pop("files", None)
        if result.get("expected_content_hashes") is None:
            result.pop("expected_content_hashes", None)
        return result
