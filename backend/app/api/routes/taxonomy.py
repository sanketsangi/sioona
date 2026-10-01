"""Tenant taxonomy override endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.schemas.taxonomy import (
    TaxonomyOverridesBody,
    TaxonomyOverridesResponse,
    TaxonomyTypeOverride,
)
from app.services.taxonomy import list_taxonomy_overrides, replace_taxonomy_overrides

router = APIRouter(tags=["taxonomy"])


def _response(tenant_id: str, raw: dict[str, dict[str, list[str]]]) -> TaxonomyOverridesResponse:
    return TaxonomyOverridesResponse(
        tenant_id=tenant_id,
        overrides={
            key: TaxonomyTypeOverride(**value) for key, value in raw.items()
        },
    )


@router.get(
    "/v1/tenants/{tenant_id}/taxonomy-overrides",
    response_model=TaxonomyOverridesResponse,
)
def get_taxonomy_overrides(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> TaxonomyOverridesResponse:
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        return _response(tenant_id, list_taxonomy_overrides(db, tenant_id))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc


@router.put(
    "/v1/tenants/{tenant_id}/taxonomy-overrides",
    response_model=TaxonomyOverridesResponse,
)
def put_taxonomy_overrides(
    tenant_id: str,
    body: TaxonomyOverridesBody,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> TaxonomyOverridesResponse:
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        saved = replace_taxonomy_overrides(
            db,
            tenant_id=tenant_id,
            overrides=body.model_dump(),
        )
        return _response(tenant_id, saved)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
