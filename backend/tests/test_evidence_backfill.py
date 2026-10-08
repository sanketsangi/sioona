"""Tenant backfill is dry-run by default, resumable, and does not rewrite reviews."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.detection_run import DetectionRun
from app.models.message import Message
from app.models.signal_evidence import SignalEvidence
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.services.evidence_anchors import text_sha256
from app.services.feedback import record_feedback
from scripts.backfill_signal_evidence import backfill_signal_evidence


def _quote_case(db: Session, *, tenant: str, conversation: str, message: str, content: str, signal: str, status: str | None):
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    if db.scalar(select(Conversation).where(Conversation.tenant_id == tenant, Conversation.conversation_id == conversation)) is None:
        db.add(Conversation(tenant_id=tenant, conversation_id=conversation, channel="upload", started_at=now))
        db.flush()
    db.add(Message(tenant_id=tenant, conversation_id=conversation, message_id=message, role="customer",
                   content=content, timestamp=now))
    db.add(DetectionRun(tenant_id=tenant, run_id="run", conversation_id=conversation, content_hash="ab" * 32,
                        model_version="m1", prompt_version="p1", status="active",
                        output=[{"signal_type": signal, "confidence": 0.9, "summary": "Leaving",
                                 "evidence": [f'quote: "{content}"']}]))
    prediction = SignalPrediction(tenant_id=tenant, conversation_id=conversation, detection_run_id="run",
                                  signal_type=signal, confidence=0.9, summary="Leaving", active=True,
                                  evidence_status=status, acted=True, outcome="retained", outcome_value_inr=1000)
    db.add(prediction)
    db.commit()
    record_feedback(db, tenant_id=tenant, signal_id=prediction.id, feedback="correct", reviewed_by="reviewer", note="kept")
    return prediction


def test_backfill_is_dry_run_isolated_resumable_and_preserves_reviews(db: Session, monkeypatch):
    from app.services import evidence_anchors

    kept = _quote_case(db, tenant="a", conversation="c1", message="m1", content="Please pause my SIP", signal="retention", status=None)
    second = _quote_case(db, tenant="a", conversation="c2", message="m2", content="I am opening a new account", signal="lead", status=None)
    stale = _quote_case(db, tenant="a", conversation="c3", message="m3", content="Leave the stale quote", signal="upsell", status="stale")
    db.add(SignalEvidence(tenant_id="a", prediction_id=stale.id, message_id="m3", start_cp=0,
                          end_cp=len("Leave the stale quote"), text_sha256=text_sha256("Leave the stale quote"),
                          candidate_turns=1))
    legacy = SignalPrediction(tenant_id="a", conversation_id="legacy", signal_type="retention", confidence=0.2,
                              summary="No provenance", active=True, acted=True, outcome="retained", outcome_value_inr=50)
    db.add(legacy)
    db.commit()
    record_feedback(db, tenant_id="a", signal_id=legacy.id, feedback="partially_correct", reviewed_by="reviewer", note="legacy")
    other = _quote_case(db, tenant="b", conversation="c1", message="m1", content="Please pause my SIP", signal="retention", status=None)
    raced = _quote_case(db, tenant="a", conversation="raced", message="m-race", content="replaced source text", signal="retention", status=None)
    raced_run = db.get(DetectionRun, ("a", "run", "raced"))
    raced_run.output = [{"signal_type": "retention", "confidence": 0.9, "summary": "Leaving",
                         "evidence": ['quote: "Please pause my SIP"']}]
    db.commit()

    original_turns = evidence_anchors.customer_turns

    def raced_turns(session, tenant_id, conversation_id):
        if conversation_id == "raced":
            return [("m-race", "Please pause my SIP")]
        return original_turns(session, tenant_id, conversation_id)

    monkeypatch.setattr(evidence_anchors, "customer_turns", raced_turns)

    dry = backfill_signal_evidence(db, tenant_id="a", apply=False, chunk_size=1)
    db.commit()
    assert dry["dry_run"] is True and dry["hashed"] > 0 and dry["anchored"] > 0
    assert db.get(Message, db.scalar(select(Message.id).where(Message.message_id == "m1", Message.tenant_id == "a"))).content_sha256 is None
    assert db.get(SignalPrediction, kept.id).evidence_status is None
    assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.prediction_id == kept.id)) == 0

    state = {"phase": "messages", "after": None}
    seen = []
    while True:
        state = backfill_signal_evidence(db, tenant_id="a", apply=True, chunk_size=1, max_chunks=1,
                                         phase=state["phase"], after=state["after"])
        db.commit()
        seen.append((state["phase"], state["anchored"], state["done"]))
        if state["done"]:
            break
        assert len(seen) < 20
    assert any(not done for _, _, done in seen[:-1])
    assert db.get(SignalPrediction, kept.id).evidence_status == "valid"
    assert db.get(SignalPrediction, second.id).evidence_status == "valid"
    assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.tenant_id == "a", SignalEvidence.prediction_id != stale.id)) == 2
    again = backfill_signal_evidence(db, tenant_id="a", apply=True, chunk_size=10)
    db.commit()
    assert again["anchored"] == 0
    assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.tenant_id == "a")) == 3

    assert db.get(SignalPrediction, stale.id).evidence_status == "stale"
    assert db.get(SignalPrediction, raced.id).evidence_status == "unresolved"
    assert db.scalar(select(SignalEvidence).where(SignalEvidence.prediction_id == raced.id)) is None
    assert db.get(SignalPrediction, legacy.id).evidence_status == "unresolved"
    for prediction, label, note in ((kept, "correct", "kept"), (legacy, "partially_correct", "legacy"), (stale, "correct", "kept")):
        row = db.get(SignalPrediction, prediction.id)
        feedback = db.scalar(select(SignalFeedback).where(SignalFeedback.signal_id == prediction.id))
        assert row.acted is True and row.outcome == "retained"
        assert feedback.feedback == label and feedback.note == note
    assert db.get(SignalPrediction, other.id).evidence_status is None
    other_message = db.scalar(select(Message).where(Message.tenant_id == "b", Message.message_id == "m1"))
    assert other_message.content_sha256 is None


def test_cli_requires_tenant():
    import pytest
    from scripts.backfill_signal_evidence import main
    with pytest.raises(SystemExit):
        main([])


def test_backfill_retries_unresolved_when_detection_provenance_can_anchor(db: Session):
    pending = _quote_case(
        db,
        tenant="a",
        conversation="retry-unresolved",
        message="m-retry",
        content="Please pause my SIP",
        signal="retention",
        status="unresolved",
    )
    assert db.scalar(
        select(SignalEvidence.id).where(SignalEvidence.prediction_id == pending.id)
    ) is None
    stats = backfill_signal_evidence(db, tenant_id="a", apply=True, chunk_size=50)
    db.commit()
    assert stats["anchored"] >= 1
    db.refresh(pending)
    assert pending.evidence_status == "valid"
    assert db.scalar(
        select(func.count()).select_from(SignalEvidence).where(
            SignalEvidence.prediction_id == pending.id
        )
    ) == 1


def test_write_anchors_skips_existing_spans(db: Session):
    from scripts.backfill_signal_evidence import _write_anchors

    kept = _quote_case(
        db,
        tenant="a",
        conversation="resume",
        message="m-resume",
        content="Please pause my SIP",
        signal="retention",
        status=None,
    )
    first = _write_anchors(db, kept)
    db.flush()
    assert first is True
    assert kept.evidence_status == "valid"
    count = db.scalar(
        select(func.count()).select_from(SignalEvidence).where(
            SignalEvidence.prediction_id == kept.id
        )
    )
    assert count == 1
    second = _write_anchors(db, kept)
    db.flush()
    assert second is True
    assert db.scalar(
        select(func.count()).select_from(SignalEvidence).where(
            SignalEvidence.prediction_id == kept.id
        )
    ) == count
