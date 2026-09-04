"""SignalScore calculation from human-reviewed predictions."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.signal_feedback import (
    FEEDBACK_CORRECT,
    FEEDBACK_INCORRECT,
    FEEDBACK_LABELS,
    SignalFeedback,
)
from app.models.signal_prediction import SignalPrediction


@dataclass
class ScoreCounts:
    """Canonical feedback tallies. ``reviewed_count`` is always the sum of labels."""

    reviewed_count: int = 0
    correct_count: int = 0
    incorrect_count: int = 0
    partially_correct_count: int = 0

    def add(self, label: str, n: int = 1) -> None:
        """Accumulate only canonical labels; ignore corrupt / legacy rows."""
        if n <= 0 or label not in FEEDBACK_LABELS:
            return
        self.reviewed_count += n
        if label == FEEDBACK_CORRECT:
            self.correct_count += n
        elif label == FEEDBACK_INCORRECT:
            self.incorrect_count += n
        else:
            self.partially_correct_count += n

    @property
    def signal_score(self) -> float | None:
        """correct / reviewed; null when nothing has been reviewed."""
        if self.reviewed_count == 0:
            return None
        return self.correct_count / self.reviewed_count


@dataclass
class TypeScoreBucket(ScoreCounts):
    """Counts for one signal_type."""

    signal_type: str = ""


@dataclass
class SignalScoreResult:
    """Overall SignalScore plus per-type breakdown."""

    tenant_id: str
    reviewed_count: int
    correct_count: int
    incorrect_count: int
    partially_correct_count: int
    by_signal_type: list[TypeScoreBucket] = field(default_factory=list)

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


def _aware_utc(value: datetime | None) -> datetime | None:
    """Normalize score bounds to aware UTC so naive query datetimes cannot drop reviews."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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


def _reviewed_tally_query(
    tenant_id: str,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
    conversation_ids: frozenset[str] | None,
) -> Select:
    """Group reviewed predictions by type × canonical feedback label.

    ``date_from`` / ``date_to`` bound ``SignalFeedback.reviewed_at`` (not
    prediction ``created_at``) so week windows reflect when reviews happened.
    Non-canonical feedback labels are excluded so they cannot dilute the score.
    """
    stmt = (
        select(
            SignalPrediction.signal_type,
            SignalFeedback.feedback,
            func.count().label("n"),
        )
        .join(SignalFeedback, SignalFeedback.signal_id == SignalPrediction.id)
        .where(SignalPrediction.tenant_id == tenant_id)
        .where(SignalFeedback.tenant_id == tenant_id)
        .where(SignalFeedback.feedback.in_(FEEDBACK_LABELS))
        .group_by(SignalPrediction.signal_type, SignalFeedback.feedback)
    )
    if date_from is not None:
        stmt = stmt.where(SignalFeedback.reviewed_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(SignalFeedback.reviewed_at <= date_to)
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

    Overall is always the keep-set ∩ window total. ``by_signal_type`` is the
    same tally split by type (optionally one type when ``signal_type`` is set).
    The type filter never replaces overall.

    When ``conversation_ids`` is provided, only reviews whose prediction
    ``conversation_id`` is in that keep-set count. Orphan leftover reviews
    (e.g. Partner Demo) may remain in Neon; they are not deleted and are
    excluded from the score.
    """
    keep_set = resolve_score_keep_set(db, tenant_id, conversation_ids)
    if keep_set is not None and len(keep_set) == 0:
        return _empty_score(tenant_id)

    rows = db.execute(
        _reviewed_tally_query(
            tenant_id,
            date_from=_aware_utc(date_from),
            date_to=_aware_utc(date_to),
            conversation_ids=keep_set,
        )
    ).all()

    overall = ScoreCounts()
    buckets: dict[str, TypeScoreBucket] = {}

    for type_key, label, n in rows:
        overall.add(label, n)
        bucket = buckets.get(type_key)
        if bucket is None:
            bucket = TypeScoreBucket(signal_type=type_key)
            buckets[type_key] = bucket
        bucket.add(label, n)

    by_type = sorted(buckets.values(), key=lambda b: b.signal_type)
    if signal_type is not None:
        by_type = [bucket for bucket in by_type if bucket.signal_type == signal_type]

    return SignalScoreResult(
        tenant_id=tenant_id,
        reviewed_count=overall.reviewed_count,
        correct_count=overall.correct_count,
        incorrect_count=overall.incorrect_count,
        partially_correct_count=overall.partially_correct_count,
        by_signal_type=by_type,
    )
