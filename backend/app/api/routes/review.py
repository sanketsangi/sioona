"""Shadow Mode review-queue and tenant signal list endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.schemas.prediction import PredictionResponse, PredictionWithFeedbackResponse
from app.services.predictions import list_tenant_predictions
from app.services.review_queue import list_signals_needing_review

router = APIRouter(tags=["review-queue"])


@router.get(
    "/v1/tenants/{tenant_id}/signals",
    response_model=list[PredictionWithFeedbackResponse],
)
def get_tenant_signals(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PredictionWithFeedbackResponse]:
    """List this tenant's predictions with optional feedback (hydrate restore)."""
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        rows = list_tenant_predictions(db, tenant_id)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [PredictionWithFeedbackResponse.model_validate(row) for row in rows]


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
    try:
        rows = list_signals_needing_review(db, tenant_id, limit=limit)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [PredictionResponse.model_validate(row) for row in rows]