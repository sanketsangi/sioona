"""Prediction recording endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.prediction import (
    PredictionBulkResponse,
    PredictionBulkUpsert,
    PredictionCreate,
    PredictionOutcomeUpdate,
    PredictionResponse,
)
from app.services.feedback import SignalNotFoundError
from app.services.predictions import (
    VersionedPredictionConflict,
    record_prediction,
    record_predictions_bulk,
    set_prediction_outcome,
)

router = APIRouter(tags=["predictions"])


@router.post("/v1/predictions", response_model=PredictionResponse, status_code=201)
def create_prediction(
    body: PredictionCreate,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionResponse:
    """Record a model prediction for the tenant in X-Tenant-Id."""
    try:
        prediction = record_prediction(
            db,
            tenant_id=tenant_id,
            conversation_id=body.conversation_id,
            signal_type=body.signal_type,
            confidence=body.confidence,
            summary=body.summary,
            urgency=body.urgency,
            urgency_timeframe=body.urgency_timeframe,
            mentioned_value_inr=body.mentioned_value_inr,
        )
        return PredictionResponse.model_validate(prediction)
    except VersionedPredictionConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc


@router.post(
    "/v1/predictions/bulk",
    response_model=PredictionBulkResponse,
    status_code=201,
)
def create_or_update_predictions_bulk(
    body: PredictionBulkUpsert,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionBulkResponse:
    """Upsert many predictions (Partner Demo / ingest dual-write)."""
    try:
        result = record_predictions_bulk(
            db,
            tenant_id=tenant_id,
            payloads=[
                {
                    "conversation_id": row.conversation_id,
                    "signal_type": row.signal_type,
                    "confidence": row.confidence,
                    "summary": row.summary,
                    "urgency": row.urgency,
                    "urgency_timeframe": row.urgency_timeframe,
                    "mentioned_value_inr": row.mentioned_value_inr,
                }
                for row in body.predictions
            ],
        )
        return PredictionBulkResponse(
            predictions=[
                PredictionResponse.model_validate(item.prediction)
                for item in result.items
            ],
            created=result.created,
            updated=result.updated,
        )
    except VersionedPredictionConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc


@router.post(
    "/v1/signals/{signal_id}/outcome",
    response_model=PredictionResponse,
)
def record_signal_outcome(
    signal_id: str,
    body: PredictionOutcomeUpdate,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionResponse:
    """Persist retained / churned / converted / no change / unknown."""
    from uuid import UUID

    try:
        parsed = UUID(signal_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="signal id must be a UUID",
        ) from exc
    try:
        prediction = set_prediction_outcome(
            db,
            tenant_id=tenant_id,
            signal_id=parsed,
            outcome=body.outcome,
            value_inr=body.value_inr,
            recorded_on=body.recorded_on,
        )
        return PredictionResponse.model_validate(prediction)
    except SignalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
