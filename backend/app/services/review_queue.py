"""Shadow Mode review queue: predictions without feedback."""

from sqlalchemy import case, exists, select
from sqlalchemy.orm import Session

from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction

# Retention is the primary product signal; then upsell; then lead.
_TYPE_RANK = case(
    (SignalPrediction.signal_type == "retention", 0),
    (SignalPrediction.signal_type == "upsell", 1),
    (SignalPrediction.signal_type == "lead", 2),
    else_=3,
)


def list_signals_needing_review(
    db: Session,
    tenant_id: str,
    *,
    limit: int = 20,
) -> list[SignalPrediction]:
    """Return unreviewed predictions: retention first, then newest."""
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100

    unreviewed = ~exists(
        select(SignalFeedback.id).where(
            SignalFeedback.signal_id == SignalPrediction.id
        )
    )
    stmt = (
        select(SignalPrediction)
        .where(SignalPrediction.tenant_id == tenant_id)
        .where(unreviewed)
        .order_by(_TYPE_RANK, SignalPrediction.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())