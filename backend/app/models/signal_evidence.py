"""Persisted quote anchors. Reconstruction reads these rows; it does not invent text."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.signal_prediction import SignalPrediction


class SignalEvidence(Base):
    """One reconstructed span for a prediction.

    ``message_id`` is not a foreign key. Removing a message leaves the anchor
    so the quote becomes unavailable instead of disappearing.
    """

    __tablename__ = "signal_evidence"
    __table_args__ = (
        UniqueConstraint(
            "prediction_id",
            "message_id",
            "start_cp",
            "end_cp",
            name="uq_signal_evidence_span",
        ),
        CheckConstraint(
            "start_cp >= 0 AND end_cp > start_cp",
            name="ck_signal_evidence_span",
        ),
        CheckConstraint(
            "candidate_turns >= 1",
            name="ck_signal_evidence_candidate_turns",
        ),
        CheckConstraint(
            "length(text_sha256) = 64",
            name="ck_signal_evidence_text_sha256",
        ),
        Index("ix_signal_evidence_tenant_prediction", "tenant_id", "prediction_id"),
        Index("ix_signal_evidence_tenant_message", "tenant_id", "message_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    prediction_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("signal_predictions.id", ondelete="CASCADE"),
        nullable=False,
    )
    message_id: Mapped[str] = mapped_column(String, nullable=False)
    start_cp: Mapped[int] = mapped_column(Integer, nullable=False)
    end_cp: Mapped[int] = mapped_column(Integer, nullable=False)
    text_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    candidate_turns: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    prediction: Mapped[SignalPrediction] = relationship(
        "SignalPrediction",
        back_populates="evidence_anchors",
    )
