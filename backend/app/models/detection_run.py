"""Immutable per-conversation classification output and provenance."""
from datetime import datetime
from sqlalchemy import DateTime, Index, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class DetectionRun(Base):
    __tablename__ = "detection_runs"
    __table_args__ = (Index("ix_detection_run_tenant_conversation", "tenant_id", "conversation_id", "created_at"),)
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String, primary_key=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model_version: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    output: Mapped[list] = mapped_column(JSON, nullable=False)
    coverage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
