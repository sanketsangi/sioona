"""Service for recording signal predictions."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.signal_prediction import SignalPrediction


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
