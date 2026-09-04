"""Prediction recording endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.prediction import (
    PredictionBulkResponse,
    PredictionBulkUpsert,
    PredictionCreate,
    PredictionResponse,
)
from app.services.predictions import record_prediction, record_predictions_bulk

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
        )
        return PredictionResponse.model_validate(prediction)
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
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
