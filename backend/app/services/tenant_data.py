"""Tenant-scoped Neon wipe (Reset Demo / Partner Demo / partner deletion).

Deletes conversations, messages, predictions, feedback, supervised action
decisions, and pilot_settings for one tenant only. Explicit wipe is the
only path that hard-deletes feedback — live SignalScore keep-set scoring
must not delete reviews.
"""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.models.pilot_settings import PilotSettings
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.models.supervised_action import SupervisedActionDecision
from app.models.taxonomy_override import TaxonomyOverride


def wipe_tenant_data(db: Session, *, tenant_id: str) -> dict[str, int]:
    """Delete all Neon rows for ``tenant_id``. Never touches other tenants.

    Order: feedback → predictions → decisions → messages → conversations →
    pilot_settings (feedback FK to predictions).
    """
    feedback_deleted = db.execute(
        delete(SignalFeedback).where(SignalFeedback.tenant_id == tenant_id)
    ).rowcount
    decisions_deleted = db.execute(
        delete(SupervisedActionDecision).where(
            SupervisedActionDecision.tenant_id == tenant_id
        )
    ).rowcount
    predictions_deleted = db.execute(
        delete(SignalPrediction).where(SignalPrediction.tenant_id == tenant_id)
    ).rowcount
    messages_deleted = db.execute(
        delete(Message).where(Message.tenant_id == tenant_id)
    ).rowcount
    conversations_deleted = db.execute(
        delete(Conversation).where(Conversation.tenant_id == tenant_id)
    ).rowcount
    pilot_deleted = db.execute(
        delete(PilotSettings).where(PilotSettings.tenant_id == tenant_id)
    ).rowcount
    taxonomy_deleted = db.execute(
        delete(TaxonomyOverride).where(TaxonomyOverride.tenant_id == tenant_id)
    ).rowcount
    db.commit()

    return {
        "conversations": int(conversations_deleted or 0),
        "messages": int(messages_deleted or 0),
        "predictions": int(predictions_deleted or 0),
        "feedback": int(feedback_deleted or 0),
        "supervised_actions": int(decisions_deleted or 0),
        "pilot_settings": int(pilot_deleted or 0),
        "taxonomy_overrides": int(taxonomy_deleted or 0),
    }


def count_tenant_rows(db: Session, *, tenant_id: str) -> dict[str, int]:
    """Row counts for assertions (tests)."""
    return {
        "conversations": int(
            db.scalar(
                select(func.count())
                .select_from(Conversation)
                .where(Conversation.tenant_id == tenant_id)
            )
            or 0
        ),
        "messages": int(
            db.scalar(
                select(func.count())
                .select_from(Message)
                .where(Message.tenant_id == tenant_id)
            )
            or 0
        ),
        "predictions": int(
            db.scalar(
                select(func.count())
                .select_from(SignalPrediction)
                .where(SignalPrediction.tenant_id == tenant_id)
            )
            or 0
        ),
        "feedback": int(
            db.scalar(
                select(func.count())
                .select_from(SignalFeedback)
                .where(SignalFeedback.tenant_id == tenant_id)
            )
            or 0
        ),
        "supervised_actions": int(
            db.scalar(
                select(func.count())
                .select_from(SupervisedActionDecision)
                .where(SupervisedActionDecision.tenant_id == tenant_id)
            )
            or 0
        ),
        "pilot_settings": int(
            db.scalar(
                select(func.count())
                .select_from(PilotSettings)
                .where(PilotSettings.tenant_id == tenant_id)
            )
            or 0
        ),
        "taxonomy_overrides": int(
            db.scalar(
                select(func.count())
                .select_from(TaxonomyOverride)
                .where(TaxonomyOverride.tenant_id == tenant_id)
            )
            or 0
        ),
    }
