"""One durable receipt per published upload that may advance the weekly counter."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WeeklyUploadReceipt(Base):
    """Idempotency key for a publication's weekly-file increment.

    The receipt is inserted in the same transaction as the counter change.
    A replay of ``receipt_id`` finds this row and adds zero.
    """

    __tablename__ = "weekly_upload_receipts"
    __table_args__ = (
        CheckConstraint(
            "weekly_file_count >= 0",
            name="ck_weekly_upload_receipts_count",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    receipt_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    weekly_file_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
