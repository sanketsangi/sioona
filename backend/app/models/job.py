"""D9 bounded outbox reference; source text stays in canonical tables."""

from datetime import datetime
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "upload_id"], ["uploads.tenant_id", "uploads.upload_id"]
        ),
        CheckConstraint("job_type IN ('upload', 'detect')", name="ck_jobs_type"),
        CheckConstraint(
            "status IN ('queued','leased','succeeded','failed','cancelled','dead_lettered')",
            name="ck_jobs_status",
        ),
        CheckConstraint(
            "attempt_count >= 0 AND max_attempts BETWEEN 1 AND 3 AND attempt_count <= max_attempts",
            name="ck_jobs_attempts",
        ),
        CheckConstraint(
            "lease_token >= 0 AND cursor >= 0 AND conversation_count BETWEEN 1 AND 1000 AND cursor <= conversation_count",
            name="ck_jobs_cursor",
        ),
        CheckConstraint(
            "length(config_sha256) = 64 AND length(conversation_ids_sha256) = 64",
            name="ck_jobs_digests",
        ),
        CheckConstraint(
            "status != 'leased' OR (lease_owner IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL)",
            name="ck_jobs_lease",
        ),
        Index(
            "ix_jobs_claim",
            "tenant_id",
            "status",
            "run_after",
            "priority",
            "created_at",
        ),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_type: Mapped[str] = mapped_column(String(16), nullable=False)
    upload_id: Mapped[str] = mapped_column(String(64), nullable=False)
    conversation_ids_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    conversation_count: Mapped[int] = mapped_column(Integer, nullable=False)
    config_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="queued", server_default="queued"
    )
    priority: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    max_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3, server_default="3"
    )
    cursor: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    run_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    lease_owner: Mapped[str | None] = mapped_column(String(128))
    lease_token: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    leased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_category: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
