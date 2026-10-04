from typing import Annotated, Literal
from pydantic import BaseModel, Field, model_serializer, model_validator

class DetectionOutput(BaseModel):
    signal_type: Literal["lead", "retention", "upsell"]
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(min_length=1, max_length=4000)
    evidence: list[Annotated[str, Field(min_length=1, max_length=4000)]] = Field(default_factory=list, max_length=10)
    urgency: Literal["high", "medium", "low"] | None = None
    urgency_timeframe: str | None = Field(default=None, max_length=512)
    mentioned_value_inr: int | None = Field(default=None, ge=0, le=2147483647)

    @model_serializer(mode="wrap")
    def serialize_output(self, handler):
        result = handler(self)
        # Preserve prior immutable request digests when optional metadata is absent.
        for key in ("urgency", "urgency_timeframe", "mentioned_value_inr"):
            if result.get(key) is None:
                result.pop(key, None)
        return result


class TranscriptCoverage(BaseModel):
    included_turns: int = Field(ge=0, le=1000000)
    omitted_turns: int = Field(ge=0, le=1000000)
    truncated: bool
    token_upper_bound: int = Field(ge=0, le=10000000)
    token_budget: int = Field(gt=0, le=10000000)

    @model_validator(mode="after")
    def consistent(self):
        if self.truncated != (self.omitted_turns > 0):
            raise ValueError("truncation must match omitted turns")
        if self.token_upper_bound > self.token_budget:
            raise ValueError("included transcript exceeds token budget")
        return self


class ConversationDetection(BaseModel):
    conversation_id: str = Field(min_length=1, max_length=256)
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    model_version: str = Field(min_length=1, max_length=128)
    prompt_version: str = Field(min_length=1, max_length=128)
    output: list[DetectionOutput] = Field(max_length=3)
    coverage: TranscriptCoverage | None = None

    @model_serializer(mode="wrap")
    def serialize_detection(self, handler):
        result = handler(self)
        if result.get("coverage") is None:
            result.pop("coverage", None)
        return result


class DetectionPublication(BaseModel):
    conversations: list[ConversationDetection] = Field(min_length=1, max_length=1000)


