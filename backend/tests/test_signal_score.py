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
from app.services.pilot import upsert_pilot_settings
from app.services.predictions import list_tenant_predictions, record_prediction
from app.services.review_queue import list_signals_needing_review, shuffle_predictions
from app.models.signal_prediction import SignalPrediction
from app.services.signal_score import ScoreCounts, calculate_signal_score


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
    assert result.first_reviewed_at is None
    assert result.last_reviewed_at is None


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
    assert result.signal_score == pytest.approx(3 / 5)


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
    assert result.reviewed_count == 2
    assert result.correct_count == 1
    assert result.incorrect_count == 1
    assert result.signal_score == pytest.approx(0.5)
    by_type = {b.signal_type: b for b in result.by_signal_type}
    assert list(by_type) == ["lead"]
    assert by_type["lead"].reviewed_count == 1
    assert by_type["lead"].correct_count == 1
    assert by_type["lead"].signal_score == pytest.approx(1.0)


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
    assert result.first_reviewed_at == datetime(2026, 8, 1, tzinfo=timezone.utc)
    assert result.last_reviewed_at == datetime(2026, 8, 1, tzinfo=timezone.utc)


def test_signal_score_review_span_is_in_slice_min_max(db: Session) -> None:
    """First and last times are reviews inside the window, not the filter bounds."""
    early = _pred(db, conversation_id="c_early")
    late = _pred(db, conversation_id="c_late")
    outside = _pred(db, conversation_id="c_out")

    early_at = datetime(2026, 8, 2, 9, 15, tzinfo=timezone.utc)
    late_at = datetime(2026, 8, 20, 16, 40, tzinfo=timezone.utc)
    outside_at = datetime(2026, 1, 1, 1, tzinfo=timezone.utc)
    for pred, reviewed_at in (
        (early, early_at),
        (late, late_at),
        (outside, outside_at),
    ):
        fb = record_feedback(
            db,
            tenant_id="tenant_a",
            signal_id=pred.id,
            feedback="correct",
            reviewed_by="r1",
        )
        fb.reviewed_at = reviewed_at
    db.commit()

    result = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
        date_to=datetime(2026, 8, 31, tzinfo=timezone.utc),
    )
    assert result.reviewed_count == 2
    assert result.first_reviewed_at == early_at
    assert result.last_reviewed_at == late_at


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
    assert result.first_reviewed_at == datetime(2026, 8, 10, tzinfo=timezone.utc)
    assert result.last_reviewed_at == datetime(2026, 8, 10, tzinfo=timezone.utc)

    empty_window = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 1, tzinfo=timezone.utc),
        conversation_ids=["pack_1", "pack_2"],
    )
    assert empty_window.reviewed_count == 0
    assert empty_window.signal_score is None
    assert empty_window.first_reviewed_at is None
    assert empty_window.last_reviewed_at is None

    empty_keep = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
        conversation_ids=[],
    )
    assert empty_keep.reviewed_count == 0
    assert empty_keep.signal_score is None
    assert empty_keep.first_reviewed_at is None
    assert empty_keep.last_reviewed_at is None


def test_omitted_ids_skip_chats_from_before_the_weekly_file(db: Session) -> None:
    """A weekly file does not score the previous pack still sitting in Neon."""
    cutoff = datetime(2026, 9, 27, 21, 52, 29, tzinfo=timezone.utc)
    reviewed_at = datetime(2026, 9, 27, 22, 0, tzinfo=timezone.utc)
    old = _conversation(db, conversation_id="old_pack")
    current = _conversation(db, conversation_id="week7_pack")
    old.updated_at = cutoff - timedelta(hours=1)
    current.updated_at = cutoff + timedelta(minutes=1)
    pilot = upsert_pilot_settings(
        db,
        tenant_id="tenant_a",
        baseline_opportunities=0,
        weekly_export_count=2,
        last_uploaded_file_name="Zerodha_week_7_batch_01.json",
    )
    pilot.updated_at = cutoff
    db.commit()

    for conversation_id in ("old_pack", "week7_pack"):
        pred = _pred(db, conversation_id=conversation_id)
        fb = record_feedback(
            db,
            tenant_id="tenant_a",
            signal_id=pred.id,
            feedback="correct",
            reviewed_by="r1",
        )
        fb.reviewed_at = reviewed_at
    db.commit()

    scoped = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 21, tzinfo=timezone.utc),
    )
    assert scoped.reviewed_count == 1
    assert scoped.correct_count == 1

    explicit = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 21, tzinfo=timezone.utc),
        conversation_ids=["old_pack"],
    )
    assert explicit.reviewed_count == 1


def test_showcase_file_still_scores_every_neon_chat(db: Session) -> None:
    cutoff = datetime(2026, 9, 27, 21, 52, 29, tzinfo=timezone.utc)
    reviewed_at = datetime(2026, 9, 27, 22, 0, tzinfo=timezone.utc)
    old = _conversation(db, conversation_id="sample_old")
    current = _conversation(db, conversation_id="sample_new")
    old.updated_at = cutoff - timedelta(hours=1)
    current.updated_at = cutoff + timedelta(minutes=1)
    pilot = upsert_pilot_settings(
        db,
        tenant_id="tenant_a",
        baseline_opportunities=0,
        last_uploaded_file_name="Groww_batch_02",
    )
    pilot.updated_at = cutoff
    db.commit()

    for conversation_id in ("sample_old", "sample_new"):
        pred = _pred(db, conversation_id=conversation_id)
        fb = record_feedback(
            db,
            tenant_id="tenant_a",
            signal_id=pred.id,
            feedback="correct",
            reviewed_by="r1",
        )
        fb.reviewed_at = reviewed_at
    db.commit()

    result = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 21, tzinfo=timezone.utc),
    )
    assert result.reviewed_count == 2


def test_week_window_counts_every_in_window_correct(db: Session) -> None:
    """Keep-set week window counts every in-window Correct; overall ≠ one type."""
    lead = _pred(db, conversation_id="pack_lead", signal_type="lead")
    ret = _pred(db, conversation_id="pack_ret", signal_type="retention")
    up = _pred(db, conversation_id="pack_up", signal_type="upsell")
    old = _pred(db, conversation_id="pack_old", signal_type="lead")
    orphan = _pred(db, conversation_id="orphan_demo", signal_type="retention")

    in_window = datetime(2026, 9, 4, 12, tzinfo=timezone.utc)
    out_window = datetime(2026, 8, 1, tzinfo=timezone.utc)
    for pred, label, reviewed_at in (
        (lead, "correct", in_window),
        (ret, "correct", in_window),
        (up, "correct", in_window),
        (old, "correct", out_window),
        (orphan, "correct", in_window),
    ):
        fb = record_feedback(
            db,
            tenant_id="tenant_a",
            signal_id=pred.id,
            feedback=label,
            reviewed_by="r1",
        )
        fb.reviewed_at = reviewed_at
    db.commit()

    result = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 4, 10, 11, 15, tzinfo=timezone.utc),
        conversation_ids=["pack_lead", "pack_ret", "pack_up", "pack_old"],
    )
    assert result.reviewed_count == 3
    assert result.correct_count == 3
    assert result.incorrect_count == 0
    assert result.partially_correct_count == 0
    assert result.signal_score == pytest.approx(1.0)
    assert result.first_reviewed_at == in_window
    assert result.last_reviewed_at == in_window
    by_type = {b.signal_type: b for b in result.by_signal_type}
    assert by_type["lead"].correct_count == 1
    assert by_type["retention"].correct_count == 1
    assert by_type["upsell"].correct_count == 1
    assert (
        sum(b.reviewed_count for b in result.by_signal_type) == result.reviewed_count
    )

    naive_from = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 9, 4, 10, 11, 15),  # naive UTC
        conversation_ids=["pack_lead", "pack_ret", "pack_up", "pack_old"],
    )
    assert naive_from.reviewed_count == 3
    assert naive_from.correct_count == 3


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


def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def test_score_counts_coerce_sql_count_to_int() -> None:
    from decimal import Decimal

    counts = ScoreCounts()
    counts.add("correct", Decimal("2"))
    counts.add("incorrect", "1")  # type: ignore[arg-type]
    counts.add("partially_correct", 0)
    counts.add("accept", 4)
    assert counts.reviewed_count == 3
    assert counts.correct_count == 2
    assert counts.incorrect_count == 1
    assert counts.partially_correct_count == 0
    assert isinstance(counts.reviewed_count, int)
    assert counts.signal_score == pytest.approx(2 / 3)


def test_record_feedback_same_label_does_not_bump_reviewed_at(db: Session) -> None:
    p = _pred(db)
    first = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="correct",
        reviewed_by="r1",
        note="kept",
    )
    stamped = datetime(2026, 1, 1, tzinfo=timezone.utc)
    first.reviewed_at = stamped
    db.commit()

    second = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="correct",
        reviewed_by="r2",
        note="  kept  ",
    )
    assert second.id == first.id
    assert _as_utc(second.reviewed_at) == stamped
    assert second.reviewed_by == "r1"
    assert second.note == "kept"


def test_record_feedback_if_absent_does_not_clobber(db: Session) -> None:
    p = _pred(db)
    first = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="incorrect",
        reviewed_by="r1",
        note="kept",
    )
    stamped = datetime(2026, 1, 1, tzinfo=timezone.utc)
    first.reviewed_at = stamped
    db.commit()

    second = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="correct",
        reviewed_by="replay",
        note="stale json",
        reviewed_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        if_absent=True,
    )
    assert second.feedback == "incorrect"
    assert second.note == "kept"
    assert second.reviewed_by == "r1"
    assert _as_utc(second.reviewed_at) == stamped


def test_record_feedback_if_absent_inserts_original_reviewed_at(db: Session) -> None:
    p = _pred(db, conversation_id="c_replay")
    stamp = datetime(2026, 8, 2, tzinfo=timezone.utc)
    row = record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=p.id,
        feedback="correct",
        reviewed_by="replay",
        reviewed_at=stamp,
        if_absent=True,
    )
    assert _as_utc(row.reviewed_at) == stamp

    window = calculate_signal_score(
        db,
        "tenant_a",
        date_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
        date_to=datetime(2026, 8, 3, tzinfo=timezone.utc),
        conversation_ids=["c_replay"],
    )
    assert window.reviewed_count == 1
    assert window.correct_count == 1
    assert window.signal_score == pytest.approx(1.0)


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


def test_signal_score_excludes_non_canonical_signal_types(db: Session) -> None:
    """Legacy / junk types must not dilute keep-set SignalScore."""
    good = _pred(db, conversation_id="c_canon", signal_type="retention")
    junk = SignalPrediction(
        tenant_id="tenant_a",
        conversation_id="c_junk",
        signal_type="retention_risk",
        confidence=0.9,
        summary="Legacy name",
    )
    db.add(junk)
    db.commit()
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=good.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=junk.id,
        feedback="incorrect",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 1
    assert result.correct_count == 1
    assert result.incorrect_count == 0
    assert result.signal_score == pytest.approx(1.0)
    assert [bucket.signal_type for bucket in result.by_signal_type] == [
        "retention"
    ]


def test_needs_review_excludes_non_canonical_signal_types(db: Session) -> None:
    """Junk types stay out of the pending queue that feeds SignalScore."""
    good = _pred(db, conversation_id="c_canon", signal_type="lead")
    junk = SignalPrediction(
        tenant_id="tenant_a",
        conversation_id="c_junk",
        signal_type="churn_risk",
        confidence=0.9,
        summary="Not a product type",
    )
    db.add(junk)
    db.commit()

    queue = list_signals_needing_review(db, "tenant_a", limit=20)
    ids = {row.id for row in queue}
    assert good.id in ids
    assert junk.id not in ids


def test_needs_review_still_queues_non_canonical_feedback(db: Session) -> None:
    """Legacy / corrupt labels are not 'reviewed' for the pending queue."""
    from app.models.signal_feedback import SignalFeedback

    open_sig = _pred(db, conversation_id="c_legacy")
    db.add(
        SignalFeedback(
            tenant_id="tenant_a",
            signal_id=open_sig.id,
            feedback="accept",
            reviewed_by="r1",
        )
    )
    db.commit()

    queue = list_signals_needing_review(db, "tenant_a", limit=20)
    assert open_sig.id in {row.id for row in queue}


def test_needs_review_shuffles_signal_types(db: Session) -> None:
    lead = _pred(db, conversation_id="c_lead", signal_type="lead")
    upsell = _pred(db, conversation_id="c_upsell", signal_type="upsell")
    retention = _pred(db, conversation_id="c_ret", signal_type="retention")
    newer_lead = _pred(db, conversation_id="c_lead2", signal_type="lead")
    newer_lead.created_at = datetime.now(timezone.utc) + timedelta(seconds=5)
    db.commit()

    queue = list_signals_needing_review(db, "tenant_a", limit=20)
    again = list_signals_needing_review(db, "tenant_a", limit=20)
    expected = [
        row.id
        for row in shuffle_predictions([lead, upsell, retention, newer_lead])
    ]
    assert [row.id for row in queue] == expected
    assert [row.id for row in again] == expected


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


def test_signal_score_excludes_non_canonical_feedback(db: Session) -> None:
    """Corrupt / legacy labels must not dilute SignalScore."""
    from app.models.signal_feedback import SignalFeedback

    good = _pred(db, conversation_id="c_good")
    bad = _pred(db, conversation_id="c_bad")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=good.id,
        feedback="correct",
        reviewed_by="r1",
    )
    db.add(
        SignalFeedback(
            tenant_id="tenant_a",
            signal_id=bad.id,
            feedback="accept",  # legacy JSON label — not canonical
            reviewed_by="r1",
        )
    )
    db.commit()

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 1
    assert result.correct_count == 1
    assert result.incorrect_count == 0
    assert result.partially_correct_count == 0
    assert result.signal_score == pytest.approx(1.0)
    assert (
        result.correct_count
        + result.incorrect_count
        + result.partially_correct_count
        == result.reviewed_count
    )


def test_signal_score_counts_partial_in_denominator(db: Session) -> None:
    """A partial review is reviewed, so it lowers correct / reviewed."""
    correct_only = _pred(db, conversation_id="c1")
    with_partial = _pred(db, conversation_id="c2")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=correct_only.id,
        feedback="correct",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=with_partial.id,
        feedback="partially_correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 2
    assert result.correct_count == 1
    assert result.partially_correct_count == 1
    assert result.signal_score == pytest.approx(0.5)


def test_signal_score_zero_when_only_partial_reviews(db: Session) -> None:
    partial = _pred(db, conversation_id="c_partial")
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=partial.id,
        feedback="partially_correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert result.reviewed_count == 1
    assert result.partially_correct_count == 1
    assert result.signal_score == pytest.approx(0.0)


def test_signal_score_counts_invariant(db: Session) -> None:
    lead = _pred(db, conversation_id="c1", signal_type="lead")
    ret = _pred(db, conversation_id="c2", signal_type="retention")
    up = _pred(db, conversation_id="c3", signal_type="upsell")
    record_feedback(
        db, tenant_id="tenant_a", signal_id=lead.id, feedback="correct", reviewed_by="r1"
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=ret.id,
        feedback="incorrect",
        reviewed_by="r1",
    )
    record_feedback(
        db,
        tenant_id="tenant_a",
        signal_id=up.id,
        feedback="partially_correct",
        reviewed_by="r1",
    )

    result = calculate_signal_score(db, "tenant_a")
    assert (
        result.correct_count
        + result.incorrect_count
        + result.partially_correct_count
        == result.reviewed_count
    )
    for bucket in result.by_signal_type:
        assert (
            bucket.correct_count
            + bucket.incorrect_count
            + bucket.partially_correct_count
            == bucket.reviewed_count
        )
        if bucket.reviewed_count == 0:
            assert bucket.signal_score is None
        else:
            assert bucket.signal_score == pytest.approx(
                bucket.correct_count / bucket.reviewed_count
            )
    assert result.signal_score == pytest.approx(1 / 3)
    for index in range(105):
        _pred(db, conversation_id=f"c_clamp_{index}")

    assert len(list_signals_needing_review(db, "tenant_a", limit=0)) == 1
    assert len(list_signals_needing_review(db, "tenant_a", limit=50)) == 50
    assert len(list_signals_needing_review(db, "tenant_a", limit=101)) == 100


def test_needs_review_pages_keep_set_past_cap_and_drops_other_packs(
    db: Session,
) -> None:
    """A keep-set larger than 100 is reviewable; another corpus stays out."""
    keep_ids = [f"keep_{index}" for index in range(105)]
    for conversation_id in keep_ids:
        _pred(db, conversation_id=conversation_id)
    _pred(db, conversation_id="other_pack")

    first = list_signals_needing_review(
        db,
        "tenant_a",
        limit=101,
        offset=0,
        conversation_ids=keep_ids,
    )
    second = list_signals_needing_review(
        db,
        "tenant_a",
        limit=100,
        offset=100,
        conversation_ids=keep_ids,
    )
    assert len(first) == 100
    assert len(second) == 5
    seen = {row.id for row in first} | {row.id for row in second}
    assert len(seen) == 105
    assert {row.conversation_id for row in first + second} == set(keep_ids)
    assert list_signals_needing_review(
        db, "tenant_a", conversation_ids=[]
    ) == []
    assert list_signals_needing_review(
        db, "tenant_a", conversation_ids=[""]
    ) == []


def test_list_tenant_predictions_filters_to_keep_set(db: Session) -> None:
    keep = _pred(db, conversation_id="pack_keep")
    other = _pred(db, conversation_id="pack_other")
    scoped = list_tenant_predictions(
        db, "tenant_a", conversation_ids=["pack_keep"]
    )
    assert [row.id for row in scoped] == [keep.id]
    assert list_tenant_predictions(db, "tenant_a", conversation_ids=[]) == []
    assert {row.id for row in list_tenant_predictions(db, "tenant_a")} == {
        keep.id,
        other.id,
    }

