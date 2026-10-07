"""Tenant data wipe endpoint (Reset Demo / partner deletion request)."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.tenant_data import TenantDataWipeResponse
from app.services.tenant_data import wipe_tenant_data

router = guarded_router(tags=["tenant-data"])


@router.delete(
    "/v1/tenants/{tenant_id}/data",
    response_model=TenantDataWipeResponse,
)
def delete_tenant_data(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> TenantDataWipeResponse:
    """Wipe Neon chats, messages, predictions, feedback, decisions, and pilot settings.

    Requires ``X-Tenant-Id`` to match the path tenant. Does not touch other
    tenants. Intended for Reset Demo / Partner Demo / partner deletion only.
    """
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        counts = wipe_tenant_data(db, tenant_id=tenant_id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="database_unavailable",
        ) from exc
    return TenantDataWipeResponse(**counts)
