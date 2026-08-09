"""ORM model for stored signal predictions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.signal_feedback import SignalFeedback


class SignalPrediction(Base):
    """A model prediction for a conversation signal."""

    __tablename__ = "signal_predictions"
    __table_args__ = (
        Index("ix_signal_predictions_tenant_id", "tenant_id"),
        Index("ix_signal_predictions_conversation_id", "conversation_id"),
        Index("ix_signal_predictions_signal_type", "signal_type"),
        Index("ix_signal_predictions_tenant_created", "tenant_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    conversation_id: Mapped[str] = mapped_column(String, nullable=False)
    signal_type: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    feedback: Mapped[SignalFeedback | None] = relationship(
        "SignalFeedback",
        back_populates="prediction",
        uselist=False,
    )