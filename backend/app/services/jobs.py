"""Transaction-owned queue operations; caller commits canonical data + outbox.

Tenant IDs here must come from verified authority or operator worker configuration.
No public endpoint accepts arbitrary job bodies. Never commit inside these helpers.
"""
from dataclasses import dataclass
from datetime import timedelta
import re
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.job import Job

LEASE_SECONDS = 90
HEARTBEAT_SECONDS = 30
ERROR_CATEGORIES = {"handler_failed", "lease_expired", "database_unavailable", "provider_unavailable", "cancelled"}


class LeaseLost(Exception):
    """No publication is allowed from this worker anymore."""


@dataclass(frozen=True)
class Lease:
    tenant_id: str
    id: str
    lease_owner: str
    lease_token: int
    attempt_count: int
    upload_id: str
    config_sha256: str
    conversation_digest: str
    cursor: int


def _postgres(db):
    if db.get_bind().dialect.name != "postgresql":
        raise RuntimeError("Durable jobs require Postgres")


def _reference(value):
    if not re.fullmatch(r"[A-Za-z0-9:_./-]{1,128}", value):
        raise ValueError("Invalid bounded reference")
    return value


def enqueue(db: Session, *, tenant_id: str, upload_id: str, config_sha256: str,
            conversation_digest: str, priority: int = 0, max_attempts: int = 3) -> Job:
    _postgres(db)
    _reference(tenant_id)
    _reference(upload_id)
    if not 1 <= max_attempts <= 3:
        raise ValueError("max_attempts must be between 1 and 3")
    if any(not re.fullmatch(r"[a-f0-9]{64}", digest) for digest in (config_sha256, conversation_digest)):
        raise ValueError("SHA256 references required")
    values = dict(tenant_id=tenant_id, upload_id=upload_id, config_sha256=config_sha256,
                  conversation_digest=conversation_digest, kind="detection")
    db.execute(insert(Job).values(**values, id=str(uuid4()), priority=priority, max_attempts=max_attempts)
               .on_conflict_do_nothing(constraint="uq_jobs_identity"))
    return db.scalar(select(Job).filter_by(**values))


def _clear_lease():
    return dict(lease_owner=None, leased_at=None, lease_expires_at=None, heartbeat_at=None)


def _retry(row, now, category):
    row.status = "dead_lettered" if row.attempt_count >= row.max_attempts else "queued"
    row.run_after = now + timedelta(seconds=min(300, 5 * 2 ** (row.attempt_count - 1)))
    row.last_error_category = category
    row.updated_at = now
    for name, value in _clear_lease().items():
        setattr(row, name, value)


def claim(db: Session, *, tenant_id: str, owner: str) -> Lease | None:
    _postgres(db)
    _reference(tenant_id)
    _reference(owner)
    # Recover in bounded batches; skip leases locked by a publisher/heartbeat.
    expired = db.scalars(select(Job).where(Job.tenant_id == tenant_id,
        Job.status == "leased", Job.lease_expires_at <= func.clock_timestamp())
        .order_by(Job.lease_expires_at).with_for_update(skip_locked=True).limit(100)
        .execution_options(populate_existing=True)).all()
    if expired:
        now = db.scalar(select(func.clock_timestamp()))
        for row in expired:
            _retry(row, now, "lease_expired")
        db.flush()
    row = db.scalar(select(Job).where(Job.tenant_id == tenant_id, Job.status == "queued",
        Job.run_after <= func.clock_timestamp(), Job.attempt_count < Job.max_attempts)
        .order_by(Job.priority.desc(), Job.created_at, Job.id)
        .with_for_update(skip_locked=True).limit(1).execution_options(populate_existing=True))
    if row is None:
        return None
    now = db.scalar(select(func.clock_timestamp()))
    row.status = "leased"
    row.attempt_count += 1
    row.lease_token += 1
    row.lease_owner = owner
    row.leased_at = row.heartbeat_at = row.updated_at = now
    row.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
    db.flush()
    return Lease(row.tenant_id, row.id, owner, row.lease_token, row.attempt_count,
                 row.upload_id, row.config_sha256, row.conversation_digest, row.cursor)


def _identity(lease):
    return (Job.tenant_id == lease.tenant_id, Job.id == lease.id,
            Job.status == "leased", Job.lease_owner == lease.lease_owner,
            Job.lease_token == lease.lease_token)


def heartbeat(db: Session, lease: Lease) -> bool:
    try:
        row = _locked(db, lease)
    except LeaseLost:
        return False
    now = db.scalar(select(func.clock_timestamp()))
    row.heartbeat_at = row.updated_at = now
    row.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
    db.flush()
    return True


def _locked(db, lease):
    _postgres(db)
    row = db.scalar(select(Job).where(*_identity(lease)).with_for_update().execution_options(populate_existing=True))
    # Recheck expiry AFTER acquiring the lock, using database wall clock.
    if row is None or row.lease_expires_at <= db.scalar(select(func.clock_timestamp())):
        raise LeaseLost()
    return row


def complete(db: Session, lease: Lease, *, publish=None, cursor: int | None = None):
    row = _locked(db, lease)
    # Callback may write canonical signals/evidence but MUST NOT commit. The row
    # lock fences reclaim/cancel until publication + completion commit together.
    if publish is not None:
        publish(db)
    if cursor is not None:
        if cursor < row.cursor:
            raise ValueError("Cursor cannot move backwards")
        row.cursor = cursor
    row.status = "succeeded"
    row.last_error_category = None
    row.updated_at = db.scalar(select(func.clock_timestamp()))
    for name, value in _clear_lease().items():
        setattr(row, name, value)
    db.flush()


def fail(db: Session, lease: Lease, *, category: str, retryable: bool = True):
    if category not in ERROR_CATEGORIES:
        raise ValueError("Unrecognized error category")
    row = _locked(db, lease)
    _retry(row, db.scalar(select(func.clock_timestamp())), category)
    if not retryable:
        row.status = "failed"
    db.flush()


def cancel(db: Session, *, tenant_id: str, job_id: str) -> bool:
    _postgres(db)
    result = db.execute(update(Job).where(Job.tenant_id == tenant_id, Job.id == job_id,
        Job.status.in_(("queued", "leased"))).values(status="cancelled", last_error_category="cancelled",
        updated_at=func.clock_timestamp(), **_clear_lease()))
    return result.rowcount == 1
