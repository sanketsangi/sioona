"""Tenant-scoped detection resume cursor. One row per tenant."""

from datetime import datetime

from sqlalchemy import DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DetectionResume(Base):
    """Chats a capped or failed detection run still owes this tenant."""

    __tablename__ = "detection_resume"

    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    failed_conversation_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    skipped_conversation_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
