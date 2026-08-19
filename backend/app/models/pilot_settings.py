"""ORM model for tenant pilot settings (2-week Shadow Mode cadence + Eval baseline).

One row per tenant. JSON ``store.pilot`` mirrors this for UI SoT when the file
exists; Neon survives Vercel ``/tmp`` wipe.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PilotSettings(Base):
    """Tenant-scoped pilot baseline + weekly export counter. Upsert key: tenant_id."""

    __tablename__ = "pilot_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_pilot_settings_tenant_id"),
        CheckConstraint(
            "baseline_opportunities >= 0",
            name="ck_pilot_settings_baseline_opportunities",
        ),
        CheckConstraint(
            "weekly_export_count IS NULL OR weekly_export_count >= 0",
            name="ck_pilot_settings_weekly_export_count",
        ),
        Index("ix_pilot_settings_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    baseline_opportunities: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    baseline_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    weekly_export_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    last_uploaded_file_name: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
