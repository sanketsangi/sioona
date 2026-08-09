"""ORM model for human feedback on signal predictions.

Legacy Next.js label mapping (docs only; APIs use these values):
  accept → correct
  reject → incorrect
  wrong_reason → partially_correct
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.signal_prediction import SignalPrediction

# Canonical feedback labels for Signal Score.
FEEDBACK_CORRECT = "correct"
FEEDBACK_INCORRECT = "incorrect"
FEEDBACK_PARTIALLY_CORRECT = "partially_correct"
FEEDBACK_LABELS = frozenset(
    {FEEDBACK_CORRECT, FEEDBACK_INCORRECT, FEEDBACK_PARTIALLY_CORRECT}
)


class SignalFeedback(Base):
    """Human review of a signal prediction. Never hard-delete rows."""

    __tablename__ = "signal_feedback"
    __table_args__ = (
        UniqueConstraint("signal_id", name="uq_signal_feedback_signal_id"),
        Index("ix_signal_feedback_tenant_id", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    signal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("signal_predictions.id"),
        nullable=False,
    )
    feedback: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str] = mapped_column(String, nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    prediction: Mapped[SignalPrediction] = relationship(
        "SignalPrediction",
        back_populates="feedback",
    )