"""Service for recording human feedback on predictions."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.signal_feedback import FEEDBACK_LABELS, SignalFeedback
from app.models.signal_prediction import SignalPrediction


class FeedbackError(Exception):
    """Base error for feedback operations."""


class SignalNotFoundError(FeedbackError):
    """Raised when the prediction does not exist for the tenant."""


class InvalidFeedbackLabelError(FeedbackError):
    """Raised when feedback is not a canonical label."""


def _note_key(note: str | None) -> str | None:
    if note is None:
        return None
    trimmed = note.strip()
    return trimmed or None


def _stamp(value: datetime | None, now: datetime) -> datetime:
    """Aware UTC. Naive datetimes are UTC, matching score window bounds."""
    if value is None:
        return now
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def record_feedback(
    db: Session,
    *,
    tenant_id: str,
    signal_id: UUID,
    feedback: str,
    reviewed_by: str,
    note: str | None = None,
    reviewed_at: datetime | None = None,
    if_absent: bool = False,
) -> SignalFeedback:
    """Create or update human feedback for a prediction.

    Re-reviews update the existing row in place. Feedback rows are never deleted.
    The same label and note is a no-op so a timed-out retry does not move
    ``reviewed_at`` into a later week window.

    ``if_absent`` inserts only when Neon has no row. An existing label is left
    alone so a JSON replay cannot overwrite a newer Neon review. The insert
    keeps ``reviewed_at`` when the caller sends the original review time.
    """
    if feedback not in FEEDBACK_LABELS:
        raise InvalidFeedbackLabelError(
            f"feedback must be one of: {', '.join(sorted(FEEDBACK_LABELS))}"
        )

    prediction = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.id == signal_id,
            SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
        )
    )
    if prediction is None:
        raise SignalNotFoundError(f"Signal {signal_id} not found for tenant")

    existing = db.scalar(
        select(SignalFeedback).where(
            SignalFeedback.signal_id == signal_id,
            SignalFeedback.tenant_id == tenant_id,
        )
    )
    now = datetime.now(timezone.utc)

    def finish_existing(row: SignalFeedback) -> SignalFeedback:
        if if_absent:
            return row
        if row.feedback == feedback and _note_key(row.note) == _note_key(note):
            return row
        row.feedback = feedback
        row.note = note
        row.reviewed_by = reviewed_by
        row.reviewed_at = now
        db.commit()
        db.refresh(row)
        return row

    if existing is not None:
        return finish_existing(existing)

    row = SignalFeedback(
        tenant_id=tenant_id,
        signal_id=signal_id,
        feedback=feedback,
        note=note,
        reviewed_by=reviewed_by,
        reviewed_at=_stamp(reviewed_at, now) if if_absent else now,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # Client retried after a timeout; the first insert landed.
        db.rollback()
        existing = db.scalar(
            select(SignalFeedback).where(
                SignalFeedback.signal_id == signal_id,
                SignalFeedback.tenant_id == tenant_id,
            )
        )
        if existing is None:
            raise
        return finish_existing(existing)

    db.refresh(row)
    return row