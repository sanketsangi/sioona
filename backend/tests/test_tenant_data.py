"""Tenant wipe service — tenant isolation for Reset Demo / partner deletion."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.models.pilot_settings import PilotSettings
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.schemas.conversation import ConversationUpsert, MessageUpsert
from app.services.conversations import upsert_conversation
from app.services.feedback import record_feedback
from app.services.pilot import upsert_pilot_settings
from app.services.predictions import record_prediction
from app.services.supervised_actions import upsert_supervised_action_decision
from app.services.tenant_data import count_tenant_rows, wipe_tenant_data


def _ts(hour: int = 10) -> datetime:
    return datetime(2026, 8, 1, hour, 0, 0, tzinfo=timezone.utc)


def _payload(conversation_id: str = "conv_1") -> ConversationUpsert:
    return ConversationUpsert(
        conversation_id=conversation_id,
        channel="whatsapp",
        customer_name="Priya",
        started_at=_ts(10),
        external_id="priya_1",
        messages=[
            MessageUpsert(
                message_id=f"msg_{conversation_id}_0",
                role="customer",
                content="I want to close my account",
                timestamp=_ts(10),
            )
        ],
    )


def test_wipe_tenant_data_is_tenant_safe(db: Session) -> None:
    upsert_conversation(db, tenant_id="tenant_a", payload=_payload("conv_a"))
    upsert_conversation(db, tenant_id="tenant_b", payload=_payload("conv_b"))

    pred_a = record_prediction(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_a",
        signal_type="retention",
        confidence=0.9,
        summary="Close account",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=pred_a.id,
        feedback="correct",
        reviewed_by="reviewer_1",
    )
    pred_b = record_prediction(
        db,
        tenant_id="tenant_b",
        conversation_id="conv_b",
        signal_type="lead",
        confidence=0.8,
        summary="Other tenant",
    )
    record_feedback(
        db,
        tenant_id="tenant_b",
        signal_id=pred_b.id,
        feedback="incorrect",
        reviewed_by="reviewer_2",
    )
    upsert_pilot_settings(
        db,
        tenant_id="tenant_a",
        baseline_opportunities=4,
        baseline_note="demo",
        weekly_export_count=1,
    )
    upsert_pilot_settings(
        db,
        tenant_id="tenant_b",
        baseline_opportunities=10,
        baseline_note="keep",
        weekly_export_count=2,
    )
    upsert_supervised_action_decision(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_a",
        action_type="retention_email_draft",
        status="approved",
        subject="Your account",
        body="Hi,",
        evidence_quote="close",
    )
    upsert_supervised_action_decision(
        db,
        tenant_id="tenant_b",
        conversation_id="conv_b",
        action_type="lead_outreach_draft",
        status="dismissed",
        subject="Intro",
        body="Hello,",
    )

    counts = wipe_tenant_data(db, tenant_id="tenant_a")
    assert counts == {
        "uploads": 0,
        "upload_memberships": 0,
        "detection_runs": 0,
        "conversations": 1,
        "messages": 1,
        "predictions": 1,
        "feedback": 1,
        "supervised_actions": 1,
        "inference_attempts": 0,
        "pilot_settings": 1,
        "taxonomy_overrides": 0,
    }
    assert count_tenant_rows(db, tenant_id="tenant_a") == {
        "conversations": 0,
        "messages": 0,
        "predictions": 0,
        "feedback": 0,
        "supervised_actions": 0,
        "pilot_settings": 0,
        "taxonomy_overrides": 0,
    }

    assert count_tenant_rows(db, tenant_id="tenant_b") == {
        "conversations": 1,
        "messages": 1,
        "predictions": 1,
        "feedback": 1,
        "supervised_actions": 1,
        "pilot_settings": 1,
        "taxonomy_overrides": 0,
    }
    assert (
        db.scalar(
            select(Conversation).where(Conversation.tenant_id == "tenant_b")
        )
        is not None
    )
    assert (
        db.scalar(select(Message).where(Message.tenant_id == "tenant_b"))
        is not None
    )
    assert (
        db.scalar(
            select(SignalPrediction).where(SignalPrediction.tenant_id == "tenant_b")
        )
        is not None
    )
    assert (
        db.scalar(
            select(SignalFeedback).where(SignalFeedback.tenant_id == "tenant_b")
        )
        is not None
    )
    pilot_b = db.scalar(
        select(PilotSettings).where(PilotSettings.tenant_id == "tenant_b")
    )
    assert pilot_b is not None
    assert pilot_b.baseline_opportunities == 10


def test_wipe_tenant_data_empty_tenant_is_noop(db: Session) -> None:
    counts = wipe_tenant_data(db, tenant_id="tenant_missing")
    assert counts == {
        "uploads": 0,
        "upload_memberships": 0,
        "detection_runs": 0,
        "conversations": 0,
        "messages": 0,
        "predictions": 0,
        "feedback": 0,
        "supervised_actions": 0,
        "inference_attempts": 0,
        "pilot_settings": 0,
        "taxonomy_overrides": 0,
    }
