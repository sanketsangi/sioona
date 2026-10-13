"""Tenant detection resume cursor."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.detection_resume import DetectionResumeResponse, DetectionResumeUpsert
from app.services.detection_resume import get_detection_resume, upsert_detection_resume

router = guarded_router(tags=["detection-resume"])


@router.get(
    "/v1/tenants/{tenant_id}/detection-resume",
    response_model=DetectionResumeResponse,
)
def get_tenant_detection_resume(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> DetectionResumeResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        row = get_detection_resume(db, tenant_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="database_unavailable",
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="detection_resume_not_found",
        )
    return DetectionResumeResponse.model_validate(row)


@router.put(
    "/v1/tenants/{tenant_id}/detection-resume",
    response_model=DetectionResumeResponse,
)
def put_tenant_detection_resume(
    tenant_id: str,
    body: DetectionResumeUpsert,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> DetectionResumeResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        row = upsert_detection_resume(
            db,
            tenant_id=tenant_id,
            failed_conversation_ids=body.failed_conversation_ids,
            skipped_conversation_ids=body.skipped_conversation_ids,
            expected_updated_at=body.expected_updated_at,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="database_unavailable",
        ) from exc
    return DetectionResumeResponse.model_validate(row)
