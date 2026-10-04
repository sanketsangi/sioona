"""Upload membership publication; callers commit it with their corpus transaction."""
from collections.abc import Sequence
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from app.models.upload import Upload, UploadConversation


def publish_upload(db: Session, *, tenant_id: str, upload_id: str, source: str,
                   content_sha256: str, conversation_ids: Sequence[str], replace: bool = False) -> Upload:
    """Idempotent publish. Never mutate an existing identity or committed membership.

    No commit here: the ingest transaction must include messages and predictions.
    FK validation prevents membership from referencing missing or other-tenant chats.
    """
    ids = frozenset(conversation_ids)
    if not ids or any(not cid for cid in ids):
        raise ValueError("Upload requires nonempty conversation IDs")
    existing = db.get(Upload, (tenant_id, upload_id))
    if existing:
        prior = frozenset(db.scalars(select(UploadConversation.conversation_id).where(
            UploadConversation.tenant_id == tenant_id, UploadConversation.upload_id == upload_id)))
        if existing.content_sha256 != content_sha256 or existing.source != source or (existing.status == "completed" and prior != ids):
            raise ValueError("Upload identity already belongs to a different corpus")
        if existing.status == "completed":
            return existing
    if replace:
        db.execute(update(Upload).where(Upload.tenant_id == tenant_id).values(active=False))
    row = existing or Upload(tenant_id=tenant_id, upload_id=upload_id, source=source,
                 content_sha256=content_sha256, status="completed")
    row.status = "completed"
    row.active = True
    db.add(row)
    db.flush()
    db.add_all([UploadConversation(tenant_id=tenant_id, upload_id=upload_id,
                                  conversation_id=cid) for cid in sorted(ids)])
    db.flush()
    return row


def upload_conversation_ids(db: Session, tenant_id: str, upload_id: str) -> frozenset[str]:
    return frozenset(db.scalars(select(UploadConversation.conversation_id).join(Upload,
        (Upload.tenant_id == UploadConversation.tenant_id) & (Upload.upload_id == UploadConversation.upload_id)
    ).where(Upload.tenant_id == tenant_id, Upload.upload_id == upload_id, Upload.status == "completed")))
