"""Service for tenant pilot settings (one row per tenant)."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.pilot_settings import PilotSettings


def get_pilot_settings(db: Session, tenant_id: str) -> PilotSettings | None:
    """Return the tenant's pilot row, or None if never written."""
    return db.scalar(
        select(PilotSettings).where(PilotSettings.tenant_id == tenant_id)
    )


def upsert_pilot_settings(
    db: Session,
    *,
    tenant_id: str,
    baseline_opportunities: int,
    baseline_note: str | None = None,
    weekly_export_count: int | None = None,
) -> PilotSettings:
    """Insert or update the single pilot_settings row for tenant_id."""
    baseline = max(0, int(baseline_opportunities))
    note = baseline_note.strip() if baseline_note and baseline_note.strip() else None
    count = (
        max(0, int(weekly_export_count))
        if weekly_export_count is not None
        else None
    )

    existing = get_pilot_settings(db, tenant_id)
    if existing is not None:
        existing.baseline_opportunities = baseline
        existing.baseline_note = note
        existing.weekly_export_count = count
        db.commit()
        db.refresh(existing)
        return existing

    row = PilotSettings(
        tenant_id=tenant_id,
        baseline_opportunities=baseline,
        baseline_note=note,
        weekly_export_count=count,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = get_pilot_settings(db, tenant_id)
        if raced is None:
            raise
        raced.baseline_opportunities = baseline
        raced.baseline_note = note
        raced.weekly_export_count = count
        db.commit()
        db.refresh(raced)
        return raced

    db.refresh(row)
    return row
