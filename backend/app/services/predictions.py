"""Service for recording signal predictions."""

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
    """Persist a model prediction for a tenant conversation."""
    prediction = SignalPrediction(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        signal_type=signal_type,
        confidence=confidence,
        summary=summary,
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)
    return prediction