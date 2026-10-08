"""Prediction recording endpoints."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
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
from app.services.evidence_anchors import present_predictions
from app.services.predictions import (
    VersionedPredictionConflict,
    record_prediction,
    record_predictions_bulk,
    set_prediction_outcome,
)

router = guarded_router(tags=["predictions"])


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
        return present_predictions(PredictionResponse, db, tenant_id, prediction)
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
            predictions=present_predictions(
                PredictionResponse, db, tenant_id, [item.prediction for item in result.items]
            ),
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
        return present_predictions(PredictionResponse, db, tenant_id, prediction)
    except SignalNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc


@router.post(
    "/v1/tenants/{tenant_id}/predictions",
    response_model=PredictionResponse,
    status_code=201,
)
def create_prediction_for_tenant(
    tenant_id: str,
    body: PredictionCreate,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    return create_prediction(body, tenant_id, db)


@router.post(
    "/v1/tenants/{tenant_id}/predictions/bulk",
    response_model=PredictionBulkResponse,
    status_code=201,
)
def create_or_update_predictions_bulk_for_tenant(
    tenant_id: str,
    body: PredictionBulkUpsert,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionBulkResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    return create_or_update_predictions_bulk(body, tenant_id, db)


@router.post(
    "/v1/tenants/{tenant_id}/signals/{signal_id}/outcome",
    response_model=PredictionResponse,
)
def record_signal_outcome_for_tenant(
    tenant_id: str,
    signal_id: str,
    body: PredictionOutcomeUpdate,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> PredictionResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    return record_signal_outcome(signal_id, body, tenant_id, db)
