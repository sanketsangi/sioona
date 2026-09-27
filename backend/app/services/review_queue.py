"""Shadow Mode review queue: predictions without feedback."""

from collections.abc import Sequence

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.signal_feedback import FEEDBACK_LABELS, SignalFeedback
from app.models.signal_prediction import CANONICAL_SIGNAL_TYPES, SignalPrediction

# Unfiltered tenant lists only shuffle the newest window. A keep-set
# (`conversation_ids`) shuffles every matching row so offset can walk past 100.
_SHUFFLE_WINDOW = 300
_PAGE_CAP = 100


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
    offset: int = 0,
    conversation_ids: Sequence[str] | None = None,
) -> list[SignalPrediction]:
    """Return unreviewed canonical predictions in a stable random order.

    Each call returns at most 100 rows. ``offset`` continues through that
    order so a keep-set larger than one page is still reviewable. When
    ``conversation_ids`` is set, only that keep-set is queued (``[]`` → no
    rows). Omitted → newest ``_SHUFFLE_WINDOW`` for this tenant, then paged.
    """
    if limit < 1:
        limit = 1
    if limit > _PAGE_CAP:
        limit = _PAGE_CAP
    if offset < 0:
        offset = 0

    keep: list[str] | None = None
    if conversation_ids is not None:
        keep = [cid for cid in conversation_ids if cid]
        if not keep:
            return []

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
    )
    if keep is not None:
        stmt = stmt.where(SignalPrediction.conversation_id.in_(keep))
    else:
        stmt = stmt.order_by(
            SignalPrediction.created_at.desc(), SignalPrediction.id
        ).limit(_SHUFFLE_WINDOW)
    shuffled = shuffle_predictions(list(db.scalars(stmt).all()))
    return shuffled[offset : offset + limit]
