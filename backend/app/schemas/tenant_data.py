"""Schemas for tenant-scoped data wipe (Reset Demo / partner deletion)."""

from pydantic import BaseModel, Field


class TenantDataWipeResponse(BaseModel):
    """Counts of rows deleted for one tenant. Never includes other tenants."""

    uploads: int = Field(ge=0)
    upload_memberships: int = Field(ge=0)
    detection_runs: int = Field(ge=0)
    conversations: int = Field(ge=0)
    messages: int = Field(ge=0)
    predictions: int = Field(ge=0)
    feedback: int = Field(ge=0)
    supervised_actions: int = Field(ge=0)
    pilot_settings: int = Field(ge=0)
    taxonomy_overrides: int = Field(ge=0)
