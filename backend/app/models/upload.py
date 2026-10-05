"""Immutable tenant upload identity and durable conversation membership."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKeyConstraint, Index, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Upload(Base):
    __tablename__ = "uploads"
    __table_args__ = (
        CheckConstraint("status IN ('staged', 'completed', 'failed')", name="ck_upload_status"),
        Index("ix_upload_tenant_status_imported", "tenant_id", "status", "imported_at"),
        Index("ix_upload_recovery_scan", "status", "imported_at", "tenant_id", "upload_id"),
    )
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    upload_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    source: Mapped[str] = mapped_column(String(512), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="staged")
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UploadConversation(Base):
    __tablename__ = "upload_conversations"
    __table_args__ = (
        ForeignKeyConstraint(["tenant_id", "upload_id"], ["uploads.tenant_id", "uploads.upload_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["tenant_id", "conversation_id"], ["conversations.tenant_id", "conversations.conversation_id"]),
        Index("ix_upload_conversation_tenant_conversation", "tenant_id", "conversation_id"),
    )
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    upload_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String, primary_key=True)
