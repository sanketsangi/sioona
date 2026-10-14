"""Immutable historical references, paged independently of source text."""
from sqlalchemy import Boolean, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class JobConversation(Base):
    __tablename__ = "job_conversations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "job_id", "ordinal", name="uq_job_conversations_ordinal"),
        ForeignKeyConstraint(["tenant_id", "job_id"], ["jobs.tenant_id", "jobs.id"]),
        Index("ix_job_conversations_page", "tenant_id", "job_id", "completed", "ordinal"),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    job_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    context_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
