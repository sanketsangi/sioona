"""Tenant-authorized ingestion publication, status and recovery endpoints."""
from typing import Annotated
from fastapi import Depends, HTTPException, Path
from sqlalchemy.orm import Session
from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.models.upload import Upload
from app.schemas.ingestion import Ingestion
from app.services.ingestion import IngestionError, publish_ingestion, resume_ingestion as resume_stored_ingestion

router = guarded_router(tags=["ingestion"])


@router.put("/v1/tenants/{tenant_id}/ingestions/{upload_id}")
def ingest(tenant_id: str, upload_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
           body: Ingestion, header_tenant_id: Annotated[str, Depends(require_tenant_id)],
           db: Annotated[Session, Depends(get_db)]):
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        return publish_ingestion(db, tenant_id=tenant_id, upload_id=upload_id, body=body)
    except IngestionError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc


@router.get("/v1/tenants/{tenant_id}/ingestions/{upload_id}")
def ingestion_status(tenant_id: str,
                     upload_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
                     header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                     db: Annotated[Session, Depends(get_db)]):
    keep_header_gate(tenant_id, header_tenant_id)
    operation = db.get(Upload, (tenant_id, upload_id))
    if operation is None:
        raise HTTPException(404, "ingestion_not_found")
    return {"upload_id": operation.upload_id, "status": operation.status,
            "source": operation.source, "content_sha256": operation.content_sha256,
            "active": operation.active if operation.status == "completed" else False,
            "imported_at": operation.imported_at}


@router.post("/v1/tenants/{tenant_id}/ingestions/{upload_id}/resume")
def resume_ingestion(tenant_id: str,
                     upload_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
                     header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                     db: Annotated[Session, Depends(get_db)]):
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        return resume_stored_ingestion(db, tenant_id=tenant_id, upload_id=upload_id)
    except IngestionError as exc:
        raise HTTPException(exc.status_code, exc.detail) from exc
