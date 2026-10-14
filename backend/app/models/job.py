"""Durable reference-only detection outbox. No transcript payloads."""
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "kind", "upload_id", "config_sha256", "conversation_digest", name="uq_jobs_identity"),
        CheckConstraint("status IN ('queued','leased','succeeded','failed','cancelled','dead_lettered')", name="ck_jobs_status"),
        CheckConstraint("kind = 'detection'", name="ck_jobs_kind"),
        CheckConstraint("attempt_count >= 0 AND max_attempts BETWEEN 1 AND 3 AND attempt_count <= max_attempts", name="ck_jobs_attempts"),
        CheckConstraint("lease_token >= 0 AND cursor >= 0", name="ck_jobs_cursor_token"),
        CheckConstraint("length(config_sha256) = 64 AND length(conversation_digest) = 64", name="ck_jobs_digests"),
        CheckConstraint("(status = 'leased' AND lease_owner IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL) OR (status <> 'leased' AND lease_owner IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL)", name="ck_jobs_lease"),
        Index("ix_jobs_claim", "tenant_id", "status", "run_after", "priority", "created_at"),
    )
    tenant_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, server_default="detection")
    upload_id: Mapped[str] = mapped_column(String(128), nullable=False)
    config_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    conversation_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="queued")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="3")
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    lease_owner: Mapped[str | None] = mapped_column(String(128))
    lease_token: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    leased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cursor: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_error_category: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
