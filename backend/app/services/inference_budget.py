"""Atomic admission: policy-row locking serializes tenant daily/run accounting.

Authorization conservatively consumes allowance before provider dispatch. No
expiry sweep refunds ambiguous or dispatched attempts. Unknown usage is not zero.
"""
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.inference_budget import InferenceControl, InferenceBudget, InferenceRunBudget, InferenceReservation
from app.services.inference_rates import lookup_rate

class BudgetDenied(ValueError):
    pass

def budget_day(now: datetime | None = None):
    return (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("Asia/Kolkata")).date()

def configure(db: Session, tenant: str, daily: int, run: int, enabled: bool, reason: str, actor: str):
    if daily <= 0 or run <= 0:
        raise BudgetDenied("invalid_limits")
    row = db.scalar(select(InferenceControl).where(InferenceControl.scope == tenant).with_for_update())
    if row is None:
        row = InferenceControl(scope=tenant)
        db.add(row)
    row.tenant_id = None if tenant == "global" else tenant
    row.daily_attempt_limit, row.run_attempt_limit = daily, run
    row.enabled, row.reason, row.updated_by = enabled, reason, actor
    row.mode = "attempts"
    db.flush()
    return row

def _globally_paused(db: Session) -> bool:
    # Column select, not the mapped row: a second read must see a pause that
    # committed after the first, instead of the identity-map copy.
    enabled = db.scalar(select(InferenceControl.enabled).where(InferenceControl.scope == "global"))
    return enabled is not None and not enabled

def ai_enabled(db: Session, tenant: str) -> bool:
    """Fresh control reads only; cache reuse never reserves provider spend.

    Both scopes must be explicitly configured and enabled. Column projections
    avoid stale ORM identity-map state after an operator changes a control.
    """
    global_enabled = db.scalar(select(InferenceControl.enabled).where(
        InferenceControl.scope == "global", InferenceControl.tenant_id.is_(None)))
    tenant_enabled = db.scalar(select(InferenceControl.enabled).where(
        InferenceControl.scope == tenant, InferenceControl.tenant_id == tenant))
    return global_enabled is True and tenant_enabled is True


def reserve(db: Session, tenant: str, attempt: str, run: str, provider: str, model: str,
            *, input_bytes: int = 0, now: datetime | None = None):
    # The global pause is a read. Locking it serialized every admission behind one row.
    if _globally_paused(db):
        raise BudgetDenied("paused")
    policy = db.scalar(select(InferenceControl).where(InferenceControl.scope == tenant, InferenceControl.tenant_id == tenant).with_for_update())
    if policy is None:
        raise BudgetDenied("unconfigured")
    if not policy.enabled:
        raise BudgetDenied("paused")
    if db.get(InferenceReservation, (tenant, attempt)) is not None:
        raise BudgetDenied("already_authorized")
    day = budget_day(now)
    daily = db.get(InferenceBudget, (tenant, day))
    if daily is None:
        daily = InferenceBudget(tenant_id=tenant, budget_day=day, attempts=0, reserved_usd=Decimal(0), spent_usd=Decimal(0))
        db.add(daily)
    run_row = db.get(InferenceRunBudget, (tenant, run))
    if run_row is None:
        run_row = InferenceRunBudget(tenant_id=tenant, run_id=run, attempts=0)
        db.add(run_row)
    if daily.attempts >= policy.daily_attempt_limit:
        raise BudgetDenied("daily_limit")
    if run_row.attempts >= policy.run_attempt_limit:
        raise BudgetDenied("run_limit")
    estimate = Decimal(0)
    if policy.mode != "attempts":
        # Dollar mode is deliberately unavailable until rates AND an approved,
        # eval-validated output ceiling are recorded. No inferred dollar limits.
        raise BudgetDenied("usd_not_ready")
    # The unlocked read above can be stale by the time this lock is held.
    if _globally_paused(db):
        raise BudgetDenied("paused")
    daily.attempts += 1
    daily.reserved_usd += estimate
    run_row.attempts += 1
    row = InferenceReservation(tenant_id=tenant, attempt_id=attempt, run_id=run, budget_day=day,
        status="authorized", reserved_usd=estimate)
    db.add(row)
    db.flush()
    return row

def estimate_reservation(provider: str, model: str, input_bytes: int, output_ceiling: int | None, approved: bool) -> Decimal:
    rate = lookup_rate(provider, model)
    if not approved or rate is None or output_ceiling is None or output_ceiling <= 0 or input_bytes < 0:
        raise BudgetDenied("usd_not_ready")
    # UTF-8 byte count is a conservative input token upper bound.
    return (Decimal(input_bytes) * rate.input_per_mtok + Decimal(output_ceiling) * rate.output_per_mtok) / Decimal(1_000_000)

def settle(db: Session, tenant: str, attempt: str):
    policy = db.scalar(select(InferenceControl).where(InferenceControl.scope == tenant, InferenceControl.tenant_id == tenant).with_for_update())
    if policy is None:
        raise BudgetDenied("unconfigured")
    row = db.get(InferenceReservation, (tenant, attempt))
    if row is None:
        raise BudgetDenied("reservation_missing")
    if row.status == "authorized":
        daily = db.get(InferenceBudget, (tenant, row.budget_day))
        if daily is None or daily.reserved_usd < row.reserved_usd:
            raise BudgetDenied("reservation_drift")
        daily.reserved_usd -= row.reserved_usd
    row.status = "settled"
    db.flush()
    return row
