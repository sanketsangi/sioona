"""Tenant-scoped outbox, leases and publication fence. Caller owns transactions.

Lock order for all publication/admission/terminal operations: tenant corpus,
then job row. Heartbeats and claims lock only the job row and commit promptly.
Provider I/O is never inside a database transaction.
"""

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import and_, or_, select, text, func
from sqlalchemy.orm import Session
from app.config import get_settings
from app.db import bind_tenant
from app.models.job import Job
from app.models.upload import Upload
from app.models.detection_run import DetectionRun
from app.models.detection_resume import DetectionResume
from app.models.inference_attempt import InferenceAttempt
from app.models.message import Message
from app.models.conversation import Conversation
from app.schemas.job import JobUpload
from app.services.tenant_lock import lock_tenant_corpus
from app.services.detection_runs import conversation_content_hash, reconcile_detection
from app.services.conversations import upsert_conversations
from app.services.taxonomy import list_taxonomy_overrides
from app.services.inference_budget import reserve, settle
from app.services.weekly_upload import (
    apply_weekly_upload_receipt,
    publication_filename,
    weekly_file_count,
)
from app.services.uploads import publish_upload

LEASE_SECONDS = 90
HEARTBEAT_SECONDS = 30
PRINCIPAL = "principal:detection-worker"


class JobError(ValueError):
    pass


class LeaseLost(JobError):
    pass


@dataclass(frozen=True)
class Lease:
    tenant_id: str
    job_id: str
    owner: str
    token: int


def digest(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
    ).hexdigest()


def now(db: Session) -> datetime:
    if db.get_bind().dialect.name == "postgresql":
        return db.scalar(text("SELECT clock_timestamp()"))
    return datetime.now(timezone.utc)


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def config_hash(db: Session, tenant: str) -> str:
    from app.ai.gateway import PROMPT_SHA256, PORT_SHA256

    s = get_settings()
    return digest(
        {
            "prompt": PROMPT_SHA256,
            "port": PORT_SHA256,
            "model": s.detect_llm_model,
            "fallback": s.detect_llm_fallback_model,
            "llm": s.detect_llm,
            "primary": s.detect_llm_primary,
            "taxonomy": list_taxonomy_overrides(db, tenant),
        }
    )


def job_view(row: Job) -> dict:
    return {
        "job_id": row.id,
        "status": row.status,
        "upload_id": row.upload_id,
        "attempt_count": row.attempt_count,
        "max_attempts": row.max_attempts,
        "completed_conversations": row.cursor,
        "conversation_count": row.conversation_count,
        "run_after": row.run_after,
        "last_error_category": row.last_error_category,
    }


def enqueue_upload(
    db: Session,
    tenant: str,
    upload_id: str,
    body: JobUpload,
    *,
    job_type: str = "upload",
) -> Job:
    """Canonical messages + source snapshot + outbox become visible in one commit."""
    if get_settings().sioona_detection_execution != "worker":
        raise JobError("worker_mode_required")
    bind_tenant(db, tenant)
    lock_tenant_corpus(db, tenant)
    job_id = digest([tenant, job_type, upload_id])
    payload = body.model_dump(mode="json")
    fingerprint = digest(payload)
    prior = db.get(Upload, (tenant, upload_id))
    if prior is not None:
        if prior.content_sha256 != fingerprint:
            raise JobError("upload_identity_conflict")
        existing = db.get(Job, (tenant, job_id))
        if existing is None:
            raise JobError("upload_processor_conflict")
        return existing
    # Reject overlapping in-flight jobs rather than allowing two processors to
    # classify/publish the same changing canonical messages.
    ids = [c.conversation_id for c in body.conversations]
    active = db.scalars(
        select(Job).where(
            Job.tenant_id == tenant, Job.status.in_(["queued", "leased", "failed"])
        )
    ).all()
    for row in active:
        source = db.get(Upload, (tenant, row.upload_id))
        source_ids = [
            c["conversation_id"]
            for c in (source.payload or {}).get("conversations", [])
        ]
        if set(source_ids) & set(ids):
            raise JobError("conversation_job_in_progress")
    if body.append_only:
        from app.models.upload import UploadConversation

        if db.scalar(
            select(UploadConversation.conversation_id)
            .where(
                UploadConversation.tenant_id == tenant,
                UploadConversation.conversation_id.in_(ids),
            )
            .limit(1)
        ):
            raise JobError("live_event_already_published")
    # New snapshots are bounded canonical input, not queue payloads.
    db.add(
        Upload(
            tenant_id=tenant,
            upload_id=upload_id,
            source=body.source,
            content_sha256=fingerprint,
            status="staged",
            active=False,
            payload=payload,
        )
    )
    upsert_conversations(
        db, tenant_id=tenant, payloads=body.conversations, commit=False
    )
    empty_ids = [c.conversation_id for c in body.conversations if not c.messages]
    if empty_ids:
        from sqlalchemy import delete
        from app.services.evidence_anchors import mark_anchored_predictions_stale

        removed = list(
            db.scalars(
                select(Message.message_id).where(
                    Message.tenant_id == tenant, Message.conversation_id.in_(empty_ids)
                )
            )
        )
        mark_anchored_predictions_stale(db, tenant_id=tenant, message_ids=removed)
        db.execute(
            delete(Message).where(
                Message.tenant_id == tenant, Message.conversation_id.in_(empty_ids)
            )
        )
    db.flush()
    refs = sorted([[cid, conversation_content_hash(db, tenant, cid)] for cid in ids])
    row = Job(
        tenant_id=tenant,
        id=job_id,
        job_type=job_type,
        upload_id=upload_id,
        conversation_ids_sha256=digest(refs),
        conversation_count=len(ids),
        config_sha256=config_hash(db, tenant),
        run_after=now(db),
    )
    db.add(row)
    db.flush()
    return row


def enqueue_detect(db: Session, tenant: str, request_id: str, ids: list[str]) -> Job:
    bind_tenant(db, tenant)
    lock_tenant_corpus(db, tenant)
    job_id = digest([tenant, "detect", request_id])
    existing = db.get(Job, (tenant, job_id))
    if existing is not None:
        source = db.get(Upload, (tenant, existing.upload_id))
        if set(ids) != {c["conversation_id"] for c in source.payload["conversations"]}:
            raise JobError("job_identity_conflict")
        return existing
    conversations = []
    for cid in ids:
        chat = db.scalar(
            select(Conversation).where(
                Conversation.tenant_id == tenant, Conversation.conversation_id == cid
            )
        )
        if chat is None:
            raise JobError("conversation_not_found")
        messages = db.scalars(
            select(Message)
            .where(Message.tenant_id == tenant, Message.conversation_id == cid)
            .order_by(Message.timestamp, Message.message_id)
        ).all()
        conversations.append(
            {
                "conversation_id": cid,
                "channel": chat.channel,
                "customer_name": chat.customer_name,
                "external_id": chat.external_id,
                "ground_truth": chat.ground_truth,
                "started_at": chat.started_at,
                "messages": [
                    {
                        "message_id": m.message_id,
                        "role": m.role,
                        "content": m.content,
                        "timestamp": m.timestamp,
                    }
                    for m in messages
                ],
            }
        )
    return enqueue_upload(
        db,
        tenant,
        request_id,
        JobUpload(source="detection", conversations=conversations),
        job_type="detect",
    )


def source_body(db: Session, row: Job) -> JobUpload:
    source = db.get(Upload, (row.tenant_id, row.upload_id))
    if source is None or source.payload is None:
        raise JobError("source_unavailable")
    if digest(source.payload) != source.content_sha256:
        raise JobError("source_identity_conflict")
    body = JobUpload.model_validate(source.payload)
    refs = sorted(
        [
            [
                c.conversation_id,
                digest(sorted([[m.message_id, m.role, m.content] for m in c.messages])),
            ]
            for c in body.conversations
        ]
    )
    # conversation_content_hash uses JSON without sorted object keys; lists are
    # equivalent. The snapshot is immutable; current canonical hash is checked
    # separately at admission/publication.
    if digest(refs) != row.conversation_ids_sha256:
        raise JobError("source_identity_conflict")
    return body


def remaining_ids(db: Session, row: Job) -> list[str]:
    body = source_body(db, row)
    ids = []
    for chat in body.conversations:
        prior = db.get(DetectionRun, (row.tenant_id, row.id, chat.conversation_id))
        if prior is None or prior.content_hash != conversation_content_hash(
            db, row.tenant_id, chat.conversation_id
        ):
            ids.append(chat.conversation_id)
    return ids


def preserve_resume(db: Session, row: Job, *, skipped: bool = False) -> None:
    ids = remaining_ids(db, row)
    cursor = db.scalar(
        select(DetectionResume)
        .where(DetectionResume.tenant_id == row.tenant_id)
        .with_for_update()
    )
    if cursor is None:
        cursor = DetectionResume(
            tenant_id=row.tenant_id,
            failed_conversation_ids=[],
            skipped_conversation_ids=[],
            updated_at=now(db),
        )
        db.add(cursor)
    if skipped:
        cursor.skipped_conversation_ids = list(dict.fromkeys([*cursor.skipped_conversation_ids, *ids]))
    else:
        cursor.failed_conversation_ids = list(dict.fromkeys([*cursor.failed_conversation_ids, *ids]))
    cursor.updated_at = now(db)
    db.flush()


def claim(
    db: Session, tenant: str, owner: str, *, paused: bool = False
) -> Lease | None:
    if paused or os.getenv("SIOONA_WORKER_PAUSE") == "1":
        return None
    if not owner or len(owner) > 128:
        raise JobError("invalid_lease_owner")
    bind_tenant(db, tenant)
    clock = now(db)
    row = db.scalar(
        select(Job)
        .where(
            Job.tenant_id == tenant,
            or_(
                and_(Job.status.in_(["queued", "failed"]), Job.run_after <= clock),
                and_(Job.status == "leased", Job.lease_expires_at <= clock),
            ),
        )
        .order_by(Job.priority.desc(), Job.created_at, Job.id)
        .with_for_update(skip_locked=True)
        .limit(1)
        .execution_options(populate_existing=True)
    )
    if row is None:
        return None
    if row.attempt_count >= row.max_attempts:
        # Don't acquire the corpus lock after a claim lock. Release and recover
        # exhausted jobs through the terminal path with the global lock order.
        return None
    row.attempt_count += 1
    row.lease_token += 1
    row.status = "leased"
    row.lease_owner = owner
    row.leased_at = row.heartbeat_at = row.updated_at = clock
    row.lease_expires_at = clock + timedelta(seconds=LEASE_SECONDS)
    db.flush()
    return Lease(tenant, row.id, owner, row.lease_token)


def fenced(db: Session, lease: Lease, *, corpus: bool = False) -> Job:
    bind_tenant(db, lease.tenant_id)
    if corpus:
        lock_tenant_corpus(db, lease.tenant_id)
    row = db.scalar(
        select(Job)
        .where(Job.tenant_id == lease.tenant_id, Job.id == lease.job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    clock = now(db)  # Wall clock AFTER the row lock, not transaction start time.
    if (
        row is None
        or row.status != "leased"
        or row.lease_token != lease.token
        or row.lease_owner != lease.owner
        or utc(row.lease_expires_at) <= clock
    ):
        raise LeaseLost("lease_lost")
    return row


def heartbeat(db: Session, lease: Lease) -> None:
    row = fenced(db, lease)
    row.heartbeat_at = row.updated_at = now(db)
    row.lease_expires_at = row.heartbeat_at + timedelta(seconds=LEASE_SECONDS)
    db.flush()


def clear_lease(row: Job, clock: datetime) -> None:
    row.lease_owner = None
    row.lease_expires_at = None
    row.updated_at = clock


def fail(db: Session, lease: Lease, category: str, *, retryable: bool = True) -> None:
    row = fenced(db, lease, corpus=True)
    preserve_resume(db, row)
    clock = now(db)
    row.last_error_category = category[:32]
    row.status = (
        "dead_lettered"
        if row.attempt_count >= row.max_attempts
        else ("failed" if retryable else "dead_lettered")
    )
    if row.status == "failed":
        row.run_after = clock + timedelta(seconds=min(300, 2**row.attempt_count))
    clear_lease(row, clock)
    db.flush()


def drain(db: Session, lease: Lease) -> None:
    """Pause is not a failed provider attempt; release without consuming retries."""
    row = fenced(db, lease, corpus=True)
    preserve_resume(db, row, skipped=True)
    row.status = "queued"
    row.attempt_count -= 1
    row.run_after = now(db)
    clear_lease(row, row.run_after)
    db.flush()


def reap_exhausted(db: Session, tenant: str) -> int:
    bind_tenant(db, tenant)
    lock_tenant_corpus(db, tenant)
    clock = now(db)
    rows = db.scalars(
        select(Job)
        .where(
            Job.tenant_id == tenant,
            Job.attempt_count >= Job.max_attempts,
            or_(
                Job.status == "failed",
                and_(Job.status == "leased", Job.lease_expires_at <= clock),
            ),
        )
        .with_for_update(skip_locked=True)
    ).all()
    for row in rows:
        preserve_resume(db, row)
        row.status, row.last_error_category = "dead_lettered", "lease_exhausted"
        clear_lease(row, clock)
    db.flush()
    return len(rows)


def cancel(db: Session, tenant: str, job_id: str) -> Job:
    bind_tenant(db, tenant)
    lock_tenant_corpus(db, tenant)
    row = db.scalar(
        select(Job).where(Job.tenant_id == tenant, Job.id == job_id).with_for_update()
    )
    if row is None:
        raise JobError("job_not_found")
    if row.status in {"queued", "leased", "failed"}:
        preserve_resume(db, row)
        row.status = "cancelled"
        row.lease_token += 1
        clear_lease(row, now(db))
    db.flush()
    return row


def worker_authority(tenant: str, operation: str) -> None:
    """Local service principal authority is the operator's tenant allowlist."""
    from app.api.actor import SERVICE_PRINCIPALS

    s = get_settings()
    allowed = {t.strip() for t in s.sioona_worker_tenants.split(",") if t.strip()}
    if tenant not in allowed or operation not in SERVICE_PRINCIPALS[PRINCIPAL]:
        raise JobError("worker_tenant_not_authorized")


def admit(db: Session, lease: Lease, cid: str, content_hash: str, model: str) -> str:
    worker_authority(lease.tenant_id, "inference:reserve")
    row = fenced(db, lease, corpus=True)
    if config_hash(db, lease.tenant_id) != row.config_sha256:
        raise JobError("config_changed")
    if conversation_content_hash(db, lease.tenant_id, cid) != content_hash:
        raise JobError("source_changed")
    attempt_id = uuid4().hex
    from app.ai.gateway import PROMPT_VERSION, route_version

    reserve(db, lease.tenant_id, attempt_id, row.id, "groq", model)
    db.add(
        InferenceAttempt(
            tenant_id=lease.tenant_id,
            attempt_id=attempt_id,
            logical_operation_id=digest([row.id, cid])[:64],
            attempt_ordinal=1
            + (
                db.scalar(
                    select(func.count())
                    .select_from(InferenceAttempt)
                    .where(
                        InferenceAttempt.tenant_id == lease.tenant_id,
                        InferenceAttempt.job_id == row.id,
                        InferenceAttempt.conversation_id == cid,
                    )
                )
                or 0
            ),
            conversation_id=cid,
            detection_run_id=row.id,
            job_id=row.id,
            stage="detect",
            route_version=route_version(),
            provider="groq",
            model=model,
            prompt_version=PROMPT_VERSION,
            status="pending",
            usage_status="unknown",
            cost_status="unknown",
            started_at=now(db),
        )
    )
    db.flush()
    if utc(row.lease_expires_at) <= now(db):
        raise LeaseLost("lease_lost")
    return attempt_id


def finalize_attempt(db: Session, tenant: str, attempt_id: str, result: dict) -> None:
    """Metering survives lease loss: finalizes only this immutable attempt ID."""
    bind_tenant(db, tenant)
    row = db.scalar(
        select(InferenceAttempt)
        .where(
            InferenceAttempt.tenant_id == tenant,
            InferenceAttempt.attempt_id == attempt_id,
        )
        .with_for_update()
    )
    if row is None or row.status != "pending":
        return
    row.status = result.get("status", "failed")
    row.error_category = result.get("error_category")
    row.http_status = result.get("http_status")
    row.finished_at = now(db)
    usage = result.get("usage") or {}
    known = (
        usage.get("input_tokens") is not None and usage.get("output_tokens") is not None
    )
    row.usage_status = "reported" if known else "unknown"
    for key in (
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "reasoning_tokens",
    ):
        setattr(row, key, usage.get(key) if known else None)
    settle(db, tenant, attempt_id)
    db.flush()


def publish_conversation(
    db: Session,
    lease: Lease,
    cid: str,
    content_hash: str,
    model: str,
    output: list[dict],
    coverage=None,
) -> None:
    row = fenced(db, lease, corpus=True)
    if config_hash(db, lease.tenant_id) != row.config_sha256:
        raise JobError("config_changed")
    if conversation_content_hash(db, lease.tenant_id, cid) != content_hash:
        raise JobError("source_changed")
    from app.ai.gateway import PROMPT_VERSION

    reconcile_detection(
        db,
        tenant_id=lease.tenant_id,
        run_id=row.id,
        conversation_id=cid,
        content_hash=content_hash,
        model_version=model,
        prompt_version=PROMPT_VERSION,
        output=output,
        coverage=coverage,
        lease_token=lease.token,
    )
    row.cursor = row.conversation_count - len(remaining_ids(db, row))
    row.updated_at = now(db)
    # Recheck expiration after validation/publication, before committing writes.
    if utc(row.lease_expires_at) <= row.updated_at:
        raise LeaseLost("lease_lost")
    db.flush()


def complete(db: Session, lease: Lease) -> None:
    row = fenced(db, lease, corpus=True)
    if remaining_ids(db, row):
        raise JobError("unpublished_conversations")
    body = source_body(db, row)
    if config_hash(db, lease.tenant_id) != row.config_sha256:
        raise JobError("config_changed")
    for chat in body.conversations:
        expected = digest(
            sorted([[m.message_id, m.role, m.content] for m in chat.messages])
        )
        if (
            conversation_content_hash(db, lease.tenant_id, chat.conversation_id)
            != expected
        ):
            raise JobError("source_changed")
    source = db.get(Upload, (lease.tenant_id, row.upload_id))
    if row.job_type == "upload":
        if not body.append_only:
            newer = db.scalar(
                select(Upload.upload_id)
                .where(
                    Upload.tenant_id == lease.tenant_id,
                    Upload.status == "completed",
                    Upload.active.is_(True),
                    Upload.upload_id != row.upload_id,
                    Upload.imported_at > source.imported_at,
                )
                .limit(1)
            )
            if newer:
                raise JobError("upload_superseded")
        publish_upload(
            db,
            tenant_id=lease.tenant_id,
            upload_id=row.upload_id,
            source=source.source,
            content_sha256=source.content_sha256,
            conversation_ids=[c.conversation_id for c in body.conversations],
            replace=body.replace,
        )
        # Preserve per-file membership used by Uploaded Chats.
        for file in body.files or []:
            file_id = digest([row.upload_id, file.source])
            child = publish_upload(
                db,
                tenant_id=lease.tenant_id,
                upload_id=file_id,
                source=file.source,
                content_sha256=source.content_sha256,
                conversation_ids=file.conversation_ids,
            )
            child.payload = {"job_id": row.id, "parent_upload_id": row.upload_id}
        apply_weekly_upload_receipt(
            db,
            tenant_id=lease.tenant_id,
            receipt_id=row.upload_id,
            weekly_file_count=weekly_file_count(body),
            last_uploaded_file_name=publication_filename(body),
            update_filename=body.record_upload_metadata and not body.append_only,
        )
    else:
        source.status = "completed"
    cursor = db.scalar(
        select(DetectionResume)
        .where(DetectionResume.tenant_id == lease.tenant_id)
        .with_for_update()
    )
    if cursor:
        done = {c.conversation_id for c in body.conversations}
        cursor.failed_conversation_ids = [
            cid for cid in cursor.failed_conversation_ids if cid not in done
        ]
        cursor.skipped_conversation_ids = [
            cid for cid in cursor.skipped_conversation_ids if cid not in done
        ]
        cursor.updated_at = now(db)
    clock = now(db)
    if utc(row.lease_expires_at) <= clock:
        raise LeaseLost("lease_lost")
    row.status, row.cursor = "succeeded", row.conversation_count
    clear_lease(row, clock)
    db.flush()
