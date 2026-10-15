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
        UniqueConstraint("tenant_id", "id", name="uq_supervised_action_tenant_id"),
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

# Draft decisions remain the review authority; execution requires a separate,
# exact, expiring approval for one immutable proposal version.
from sqlalchemy import ForeignKeyConstraint, Integer, JSON


class ActionProposal(Base):
    __tablename__ = 'action_proposals'
    __table_args__ = (
        ForeignKeyConstraint(['tenant_id','decision_id'], ['supervised_action_decisions.tenant_id','supervised_action_decisions.id']),
        CheckConstraint("action_type = 'intercom_internal_note'", name='ck_external_action_type'),
        UniqueConstraint('tenant_id', 'decision_id', 'action_version', name='uq_action_proposal_version'),
        CheckConstraint('action_version > 0 AND length(payload_sha256) = 64', name='ck_action_proposal_version'),
        CheckConstraint("state IN ('proposed','superseded')", name='ck_action_proposal_state'),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    decision_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    action_version: Mapped[int] = mapped_column(Integer)
    action_type: Mapped[str] = mapped_column(String(32), default='intercom_internal_note')
    target: Mapped[str] = mapped_column(String(128))
    payload_json: Mapped[dict] = mapped_column(JSON)
    payload_sha256: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(16), default='proposed')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ActionExecution(Base):
    __tablename__ = 'action_executions'
    __table_args__ = (
        ForeignKeyConstraint(['tenant_id','proposal_id'], ['action_proposals.tenant_id','action_proposals.id']),
        UniqueConstraint('tenant_id','proposal_id', name='uq_action_execution_proposal'),
        CheckConstraint("state IN ('approved','attempted','succeeded','failed','unknown')", name='ck_action_execution_state'),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    proposal_id: Mapped[str] = mapped_column(String(36))
    payload_sha256: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(128))
    actor_id: Mapped[str] = mapped_column(String(36))
    action_version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(16), default='approved')
    provider_receipt: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
