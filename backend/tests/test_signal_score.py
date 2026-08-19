"""Tests for SignalScore calculation and feedback validation."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.services.feedback import (
    InvalidFeedbackLabelError,
    SignalNotFoundError,
    record_feedback,
)
from app.services.predictions import record_prediction
from app.services.review_queue import list_signals_needing_review
from app.services.signal_score import calculate_signal_score


def _conversation(
    db: Session,
    *,
    tenant_id: str = "tenant_a",
    conversation_id: str = "conv_1",
) -> Conversation:
    row = Conversation(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        channel="whatsapp",
        customer_name="Keep",
        started_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )
    db.add(row)
    db.commit()
    return row


def _pred(
    db: Session,
    *,
    tenant_id: str = "tenant_a",
    conversation_id: str = "conv_1",
    signal_type: str = "lead",
    confidence: float = 0.9,
    summary: str = "Buying intent",
):
    return record_prediction(
        db,
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        signal_type=signal_type,
        confidence=confidence,
        summary=summary,
    )


def test_signal_score_null_when_no_reviews(db: Session) -> None:
    _pred(db)
    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 0
    assert result.signal_score is None
    assert result.by_signal_type == []


def test_signal_score_correct_over_reviewed(db: Session) -> None:
    p1 = _pred(db, conversation_id="c1")
    p2 = _pred(db, conversation_id="c2")
    p3 = _pred(db, conversation_id="c3")
    p4 = _pred(db, conversation_id="c4")
    p5 = _pred(db, conversation_id="c5")

    record_feedback(
        db, tenant_id="tenant_a", signal_id=p1.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db, tenant_id="tenant_a", signal_id=p2.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db, tenant_id="tenant_a", signal_id=p3.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db, tenant_id="tenant_a", signal_id=p4.id, feedback="incorrect", reviewed_by="r1"
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p5.id,
        feedback="partially_correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 5
    assert result.correct_count == 3
    assert result.incorrect_count == 1
    assert result.partially_correct_count == 1
    assert result.signal_score == pytest.approx(0.6)


def test_signal_score_per_type_breakdown(db: Session) -> None:
    lead = _pred(db, conversation_id="c1", signal_type="lead")
    upsell_ok = _pred(db, conversation_id="c2", signal_type="upsell")
    upsell_bad = _pred(db, conversation_id="c3", signal_type="upsell")

    record_feedback(
        db, tenant_id="tenant_a", signal_id=lead.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=upsell_ok.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=upsell_bad.id,
        feedback="incorrect",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    by_type = {b.signal_type: b for b in result.by_signal_type}
    assert by_type["lead"].signal_score == pytest.approx(1.0)
    assert by_type["upsell"].signal_score == pytest.approx(0.5)
    assert by_type["upsell"].reviewed_count == 2


def test_signal_score_filters_by_tenant(db: Session) -> None:
    a = _pred(db, tenant_id="tenant_a")
    b = _pred(db, tenant_id="tenant_b", conversation_id="c2")
    record_feedback(
        db, tenant_id="tenant_a", signal_id=a.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db, tenant_id="tenant_b", signal_id=b.id, feedback="incorrect", reviewed_by="r1"
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 1
    assert result.signal_score == pytest.approx(1.0)


def test_signal_score_filters_by_signal_type(db: Session) -> None:
    lead = _pred(db, conversation_id="c1", signal_type="lead")
    upsell = _pred(db, conversation_id="c2", signal_type="upsell")
    record_feedback(
        db, tenant_id="tenant_a", signal_id=lead.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=upsell.id,
        feedback="incorrect",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a", signal_type="lead")
    assert result.reviewed_count == 1
    assert result.correct_count == 1
    assert result.signal_score == pytest.approx(1.0)


def test_signal_score_filters_by_date_range(db: Session) -> None:
    old = _pred(db, conversation_id="c1")
    new = _pred(db, conversation_id="c2")

    old_fb = record_feedback(
        db, tenant_id="tenant_a", signal_id=old.id, feedback="incorrect", reviewed_by="r1"
    )
    new_fb = record_feedback(
        db, tenant_id="tenant_a", signal_id=new.id, feedback="correct", reviewed_by="r1"
    )

    old_fb.reviewed_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    new_fb.reviewed_at = datetime(2026, 8, 1, tzinfo=timezone.utc)
    db.commit()

    result = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 7, 1, tzinfo=timezone.utc),
        date_to=datetime(2026, 8, 31, tzinfo=timezone.utc),
    )
    assert result.reviewed_count == 1
    assert result.signal_score == pytest.approx(1.0)


def test_signal_score_keep_set_and_reviewed_at_compose(db: Session) -> None:
    """In-window keep-set counts; out-of-window and orphan Partner Demo excluded."""
    pack_in = _pred(db, conversation_id="pack_1")
    pack_out = _pred(db, conversation_id="pack_2")
    orphan = _pred(db, conversation_id="orphan_demo")

    fb_in = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=pack_in.id,
        feedback="correct",
        reviewed_by="r1",
    )
    fb_out = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=pack_out.id,
        feedback="correct",
        reviewed_by="r1",
    )
    fb_orphan = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=orphan.id,
        feedback="correct",
        reviewed_by="r1",
    )

    fb_in.reviewed_at = datetime(2026, 8, 10, tzinfo=timezone.utc)
    fb_out.reviewed_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    fb_orphan.reviewed_at = datetime(2026, 8, 10, tzinfo=timezone.utc)
    db.commit()

    result = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
        date_to=datetime(2026, 8, 31, tzinfo=timezone.utc),
        conversation_ids=["pack_1", "pack_2"],
    )
    assert result.reviewed_count == 1
    assert result.correct_count == 1
    assert result.signal_score == pytest.approx(1.0)

    empty_window = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 1, tzinfo=timezone.utc),
        conversation_ids=["pack_1", "pack_2"],
    )
    assert empty_window.reviewed_count == 0
    assert empty_window.signal_score is None

    empty_keep = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
        conversation_ids=[],
    )
    assert empty_keep.reviewed_count == 0
    assert empty_keep.signal_score is None


def test_record_feedback_rejects_invalid_label(db: Session) -> None:
    p = _pred(db)
    with pytest.raises(InvalidFeedbackLabelError):
        record_feedback(
            db,
            tenant_id="tenant_a",
            signal_id=p.id,
            feedback="accept",
            reviewed_by="r1",
        )


def test_record_feedback_not_found_for_wrong_tenant(db: Session) -> None:
    p = _pred(db, tenant_id="tenant_a")
    with pytest.raises(SignalNotFoundError):
        record_feedback(
            db,
            tenant_id="tenant_b",
            signal_id=p.id,
            feedback="correct",
            reviewed_by="r1",
        )


def test_record_feedback_upsert_updates_in_place(db: Session) -> None:
    p = _pred(db)
    first = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="incorrect",
        reviewed_by="r1",
        note="no",
    )
    second = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="correct",
        reviewed_by="r2",
        note="yes",
    )
    assert first.id == second.id
    assert second.feedback == "correct"
    assert second.reviewed_by == "r2"
    assert second.note == "yes"


def test_needs_review_excludes_reviewed(db: Session) -> None:
    open_sig = _pred(db, conversation_id="c1")
    reviewed = _pred(db, conversation_id="c2")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=reviewed.id,
        feedback="correct",
        reviewed_by="r1",
    )

    # Ensure ordering: bump open_sig newer
    open_sig.created_at = datetime.now(timezone.utc) + timedelta(seconds=1)
    db.commit()

    queue = list_signals_needing_review(db, "tenant_a", limit=20)
    ids = [s.id for s in queue]
    assert open_sig.id in ids
    assert reviewed.id not in ids


def test_needs_review_ranks_retention_first(db: Session) -> None:
    lead = _pred(db, conversation_id="c_lead", signal_type="lead")
    upsell = _pred(db, conversation_id="c_upsell", signal_type="upsell")
    retention = _pred(db, conversation_id="c_ret", signal_type="retention")
    newer_lead = _pred(db, conversation_id="c_lead2", signal_type="lead")
    newer_lead.created_at = datetime.now(timezone.utc) + timedelta(seconds=5)
    db.commit()

    queue = list_signals_needing_review(db, "tenant_a", limit=20)
    types = [row.signal_type for row in queue]
    assert types[0] == "retention"
    assert "upsell" in types
    assert types.index("retention") < types.index("upsell")
    assert types.index("upsell") < types.index("lead")
    assert {lead.id, upsell.id, retention.id, newer_lead.id} <= {row.id for row in queue}


def test_signal_score_excludes_orphan_reviews_when_keep_set_provided(
    db: Session,
) -> None:
    keep_ok = _pred(db, conversation_id="pack_1")
    keep_ok2 = _pred(db, conversation_id="pack_2")
    keep_bad = _pred(db, conversation_id="pack_3")
    orphan = _pred(db, conversation_id="orphan_demo")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=keep_ok.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=keep_ok2.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=keep_bad.id,
        feedback="incorrect",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=orphan.id,
        feedback="correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(
        db, "tenant_a", conversation_ids=["pack_1", "pack_2", "pack_3"]
    )
    assert result.reviewed_count == 3
    assert result.correct_count == 2
    assert result.incorrect_count == 1
    assert result.signal_score == pytest.approx(2 / 3)

    unscoped = calculate_signal_score(db, "tenant_a")
    assert unscoped.reviewed_count == 4
    assert unscoped.signal_score == pytest.approx(0.75)


def test_signal_score_neon_conversations_default_scope(db: Session) -> None:
    _conversation(db, conversation_id="pack_1")
    _conversation(db, conversation_id="pack_2")
    keep_ok = _pred(db, conversation_id="pack_1")
    keep_bad = _pred(db, conversation_id="pack_2")
    orphan = _pred(db, conversation_id="orphan_demo")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=keep_ok.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=keep_bad.id,
        feedback="incorrect",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=orphan.id,
        feedback="correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 2
    assert result.correct_count == 1
    assert result.incorrect_count == 1
    assert result.signal_score == pytest.approx(0.5)


def test_signal_score_empty_keep_set_is_zero_reviewed(db: Session) -> None:
    p = _pred(db, conversation_id="orphan_demo")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a", conversation_ids=[])
    assert result.reviewed_count == 0
    assert result.signal_score is None
    assert result.by_signal_type == []


def test_signal_score_keep_set_still_tenant_isolated(db: Session) -> None:
    a = _pred(db, tenant_id="tenant_a", conversation_id="shared_id")
    b = _pred(db, tenant_id="tenant_b", conversation_id="shared_id")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=a.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_b",
        signal_id=b.id,
        feedback="incorrect",
        reviewed_by="r1",
    )

    result = calculate_signal_score(
        db, "tenant_a", conversation_ids=["shared_id"]
    )
    assert result.reviewed_count == 1
    assert result.signal_score == pytest.approx(1.0)


def test_signal_score_neon_keep_set_is_tenant_scoped(db: Session) -> None:
    _conversation(db, tenant_id="tenant_a", conversation_id="pack_a")
    _conversation(db, tenant_id="tenant_b", conversation_id="pack_b")
    a = _pred(db, tenant_id="tenant_a", conversation_id="pack_a")
    a_orphan = _pred(db, tenant_id="tenant_a", conversation_id="pack_b")
    b = _pred(db, tenant_id="tenant_b", conversation_id="pack_b")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=a.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=a_orphan.id,
        feedback="incorrect",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_b",
        signal_id=b.id,
        feedback="incorrect",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 1
    assert result.signal_score == pytest.approx(1.0)


def test_needs_review_clamps_limit(db: Session) -> None:
    for index in range(105):
        _pred(db, conversation_id=f"c_clamp_{index}")

    assert len(list_signals_needing_review(db, "tenant_a", limit=0)) == 1
    assert len(list_signals_needing_review(db, "tenant_a", limit=50)) == 50
    assert len(list_signals_needing_review(db, "tenant_a", limit=101)) == 100

