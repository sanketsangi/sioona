"""Per-tenant taxonomy phrase overrides. Neon is the durable copy."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class TaxonomyOverride(Base):
    """One signal type's Adapt phrases for a tenant."""

    __tablename__ = "taxonomy_overrides"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "signal_type",
            name="uq_taxonomy_overrides_tenant_type",
        ),
        Index("ix_taxonomy_overrides_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    signal_type: Mapped[str] = mapped_column(String, nullable=False)
    phrases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    keywords: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    negative_phrases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
