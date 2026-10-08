"""ORM model for stored signal predictions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    JSON,
    String,
    Text,
    Uuid,
    false,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.signal_evidence import SignalEvidence
    from app.models.signal_feedback import SignalFeedback

EVIDENCE_VALID = "valid"
EVIDENCE_UNRESOLVED = "unresolved"
EVIDENCE_STALE = "stale"
EVIDENCE_STATUSES = frozenset(
    {EVIDENCE_VALID, EVIDENCE_UNRESOLVED, EVIDENCE_STALE}
)

# Pilot SignalScore types only — junk / legacy names must not enter the tally.
CANONICAL_SIGNAL_TYPES = frozenset({"lead", "retention", "upsell"})

OUTCOME_RETAINED = "retained"
OUTCOME_CHURNED = "churned"
OUTCOME_CONVERTED = "converted"
OUTCOME_NO_CHANGE = "no_change"
OUTCOME_UNKNOWN = "unknown"
SIGNAL_OUTCOMES = frozenset(
    {
        OUTCOME_RETAINED,
        OUTCOME_CHURNED,
        OUTCOME_CONVERTED,
        OUTCOME_NO_CHANGE,
        OUTCOME_UNKNOWN,
    }
)
# Retention signals whose rupee value is still "found" (saved or not yet known).
REVENUE_AT_RISK_OUTCOMES = frozenset(
    {OUTCOME_RETAINED, OUTCOME_CHURNED, OUTCOME_UNKNOWN}
)
# Any canonical type: money the reviewer says was kept or won.
REVENUE_SAVED_OUTCOMES = frozenset({OUTCOME_RETAINED, OUTCOME_CONVERTED})


class SignalPrediction(Base):
    """A model prediction for a conversation signal."""

    __tablename__ = "signal_predictions"
    __table_args__ = (
        Index("uq_signal_predictions_active_tenant_conv_type", "tenant_id", "conversation_id", "signal_type",
              unique=True, postgresql_where=text("active = true"), sqlite_where=text("active = 1")),
        Index("ix_signal_predictions_tenant_id", "tenant_id"),
        Index("ix_prediction_tenant_active_id", "tenant_id", "active", "id"),
        Index("ix_signal_predictions_conversation_id", "conversation_id"),
        Index("ix_signal_predictions_signal_type", "signal_type"),
        Index("ix_signal_predictions_tenant_created", "tenant_id", "created_at"),
        CheckConstraint(
            "outcome IS NULL OR outcome IN "
            "('retained', 'churned', 'converted', 'no_change', 'unknown')",
            name="ck_signal_predictions_outcome",
        ),
        CheckConstraint(
            "evidence_status IS NULL OR evidence_status IN ('valid', 'unresolved', 'stale')",
            name="ck_signal_predictions_evidence_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    detection_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    conversation_id: Mapped[str] = mapped_column(String, nullable=False)
    signal_type: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    urgency: Mapped[str | None] = mapped_column(String, nullable=True)
    urgency_timeframe: Mapped[str | None] = mapped_column(String, nullable=True)
    mentioned_value_inr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commercial_value_evidence: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    evidence_status: Mapped[str | None] = mapped_column(String, nullable=True)
    acted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=false(),
    )
    outcome: Mapped[str | None] = mapped_column(String, nullable=True)
    outcome_value_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome_recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
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
    evidence_anchors: Mapped[list[SignalEvidence]] = relationship(
        "SignalEvidence",
        back_populates="prediction",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )