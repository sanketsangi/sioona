"""Human feedback endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.schemas.prediction import PredictionActedUpdate, PredictionWithFeedbackResponse
from app.services.feedback import (
    InvalidFeedbackLabelError,
    SignalNotFoundError,
    record_feedback,
)
from app.services.predictions import (
    PredictionNotReviewedError,
    set_prediction_acted,
)

router = guarded_router(tags=["feedback"])


@router.post(
    "/v1/signals/{signal_id}/feedback",
    response_model=FeedbackResponse,
)
def submit_feedback(
    signal_id: UUID,
    body: FeedbackCreate,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> FeedbackResponse:
    """Submit or update human feedback on a signal prediction."""
    try:
        row = record_feedback(
            db,
            tenant_id=tenant_id,
            signal_id=signal_id,
            feedback=body.feedback,
            reviewed_by=body.reviewed_by,
            note=body.note,
            reviewed_at=body.reviewed_at,
            if_absent=body.if_absent,
        )
    except SignalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except InvalidFeedbackLabelError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return FeedbackResponse.model_validate(row)


@router.post(
    "/v1/signals/{signal_id}/acted",
    response_model=PredictionWithFeedbackResponse,
)
def submit_acted(
    signal_id: UUID,
    body: PredictionActedUpdate,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionWithFeedbackResponse:
    """Set or clear Shadow Mode Acted. Requires existing feedback. No outbound send."""
    try:
        row = set_prediction_acted(
            db,
            tenant_id=tenant_id,
            signal_id=signal_id,
            acted=body.acted,
        )
    except SignalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PredictionNotReviewedError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return PredictionWithFeedbackResponse.model_validate(row)


@router.post(
    "/v1/tenants/{tenant_id}/signals/{signal_id}/feedback",
    response_model=FeedbackResponse,
)
def submit_feedback_for_tenant(
    tenant_id: str,
    signal_id: UUID,
    body: FeedbackCreate,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> FeedbackResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    return submit_feedback(signal_id, body, tenant_id, db)


@router.post(
    "/v1/tenants/{tenant_id}/signals/{signal_id}/acted",
    response_model=PredictionWithFeedbackResponse,
)
def submit_acted_for_tenant(
    tenant_id: str,
    signal_id: UUID,
    body: PredictionActedUpdate,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionWithFeedbackResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    return submit_acted(signal_id, body, tenant_id, db)