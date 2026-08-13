"""Service for recording and listing signal predictions."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.signal_prediction import SignalPrediction
from app.services.feedback import SignalNotFoundError


class PredictionNotReviewedError(Exception):
    """Raised when Acted is set on a prediction that has no feedback."""


def record_prediction(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    signal_type: str,
    confidence: float,
    summary: str,
) -> SignalPrediction:
    """Insert or update the prediction for tenant + conversation + type.

    Re-detect / Partner Demo reuse the same Neon row so feedback stays attached.
    """
    existing = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.conversation_id == conversation_id,
            SignalPrediction.signal_type == signal_type,
        )
    )
    if existing is not None:
        existing.confidence = confidence
        existing.summary = summary
        db.commit()
        db.refresh(existing)
        return existing

    prediction = SignalPrediction(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        signal_type=signal_type,
        confidence=confidence,
        summary=summary,
    )
    db.add(prediction)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = db.scalar(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
                SignalPrediction.conversation_id == conversation_id,
                SignalPrediction.signal_type == signal_type,
            )
        )
        if raced is None:
            raise
        raced.confidence = confidence
        raced.summary = summary
        db.commit()
        db.refresh(raced)
        return raced

    db.refresh(prediction)
    return prediction


def list_tenant_predictions(
    db: Session,
    tenant_id: str,
) -> list[SignalPrediction]:
    """Return this tenant's predictions with feedback loaded. Newest first."""
    stmt = (
        select(SignalPrediction)
        .options(joinedload(SignalPrediction.feedback))
        .where(SignalPrediction.tenant_id == tenant_id)
        .order_by(SignalPrediction.created_at.desc())
    )
    return list(db.scalars(stmt).unique().all())


def set_prediction_acted(
    db: Session,
    *,
    tenant_id: str,
    signal_id: UUID,
    acted: bool,
) -> SignalPrediction:
    """Set or clear Acted. Requires existing feedback. Tenant-scoped."""
    prediction = db.scalar(
        select(SignalPrediction)
        .options(joinedload(SignalPrediction.feedback))
        .where(
            SignalPrediction.id == signal_id,
            SignalPrediction.tenant_id == tenant_id,
        )
    )
    if prediction is None:
        raise SignalNotFoundError(f"Signal {signal_id} not found for tenant")
    if prediction.feedback is None:
        raise PredictionNotReviewedError(
            "Signal must be reviewed before marking acted"
        )

    prediction.acted = acted
    db.commit()
    db.refresh(prediction)
    return prediction
