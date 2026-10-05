"""Publish durable membership only after corpus persistence succeeds."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, defer
from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.models.upload import Upload, UploadConversation
from app.schemas.upload import UploadMembership, UploadPublish, UploadResponse, PublishedConversationLookup
from app.services.uploads import publish_upload, upload_conversation_ids

router = APIRouter(tags=["uploads"])


@router.get("/v1/tenants/{tenant_id}/uploads/{upload_id}/snapshot")
def get_upload_snapshot(tenant_id: str, upload_id: str,
                        header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                        db: Annotated[Session, Depends(get_db)]):
    """Return original corpus/output even after replacement of current chats."""
    assert_tenant_match(tenant_id, header_tenant_id)
    row = db.get(Upload, (tenant_id, upload_id))
    if row is None or row.status != "completed":
        raise HTTPException(404, "upload_not_found")
    if not isinstance(row.payload, dict):
        raise HTTPException(409, "upload_snapshot_unavailable")
    from app.services.upload_snapshot import load_upload_snapshot
    try:
        body, run_id = load_upload_snapshot(db, row)
        ids = [chat.conversation_id for chat in body.conversations]
    except ValueError as exc:
        raise HTTPException(409, "upload_snapshot_unavailable") from exc
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.signal_prediction import SignalPrediction
    from app.schemas.prediction import SnapshotPredictionResponse
    predictions = db.scalars(select(SignalPrediction).where(
        SignalPrediction.tenant_id == tenant_id, SignalPrediction.detection_run_id == run_id,
        SignalPrediction.conversation_id.in_(ids)).options(selectinload(SignalPrediction.feedback))
        .order_by(SignalPrediction.conversation_id, SignalPrediction.signal_type)).all()
    expected = {(item.conversation_id, output.signal_type) for item in body.detections for output in item.output}
    if {(item.conversation_id, item.signal_type) for item in predictions} != expected:
        raise HTTPException(409, "upload_snapshot_predictions_unavailable")
    return {"upload": UploadResponse.model_validate(row), "run_id": run_id,
            "predictions": [SnapshotPredictionResponse.model_validate(item) for item in predictions],
            "conversations": [chat.model_dump(mode="json") for chat in body.conversations],
            "detections": [item.model_dump(mode="json") for item in body.detections]}


@router.put("/v1/tenants/{tenant_id}/uploads/{upload_id}", response_model=UploadResponse)
def put_upload(tenant_id: str, upload_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
               body: UploadPublish, header_tenant_id: Annotated[str, Depends(require_tenant_id)],
               db: Annotated[Session, Depends(get_db)]):
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        row = publish_upload(db, tenant_id=tenant_id, upload_id=upload_id,
                             source=body.source, content_sha256=body.content_sha256,
                             conversation_ids=body.conversation_ids, replace=body.replace)
        db.commit()
        db.refresh(row)
    except (ValueError, IntegrityError) as exc:
        db.rollback()
        raise HTTPException(409, "upload_identity_conflict_or_missing_conversations") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "database_unavailable") from exc
    return UploadResponse.model_validate(row)


@router.get("/v1/tenants/{tenant_id}/uploads/{upload_id}", response_model=UploadMembership)
def get_upload(tenant_id: str, upload_id: str,
               header_tenant_id: Annotated[str, Depends(require_tenant_id)],
               db: Annotated[Session, Depends(get_db)]):
    assert_tenant_match(tenant_id, header_tenant_id)
    row = db.get(Upload, (tenant_id, upload_id))
    if row is None or row.status != "completed":
        raise HTTPException(404, "upload_not_found")
    return UploadMembership(upload=UploadResponse.model_validate(row),
                            conversation_ids=sorted(upload_conversation_ids(db, tenant_id, upload_id)))


@router.get("/v1/tenants/{tenant_id}/uploads", response_model=list[UploadMembership])
def get_active_uploads(tenant_id: str,
                       header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                       db: Annotated[Session, Depends(get_db)]):
    """Recover the published corpus independently of mutable pilot settings."""
    from sqlalchemy import select
    assert_tenant_match(tenant_id, header_tenant_id)
    rows = db.scalars(select(Upload).where(Upload.tenant_id == tenant_id,
        Upload.status == "completed", Upload.active.is_(True),
        Upload.payload["files"].as_string().is_(None))
        .options(defer(Upload.payload))
        .order_by(Upload.imported_at, Upload.upload_id)).all()
    if not rows:
        return []
    memberships = db.execute(select(UploadConversation.upload_id, UploadConversation.conversation_id).where(
        UploadConversation.tenant_id == tenant_id,
        UploadConversation.upload_id.in_([row.upload_id for row in rows]))).all()
    by_upload: dict[str, list[str]] = {}
    for upload_id, conversation_id in memberships:
        by_upload.setdefault(upload_id, []).append(conversation_id)
    return [UploadMembership(upload=UploadResponse.model_validate(row),
        conversation_ids=sorted(by_upload.get(row.upload_id, []))) for row in rows]


@router.post("/v1/tenants/{tenant_id}/uploads/published-conversations")
def published_conversations(tenant_id: str,
                            body: PublishedConversationLookup,
                            header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                            db: Annotated[Session, Depends(get_db)]):
    from sqlalchemy import select
    assert_tenant_match(tenant_id, header_tenant_id)
    ids = db.scalars(select(UploadConversation.conversation_id).join(Upload,
        (Upload.tenant_id == UploadConversation.tenant_id) & (Upload.upload_id == UploadConversation.upload_id))
        .where(Upload.tenant_id == tenant_id, Upload.status == "completed",
               UploadConversation.conversation_id.in_(body.conversation_ids)).distinct()).all()
    return {"conversation_ids": sorted(ids)}
