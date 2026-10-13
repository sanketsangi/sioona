"""Tenant pilot settings endpoints (baseline + weekly export count)."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.pilot import PilotSettingsResponse, PilotSettingsUpsert
from app.services.pilot import get_pilot_settings, upsert_pilot_settings

router = guarded_router(tags=["pilot"])


@router.get(
    "/v1/tenants/{tenant_id}/pilot",
    response_model=PilotSettingsResponse,
)
def get_tenant_pilot(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PilotSettingsResponse:
    """Return pilot settings for a tenant. 404 if never written."""
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        row = get_pilot_settings(db, tenant_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="database_unavailable",
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="pilot_settings_not_found",
        )
    return PilotSettingsResponse.model_validate(row)


@router.put(
    "/v1/tenants/{tenant_id}/pilot",
    response_model=PilotSettingsResponse,
)
def put_tenant_pilot(
    tenant_id: str,
    body: PilotSettingsUpsert,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PilotSettingsResponse:
    """Upsert pilot settings for a tenant (full replace of pilot fields)."""
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        row = upsert_pilot_settings(
            db,
            tenant_id=tenant_id,
            baseline_opportunities=body.baseline_opportunities,
            baseline_note=body.baseline_note,
            weekly_export_count=body.weekly_export_count,
            last_uploaded_file_name=body.last_uploaded_file_name,
            update_scope=body.update_scope,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="database_unavailable",
        ) from exc
    return PilotSettingsResponse.model_validate(row)
