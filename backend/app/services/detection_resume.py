"""One resume cursor per tenant. A stale writer merges failed ids."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.detection_resume import DetectionResume


def _ordered(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in ids:
        item = value.strip()
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _same_instant(stored: datetime, expected: datetime) -> bool:
    return _as_utc(stored) == _as_utc(expected)


def _union(existing: list[str], incoming: list[str]) -> list[str]:
    return _ordered([*existing, *incoming])


def _locked_resume(db: Session, tenant_id: str) -> DetectionResume | None:
    return db.scalar(
        select(DetectionResume)
        .where(DetectionResume.tenant_id == tenant_id)
        .with_for_update()
    )


def get_detection_resume(db: Session, tenant_id: str) -> DetectionResume | None:
    return db.scalar(select(DetectionResume).where(DetectionResume.tenant_id == tenant_id))


def _apply_cursor(
    existing: DetectionResume,
    failed: list[str],
    skipped: list[str],
    expected_updated_at: datetime | None,
    *,
    force_union: bool,
) -> None:
    stale = expected_updated_at is not None and not _same_instant(
        existing.updated_at, expected_updated_at
    )
    if force_union or stale:
        failed = _union(list(existing.failed_conversation_ids), failed)
        skipped = _union(list(existing.skipped_conversation_ids), skipped)
    existing.failed_conversation_ids = failed
    existing.skipped_conversation_ids = skipped
    existing.updated_at = datetime.now(timezone.utc)


def upsert_detection_resume(
    db: Session,
    *,
    tenant_id: str,
    failed_conversation_ids: list[str],
    skipped_conversation_ids: list[str],
    expected_updated_at: datetime | None = None,
) -> DetectionResume:
    failed = _ordered(failed_conversation_ids)
    skipped = _ordered(skipped_conversation_ids)
    now = datetime.now(timezone.utc)
    existing = _locked_resume(db, tenant_id)
    if existing is not None:
        _apply_cursor(existing, failed, skipped, expected_updated_at, force_union=False)
        db.commit()
        db.refresh(existing)
        return existing

    row = DetectionResume(
        tenant_id=tenant_id,
        failed_conversation_ids=failed,
        skipped_conversation_ids=skipped,
        updated_at=now,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = _locked_resume(db, tenant_id)
        if raced is None:
            raise
        _apply_cursor(raced, failed, skipped, expected_updated_at, force_union=True)
        db.commit()
        db.refresh(raced)
        return raced
    db.refresh(row)
    return row
