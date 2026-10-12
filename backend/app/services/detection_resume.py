"""One resume cursor per tenant. Later runs replace the whole cursor."""

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


def get_detection_resume(db: Session, tenant_id: str) -> DetectionResume | None:
    return db.scalar(select(DetectionResume).where(DetectionResume.tenant_id == tenant_id))


def upsert_detection_resume(
    db: Session,
    *,
    tenant_id: str,
    failed_conversation_ids: list[str],
    skipped_conversation_ids: list[str],
) -> DetectionResume:
    failed = _ordered(failed_conversation_ids)
    skipped = _ordered(skipped_conversation_ids)
    now = datetime.now(timezone.utc)
    existing = get_detection_resume(db, tenant_id)
    if existing is not None:
        existing.failed_conversation_ids = failed
        existing.skipped_conversation_ids = skipped
        existing.updated_at = now
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
        raced = get_detection_resume(db, tenant_id)
        if raced is None:
            raise
        raced.failed_conversation_ids = failed
        raced.skipped_conversation_ids = skipped
        raced.updated_at = now
        db.commit()
        db.refresh(raced)
        return raced
    db.refresh(row)
    return row
