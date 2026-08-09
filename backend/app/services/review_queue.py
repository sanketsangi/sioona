"""Shadow Mode review queue: predictions without feedback."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction


def list_signals_needing_review(
    db: Session,
    tenant_id: str,
    *,
    limit: int = 20,
) -> list[SignalPrediction]:
    """Return recent unreviewed predictions for a tenant (newest first)."""
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100

    stmt = (
        select(SignalPrediction)
        .outerjoin(
            SignalFeedback,
            SignalFeedback.signal_id == SignalPrediction.id,
        )
        .where(SignalPrediction.tenant_id == tenant_id)
        .where(SignalFeedback.id.is_(None))
        .order_by(SignalPrediction.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())