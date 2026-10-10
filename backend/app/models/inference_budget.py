"""Budget admission metadata only; never stores provider payloads."""
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class InferenceControl(Base):
    __tablename__ = "inference_controls"
    __table_args__ = (CheckConstraint("daily_attempt_limit > 0 AND run_attempt_limit > 0", name="ck_controls_positive_limits"), CheckConstraint("mode IN ('attempts', 'usd')", name="ck_controls_mode"), CheckConstraint("(scope = 'global' AND tenant_id IS NULL) OR (scope <> 'global' AND tenant_id IS NOT NULL AND scope = tenant_id)", name="ck_controls_tenant_scope"),)
    scope: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(String)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str] = mapped_column(String(200), default="unconfigured")
    daily_attempt_limit: Mapped[int] = mapped_column(Integer, default=1)
    run_attempt_limit: Mapped[int] = mapped_column(Integer, default=1)
    mode: Mapped[str] = mapped_column(String(16), default="attempts")
    limit_usd: Mapped[Decimal | None] = mapped_column(Numeric(14, 8))
    updated_by: Mapped[str] = mapped_column(String)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class InferenceBudget(Base):
    __tablename__ = "inference_budgets"
    __table_args__ = (CheckConstraint("attempts >= 0 AND reserved_usd >= 0 AND spent_usd >= 0", name="ck_budget_nonnegative"),)
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    budget_day: Mapped[date] = mapped_column(Date, primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    reserved_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=Decimal(0))
    spent_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=Decimal(0))

class InferenceRunBudget(Base):
    __tablename__ = "inference_run_budgets"
    __table_args__ = (CheckConstraint("attempts >= 0", name="ck_run_budget_nonnegative"),)
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)

class InferenceReservation(Base):
    __tablename__ = "inference_reservations"
    __table_args__ = (CheckConstraint("status IN ('authorized', 'settled')", name="ck_reservation_status"),)
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(64))
    budget_day: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="authorized")
    reserved_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8), default=Decimal(0))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
