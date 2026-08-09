"""Shadow Mode review-queue endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.schemas.prediction import PredictionResponse
from app.services.review_queue import list_signals_needing_review

router = APIRouter(tags=["review-queue"])


@router.get(
    "/v1/tenants/{tenant_id}/signals/needs-review",
    response_model=list[PredictionResponse],
)
def get_signals_needing_review(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[PredictionResponse]:
    """Return recent predictions that still need human review."""
    assert_tenant_match(tenant_id, header_tenant_id)
    rows = list_signals_needing_review(db, tenant_id, limit=limit)
    return [PredictionResponse.model_validate(row) for row in rows]