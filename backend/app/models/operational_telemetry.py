"""Text-free operational receipts; sample IDs make retries idempotent."""
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, Float, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class OperationalSample(Base):
    __tablename__ = "operational_samples"
    __table_args__ = (
        CheckConstraint("kind IN ('ledger_flush_failure','database_query')", name="ck_operational_kind"),
        CheckConstraint("duration_ms >= 0 AND duration_ms <= 3600000", name="ck_operational_duration"),
        Index("ix_operational_window", "tenant_id", "observed_at", "kind"),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    sample_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), primary_key=True)
    duration_ms: Mapped[float] = mapped_column(Float, default=0)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
