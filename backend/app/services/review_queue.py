"""Shadow Mode review queue: predictions without feedback."""

from collections.abc import Sequence

from sqlalchemy import exists, func, literal_column, or_, select
from sqlalchemy.orm import Session

from app.models.message import Message

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
        .where(SignalPrediction.tenant_id == tenant_id).where(SignalPrediction.active.is_(True))
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


def queue_search(db: Session, tenant_id: str, q: str):
    """Search persisted text only; bind all user input and retain tenant probes."""
    q = q.strip()
    pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

    def matches(column):
        # Explicit regconfig must match the migration's expression indexes.
        if db.get_bind().dialect.name == "postgresql":
            vector = func.to_tsvector(literal_column("'simple'::regconfig"), column)
            terms = func.plainto_tsquery(literal_column("'simple'::regconfig"), q)
            return or_(vector.bool_op("@@")(terms), column.ilike(pattern, escape="\\"))
        return column.ilike(pattern, escape="\\")

    return or_(matches(SignalPrediction.summary), exists(select(Message.id).where(
        Message.tenant_id == tenant_id,
        Message.conversation_id == SignalPrediction.conversation_id,
        Message.role == "customer", matches(Message.content))))


def page_signals_needing_review(db: Session, tenant_id: str, *, limit: int = 20,
                                after: str | None = None, q: str | None = None,
                                conversation_ids: Sequence[str] | None = None):
    """Keyset pagination: database loads at most limit+1 rows, including keep-sets."""
    from uuid import UUID
    if not 1 <= limit <= 100:
        raise ValueError("Page limit must be 1..100")
    cursor = UUID(after) if after else None
    unreviewed = ~exists(select(SignalFeedback.id).where(
        SignalFeedback.signal_id == SignalPrediction.id,
        SignalFeedback.tenant_id == tenant_id, SignalFeedback.feedback.in_(FEEDBACK_LABELS)))
    stmt = select(SignalPrediction).where(SignalPrediction.tenant_id == tenant_id,
        SignalPrediction.active.is_(True), SignalPrediction.signal_type.in_(CANONICAL_SIGNAL_TYPES), unreviewed)
    if conversation_ids is not None:
        stmt = stmt.where(SignalPrediction.conversation_id.in_(conversation_ids))
    if q and q.strip():
        stmt = stmt.where(queue_search(db, tenant_id, q))
    if cursor is not None:
        stmt = stmt.where(SignalPrediction.id > cursor)
    rows = list(db.scalars(stmt.order_by(SignalPrediction.id).limit(limit + 1)).all())
    return rows[:limit], str(rows[limit - 1].id) if len(rows) > limit else None
