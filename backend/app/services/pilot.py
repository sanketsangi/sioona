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
    last_uploaded_file_name: str | None = None,
    update_scope: str = "all",
) -> PilotSettings:
    """Insert or update the single pilot_settings row for tenant_id."""
    from app.services.tenant_lock import lock_tenant_corpus
    lock_tenant_corpus(db, tenant_id)
    baseline = max(0, int(baseline_opportunities))
    note = baseline_note.strip() if baseline_note and baseline_note.strip() else None
    count = (
        max(0, int(weekly_export_count))
        if weekly_export_count is not None
        else None
    )
    filename = (
        last_uploaded_file_name.strip()
        if last_uploaded_file_name and last_uploaded_file_name.strip()
        else None
    )

    def locked_row() -> PilotSettings | None:
        return db.scalar(select(PilotSettings).where(
            PilotSettings.tenant_id == tenant_id
        ).with_for_update().execution_options(populate_existing=True))

    def apply(row: PilotSettings) -> None:
        if update_scope != "upload":
            row.baseline_opportunities = baseline
            row.baseline_note = note
        if update_scope != "baseline":
            row.weekly_export_count = count
            row.last_uploaded_file_name = filename

    existing = locked_row()
    if existing is not None:
        apply(existing)
        db.commit()
        db.refresh(existing)
        return existing

    row = PilotSettings(
        tenant_id=tenant_id,
        baseline_opportunities=baseline,
        baseline_note=note,
        weekly_export_count=count if update_scope != "baseline" else None,
        last_uploaded_file_name=filename if update_scope != "baseline" else None,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = locked_row()
        if raced is None:
            raise
        apply(raced)
        db.commit()
        db.refresh(raced)
        return raced

    db.refresh(row)
    return row
