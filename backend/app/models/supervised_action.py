"""ORM model for human decisions on supervised drafts.

Separate from ``signal_feedback``. Keyed by tenant + conversation + action
type so a production ``sig_neon_<uuid>`` row matches a laptop ``sig_*`` row.
Nothing is sent.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

ACTION_LEAD_OUTREACH = "lead_outreach_draft"
ACTION_UPSELL_NOTE = "upsell_note_draft"
ACTION_RETENTION_EMAIL = "retention_email_draft"
ACTION_RETENTION_FOLLOWUP = "retention_followup_draft"
SUPERVISED_ACTION_TYPES = frozenset(
    {
        ACTION_LEAD_OUTREACH,
        ACTION_UPSELL_NOTE,
        ACTION_RETENTION_EMAIL,
        ACTION_RETENTION_FOLLOWUP,
    }
)

DECISION_APPROVED = "approved"
DECISION_EDITED = "edited"
DECISION_DISMISSED = "dismissed"
SUPERVISED_ACTION_STATUSES = frozenset(
    {DECISION_APPROVED, DECISION_EDITED, DECISION_DISMISSED}
)


class SupervisedActionDecision(Base):
    """Human Approve / Edit / Dismiss on one draft. Never hard-delete in review."""

    __tablename__ = "supervised_action_decisions"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "conversation_id",
            "action_type",
            name="uq_supervised_action_tenant_conv_type",
        ),
        CheckConstraint(
            "action_type IN ("
            "'lead_outreach_draft', 'upsell_note_draft', "
            "'retention_email_draft', 'retention_followup_draft')",
            name="ck_supervised_action_type",
        ),
        CheckConstraint(
            "status IN ('approved', 'edited', 'dismissed')",
            name="ck_supervised_action_status",
        ),
        Index("ix_supervised_action_decisions_tenant_id", "tenant_id"),
        Index(
            "ix_supervised_action_decisions_tenant_conv",
            "tenant_id",
            "conversation_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    conversation_id: Mapped[str] = mapped_column(String, nullable=False)
    action_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
