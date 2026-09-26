"""Shadow Mode review queue: predictions without feedback."""

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.signal_feedback import FEEDBACK_LABELS, SignalFeedback
from app.models.signal_prediction import CANONICAL_SIGNAL_TYPES, SignalPrediction

# Wider than the page so one type cannot fill `limit` before the shuffle.
_SHUFFLE_WINDOW = 300


def _queue_hash(value: str) -> int:
    """FNV-1a so the same prediction keeps its queue slot."""
    hash_value = 2166136261
    for char in value:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    return hash_value


def shuffle_predictions(rows: list[SignalPrediction]) -> list[SignalPrediction]:
    """Stable unordered queue. Type filters on Insights narrow the list."""
    return sorted(rows, key=lambda row: (_queue_hash(str(row.id)), str(row.id)))


def list_signals_needing_review(
    db: Session,
    tenant_id: str,
    *,
    limit: int = 20,
) -> list[SignalPrediction]:
    """Return unreviewed canonical predictions in a stable random order."""
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100

    # Canonical labels only — leftover `accept` / corrupt rows still need a
    # real Correct / Incorrect / Partially Correct. Tenant-scoped so a stray
    # row on another tenant cannot hide this prediction.
    unreviewed = ~exists(
        select(SignalFeedback.id).where(
            SignalFeedback.signal_id == SignalPrediction.id,
            SignalFeedback.tenant_id == tenant_id,
            SignalFeedback.feedback.in_(FEEDBACK_LABELS),
        )
    )
    stmt = (
        select(SignalPrediction)
        .where(SignalPrediction.tenant_id == tenant_id)
        .where(SignalPrediction.signal_type.in_(CANONICAL_SIGNAL_TYPES))
        .where(unreviewed)
        .order_by(SignalPrediction.created_at.desc(), SignalPrediction.id)
        .limit(_SHUFFLE_WINDOW)
    )
    shuffled = shuffle_predictions(list(db.scalars(stmt).all()))
    return shuffled[:limit]
