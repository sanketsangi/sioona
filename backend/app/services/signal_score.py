"""SignalScore calculation from human-reviewed predictions."""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.signal_feedback import (
    FEEDBACK_CORRECT,
    FEEDBACK_INCORRECT,
    FEEDBACK_PARTIALLY_CORRECT,
    SignalFeedback,
)
from app.models.signal_prediction import SignalPrediction


@dataclass
class TypeScoreBucket:
    """Counts for one signal_type."""

    signal_type: str
    reviewed_count: int = 0
    correct_count: int = 0
    incorrect_count: int = 0
    partially_correct_count: int = 0

    @property
    def signal_score(self) -> float | None:
        if self.reviewed_count == 0:
            return None
        return self.correct_count / self.reviewed_count


@dataclass
class SignalScoreResult:
    """Overall SignalScore plus per-type breakdown."""

    tenant_id: str
    reviewed_count: int
    correct_count: int
    incorrect_count: int
    partially_correct_count: int
    by_signal_type: list[TypeScoreBucket]

    @property
    def signal_score(self) -> float | None:
        """correct / reviewed; null when nothing has been reviewed."""
        if self.reviewed_count == 0:
            return None
        return self.correct_count / self.reviewed_count


def _empty_score(tenant_id: str) -> SignalScoreResult:
    return SignalScoreResult(
        tenant_id=tenant_id,
        reviewed_count=0,
        correct_count=0,
        incorrect_count=0,
        partially_correct_count=0,
        by_signal_type=[],
    )


def resolve_score_keep_set(
    db: Session,
    tenant_id: str,
    conversation_ids: Sequence[str] | None,
) -> frozenset[str] | None:
    """Keep-set of conversation_ids to score, or None for tenant-wide.

    Resolution order:
    1. Client-provided sequence wins, including empty (no matching conversations).
    2. Else Neon ``conversations`` ids for this tenant, if any rows exist.
    3. Else None — legacy tenant-wide predictions ⨝ feedback.
    """
    if conversation_ids is not None:
        return frozenset(cid for cid in conversation_ids if cid)
    neon_ids = db.execute(
        select(Conversation.conversation_id).where(
            Conversation.tenant_id == tenant_id
        )
    ).scalars().all()
    if neon_ids:
        return frozenset(neon_ids)
    return None


def _reviewed_query(
    tenant_id: str,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
    signal_type: str | None,
    conversation_ids: frozenset[str] | None,
) -> Select:
    """Build join of predictions with feedback for a tenant."""
    stmt = (
        select(SignalPrediction, SignalFeedback)
        .join(SignalFeedback, SignalFeedback.signal_id == SignalPrediction.id)
        .where(SignalPrediction.tenant_id == tenant_id)
        .where(SignalFeedback.tenant_id == tenant_id)
    )
    if date_from is not None:
        stmt = stmt.where(SignalPrediction.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(SignalPrediction.created_at <= date_to)
    if signal_type is not None:
        stmt = stmt.where(SignalPrediction.signal_type == signal_type)
    if conversation_ids is not None:
        stmt = stmt.where(SignalPrediction.conversation_id.in_(conversation_ids))
    return stmt


def calculate_signal_score(
    db: Session,
    tenant_id: str,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    signal_type: str | None = None,
    conversation_ids: Sequence[str] | None = None,
) -> SignalScoreResult:
    """Compute SignalScore from human-reviewed signals only.

    SignalScore = count(correct) / count(reviewed).
    partially_correct and incorrect count in the denominator only.

    When ``conversation_ids`` is provided, only reviews whose prediction
    ``conversation_id`` is in that keep-set count. Orphan leftover reviews
    (e.g. Partner Demo) may remain in Neon; they are not deleted and are
    excluded from the score.
    """
    keep_set = resolve_score_keep_set(db, tenant_id, conversation_ids)
    if keep_set is not None and len(keep_set) == 0:
        return _empty_score(tenant_id)

    rows = db.execute(
        _reviewed_query(
            tenant_id,
            date_from=date_from,
            date_to=date_to,
            signal_type=signal_type,
            conversation_ids=keep_set,
        )
    ).all()

    buckets: dict[str, TypeScoreBucket] = defaultdict(
        lambda: TypeScoreBucket(signal_type="")
    )
    reviewed_count = 0
    correct_count = 0
    incorrect_count = 0
    partially_correct_count = 0

    for prediction, feedback in rows:
        reviewed_count += 1
        key = prediction.signal_type
        if key not in buckets:
            buckets[key] = TypeScoreBucket(signal_type=key)
        bucket = buckets[key]
        bucket.reviewed_count += 1

        if feedback.feedback == FEEDBACK_CORRECT:
            correct_count += 1
            bucket.correct_count += 1
        elif feedback.feedback == FEEDBACK_INCORRECT:
            incorrect_count += 1
            bucket.incorrect_count += 1
        elif feedback.feedback == FEEDBACK_PARTIALLY_CORRECT:
            partially_correct_count += 1
            bucket.partially_correct_count += 1

    by_type = sorted(buckets.values(), key=lambda b: b.signal_type)
    return SignalScoreResult(
        tenant_id=tenant_id,
        reviewed_count=reviewed_count,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        partially_correct_count=partially_correct_count,
        by_signal_type=by_type,
    )