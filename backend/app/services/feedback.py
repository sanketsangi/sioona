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


def record_feedback(
    db: Session,
    *,
    tenant_id: str,
    signal_id: UUID,
    feedback: str,
    reviewed_by: str,
    note: str | None = None,
) -> SignalFeedback:
    """Create or update human feedback for a prediction.

    Re-reviews update the existing row in place. Feedback rows are never deleted.
    """
    if feedback not in FEEDBACK_LABELS:
        raise InvalidFeedbackLabelError(
            f"feedback must be one of: {', '.join(sorted(FEEDBACK_LABELS))}"
        )

    prediction = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.id == signal_id,
            SignalPrediction.tenant_id == tenant_id,
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

    if existing is None:
        row = SignalFeedback(
            tenant_id=tenant_id,
            signal_id=signal_id,
            feedback=feedback,
            note=note,
            reviewed_by=reviewed_by,
            reviewed_at=now,
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
        else:
            db.refresh(row)
            return row

    existing.feedback = feedback
    existing.note = note
    existing.reviewed_by = reviewed_by
    existing.reviewed_at = now
    db.commit()
    db.refresh(existing)
    return existing