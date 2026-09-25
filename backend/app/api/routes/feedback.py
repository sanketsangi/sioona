"""Human feedback endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

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

router = APIRouter(tags=["feedback"])


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