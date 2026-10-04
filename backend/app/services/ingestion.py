"""Shared staged ingestion publication and recovery transactions."""
import hashlib
import json
from datetime import datetime, timezone
from sqlalchemy import delete, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models.upload import Upload
from app.models.signal_prediction import SignalPrediction
from app.schemas.ingestion import Ingestion
from app.services.conversations import upsert_conversations
from app.services.detection_runs import reconcile_detection
from app.services.uploads import publish_upload
from app.services.tenant_lock import lock_tenant_corpus


class IngestionError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def publish_ingestion(db: Session, *, tenant_id: str, upload_id: str, body: Ingestion, require_existing: bool = False):
    ids = [row.conversation_id for row in body.conversations]
    detected_ids = [row.conversation_id for row in body.detections]
    if len(set(ids)) != len(ids) or len(set(detected_ids)) != len(detected_ids) or set(ids) != set(detected_ids):
        raise IngestionError(422, "One complete detection result is required for every conversation")
    if body.files:
        file_ids = [cid for file in body.files for cid in file.conversation_ids]
        if len(file_ids) != len(set(file_ids)) or set(file_ids) != set(ids) or len({file.source for file in body.files}) != len(body.files):
            raise IngestionError(422, "Files must partition the complete imported corpus")
    digest = hashlib.sha256(json.dumps(body.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    try:
        # Serialize whole ingest operations per tenant across PostgreSQL workers.
        lock_tenant_corpus(db, tenant_id)
        prior = db.scalar(select(Upload).where(Upload.tenant_id == tenant_id, Upload.upload_id == upload_id).execution_options(populate_existing=True))
        if prior is None and require_existing:
            raise IngestionError(404, "ingestion_not_found")
        if prior and prior.content_sha256 != digest:
            raise IngestionError(409, "upload_identity_conflict")
        completed = prior is not None and prior.status == "completed"
        if not prior:
            db.add(Upload(tenant_id=tenant_id, upload_id=upload_id, source=body.source, content_sha256=digest, status="staged", payload=body.model_dump(mode="json"), imported_at=datetime.now(timezone.utc)))
            db.commit()
        if not completed:
            # A commit releases both the connection and transaction lock. Reacquire
            # before publication so another worker can safely finish a staged retry.
            lock_tenant_corpus(db, tenant_id)
            prior = db.scalar(select(Upload).where(Upload.tenant_id == tenant_id, Upload.upload_id == upload_id).with_for_update().execution_options(populate_existing=True))
            if prior is None:
                raise IngestionError(409, "ingestion_removed_before_publication")
            completed = prior.status == "completed"
        if not completed:
            if not body.append_only:
                newer = db.scalar(select(Upload.upload_id).where(
                    Upload.tenant_id == tenant_id, Upload.status == "completed",
                    Upload.upload_id != upload_id, Upload.imported_at > prior.imported_at).limit(1))
                if newer is not None:
                    raise IngestionError(409, "ingestion_superseded_by_newer_upload")
            if body.append_only:
                from app.models.upload import UploadConversation
                duplicate = db.scalar(select(UploadConversation.conversation_id).join(Upload,
                    (Upload.tenant_id == UploadConversation.tenant_id) & (Upload.upload_id == UploadConversation.upload_id))
                    .where(Upload.tenant_id == tenant_id, Upload.status == "completed",
                           UploadConversation.conversation_id.in_(ids)).limit(1))
                if duplicate is not None:
                    raise IngestionError(409, "live_event_already_published")
            if db.bind.dialect.name == "sqlite":
                db.connection().exec_driver_sql("BEGIN")
            from app.models.message import Message
            owners = {}
            for chat in body.conversations:
                for message in chat.messages:
                    if message.message_id in owners:
                        raise ValueError("Duplicate message identity in imported corpus")
                    owners[message.message_id] = chat.conversation_id
            message_ids = list(owners)
            for offset in range(0, len(message_ids), 500):
                existing = db.execute(select(Message.message_id, Message.conversation_id).where(
                    Message.tenant_id == tenant_id,
                    Message.message_id.in_(message_ids[offset:offset + 500]))).all()
                if any(owners[mid] != cid for mid, cid in existing):
                    raise ValueError("Message identity belongs to another conversation")
            upsert_conversations(db, tenant_id=tenant_id, payloads=body.conversations, commit=False)
            # Atomic classification requests contain complete transcripts, unlike
            # the general metadata-only conversation update API.
            empty_ids = [chat.conversation_id for chat in body.conversations if not chat.messages]
            if empty_ids:
                db.execute(delete(Message).where(Message.tenant_id == tenant_id,
                    Message.conversation_id.in_(empty_ids)))
            for item in sorted(body.detections, key=lambda row: row.conversation_id):
                reconcile_detection(db, tenant_id=tenant_id, run_id=upload_id, **item.model_dump())
            publish_upload(db, tenant_id=tenant_id, upload_id=upload_id, source=body.source,
                content_sha256=digest, conversation_ids=ids, replace=body.replace)
            for file in body.files or []:
                file_id = hashlib.sha256(json.dumps([upload_id, file.source], ensure_ascii=False).encode()).hexdigest()
                child = publish_upload(db, tenant_id=tenant_id, upload_id=file_id, source=file.source,
                    content_sha256=digest, conversation_ids=file.conversation_ids)
                file_ids = set(file.conversation_ids)
                child.payload = {"snapshot": {
                    "run_id": upload_id, "source": file.source,
                    "conversations": [row.model_dump(mode="json") for row in body.conversations if row.conversation_id in file_ids],
                    "detections": [row.model_dump(mode="json") for row in body.detections if row.conversation_id in file_ids],
                }}
            db.commit()
        rows = db.scalars(select(SignalPrediction).where(SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.detection_run_id == upload_id)).all()
        published = db.get(Upload, (tenant_id, upload_id))
        return {"upload_id": upload_id, "status": "completed", "active": published.active, "predictions": [{"id": str(row.id),
            "conversation_id": row.conversation_id, "signal_type": row.signal_type, "active": row.active} for row in rows]}
    except IngestionError as exc:
        db.rollback()
        if exc.detail in {"live_event_already_published", "ingestion_superseded_by_newer_upload"}:
            db.execute(update(Upload).where(Upload.tenant_id == tenant_id,
                Upload.upload_id == upload_id, Upload.status != "completed").values(status="failed"))
            db.commit()
        raise
    except (ValueError, SQLAlchemyError) as exc:
        db.rollback()
        db.execute(update(Upload).where(Upload.tenant_id == tenant_id,
            Upload.upload_id == upload_id, Upload.status != "completed").values(status="failed"))
        db.commit()
        raise IngestionError(409 if isinstance(exc, ValueError) else 503, "ingestion_not_published") from exc



def resume_ingestion(db: Session, *, tenant_id: str, upload_id: str):
    operation = db.get(Upload, (tenant_id, upload_id))
    if operation is None:
        raise IngestionError(404, "ingestion_not_found")
    if operation.payload is None:
        raise IngestionError(409, "ingestion_payload_unavailable")
    from pydantic import ValidationError
    try:
        body = Ingestion.model_validate(operation.payload)
    except ValidationError:
        # Retained requests can predate new bounds or be damaged. Never expose
        # validation details containing customer text, or abort the whole worker.
        raise IngestionError(409, "ingestion_payload_invalid") from None
    return publish_ingestion(db, tenant_id=tenant_id, upload_id=upload_id, body=body, require_existing=True)
