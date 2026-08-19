"""Schemas for tenant pilot settings (baseline + weekly export count)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PilotSettingsUpsert(BaseModel):
    """Full replace of pilot fields for a tenant."""

    baseline_opportunities: int = Field(default=0, ge=0)
    baseline_note: str | None = None
    weekly_export_count: int | None = Field(default=None, ge=0)
    last_uploaded_file_name: str | None = None

    @field_validator("baseline_note")
    @classmethod
    def trim_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @field_validator("last_uploaded_file_name")
    @classmethod
    def trim_filename(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class PilotSettingsResponse(BaseModel):
    """Stored pilot settings returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: str
    baseline_opportunities: int
    baseline_note: str | None
    weekly_export_count: int | None
    last_uploaded_file_name: str | None
    created_at: datetime
    updated_at: datetime
