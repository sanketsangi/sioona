"""SignalScore calculation from human-reviewed predictions."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

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


def _reviewed_query(
    tenant_id: str,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
    signal_type: str | None,
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
    return stmt


def calculate_signal_score(
    db: Session,
    tenant_id: str,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    signal_type: str | None = None,
) -> SignalScoreResult:
    """Compute SignalScore from human-reviewed signals only.

    SignalScore = count(correct) / count(reviewed).
    partially_correct and incorrect count in the denominator only.
    """
    rows = db.execute(
        _reviewed_query(
            tenant_id,
            date_from=date_from,
            date_to=date_to,
            signal_type=signal_type,
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