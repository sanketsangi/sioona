"""Bounded recovery of interrupted, durably staged ingestion requests."""
from datetime import datetime, timedelta, timezone
from app.services.ingestion import IngestionError, resume_ingestion
from sqlalchemy import select, update, exists
from sqlalchemy.orm import Session
from app.models.upload import Upload
from app.models.job import Job


def recover_staged_ingestions(db: Session, *, limit: int = 20,
                              grace_seconds: int = 300, now: datetime | None = None) -> dict[str, int]:
    if not 1 <= limit <= 100 or grace_seconds < 0:
        raise ValueError("Recovery requires a limit of 1..100 and a nonnegative grace period")
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(seconds=grace_seconds)
    # Failed operations require explicit investigation/resume; do not retry them forever.
    candidates = list(db.execute(select(Upload.tenant_id, Upload.upload_id).where(
        Upload.status == "staged", Upload.payload.is_not(None),
        ~exists(select(Job.id).where(Job.tenant_id == Upload.tenant_id, Job.upload_id == Upload.upload_id)), Upload.imported_at <= cutoff)
        .order_by(Upload.imported_at, Upload.tenant_id, Upload.upload_id).limit(limit)).all())
    db.rollback()  # Release the scan transaction before tenant publication locks.
    counts = {"attempted": 0, "completed": 0, "failed": 0}
    for tenant_id, upload_id in candidates:
        counts["attempted"] += 1
        try:
            resume_ingestion(db, tenant_id=tenant_id, upload_id=upload_id)
            counts["completed"] += 1
        except IngestionError as exc:
            db.rollback()
            if exc.status_code < 500:
                db.execute(update(Upload).where(Upload.tenant_id == tenant_id,
                    Upload.upload_id == upload_id, Upload.status == "staged").values(status="failed"))
                db.commit()
            counts["failed"] += 1
        finally:
            db.rollback()  # Clear response reads before processing another tenant.
    return counts
