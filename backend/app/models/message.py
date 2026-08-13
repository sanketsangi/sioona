"""ORM model for persisted chat messages (durable chats slice 1).

``conversation_id`` is the JSON store conversation id (string), matching
``signal_predictions`` — no FK this slice. Upsert key: (tenant_id, message_id).
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

MESSAGE_ROLE_CUSTOMER = "customer"
MESSAGE_ROLE_AGENT = "agent"
MESSAGE_ROLE_SYSTEM = "system"
MESSAGE_ROLES = frozenset(
    {MESSAGE_ROLE_CUSTOMER, MESSAGE_ROLE_AGENT, MESSAGE_ROLE_SYSTEM}
)


class Message(Base):
    """A tenant-scoped chat message. Upsert key: (tenant_id, message_id)."""

    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "message_id",
            name="uq_messages_tenant_message_id",
        ),
        CheckConstraint(
            "role IN ('customer', 'agent', 'system')",
            name="ck_messages_role",
        ),
        Index("ix_messages_tenant_id", "tenant_id"),
        Index("ix_messages_conversation_id", "conversation_id"),
        Index("ix_messages_message_id", "message_id"),
        Index("ix_messages_tenant_conversation", "tenant_id", "conversation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    conversation_id: Mapped[str] = mapped_column(String, nullable=False)
    message_id: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
