"""ORM model for persisted conversations (durable chats slice 1).

JSON store ids live in ``conversation_id`` (string). No FK from
``signal_predictions.conversation_id`` this slice.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

GROUND_TRUTH_LEAD = "lead"
GROUND_TRUTH_RETENTION = "retention"
GROUND_TRUTH_UPSELL = "upsell"
GROUND_TRUTH_NONE = "none"
GROUND_TRUTH_VALUES = frozenset(
    {
        GROUND_TRUTH_LEAD,
        GROUND_TRUTH_RETENTION,
        GROUND_TRUTH_UPSELL,
        GROUND_TRUTH_NONE,
    }
)


class Conversation(Base):
    """A tenant-scoped chat thread. Upsert key: (tenant_id, conversation_id)."""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "conversation_id",
            name="uq_conversations_tenant_conversation_id",
        ),
        CheckConstraint(
            "ground_truth IS NULL OR ground_truth IN "
            "('lead', 'retention', 'upsell', 'none')",
            name="ck_conversations_ground_truth",
        ),
        Index("ix_conversations_tenant_id", "tenant_id"),
        Index("ix_conversations_conversation_id", "conversation_id"),
        Index("ix_conversations_tenant_started", "tenant_id", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    conversation_id: Mapped[str] = mapped_column(String, nullable=False)
    channel: Mapped[str] = mapped_column(String, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    external_id: Mapped[str | None] = mapped_column(String, nullable=True)
    ground_truth: Mapped[str | None] = mapped_column(String, nullable=True)
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
