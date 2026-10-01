"""Taxonomy override payloads."""

from pydantic import BaseModel, Field


class TaxonomyTypeOverride(BaseModel):
    phrases: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    negative_phrases: list[str] = Field(default_factory=list)


class TaxonomyOverridesBody(BaseModel):
    """Full snapshot. Missing types are cleared."""

    lead: TaxonomyTypeOverride | None = None
    retention: TaxonomyTypeOverride | None = None
    upsell: TaxonomyTypeOverride | None = None


class TaxonomyOverridesResponse(BaseModel):
    tenant_id: str
    overrides: dict[str, TaxonomyTypeOverride]
