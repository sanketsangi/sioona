"""Upsert + tenant isolation for durable conversations/messages."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.schemas.conversation import ConversationUpsert, MessageUpsert
from app.services.conversations import (
    InvalidGroundTruthError,
    InvalidMessageRoleError,
    delete_conversation,
    list_conversations,
    patch_conversation_ground_truth,
    prune_conversations_not_in,
    upsert_conversation,
    upsert_conversations,
)
from app.services.feedback import record_feedback
from app.services.predictions import record_prediction


def _ts(hour: int = 10) -> datetime:
    return datetime(2026, 8, 1, hour, 0, 0, tzinfo=timezone.utc)


def _payload(
    *,
    conversation_id: str = "conv_1",
    channel: str = "whatsapp",
    customer_name: str | None = "Priya",
    external_id: str | None = "priya_1",
    messages: list[MessageUpsert] | None = None,
) -> ConversationUpsert:
    if messages is None:
        messages = [
            MessageUpsert(
                message_id="msg_conv_1_0",
                role="customer",
                content="I want to close my account",
                timestamp=_ts(10),
            ),
            MessageUpsert(
                message_id="msg_conv_1_1",
                role="agent",
                content="I can help with that",
                timestamp=_ts(11),
            ),
        ]
    return ConversationUpsert(
        conversation_id=conversation_id,
        channel=channel,
        customer_name=customer_name,
        started_at=_ts(10),
        external_id=external_id,
        messages=messages,
    )


def test_upsert_creates_conversation_and_messages(db: Session) -> None:
    result = upsert_conversation(db, tenant_id="tenant_a", payload=_payload())

    assert result.created is True
    assert result.messages_created == 2
    assert result.messages_updated == 0
    assert result.conversation.tenant_id == "tenant_a"
    assert result.conversation.conversation_id == "conv_1"
    assert result.conversation.channel == "whatsapp"
    assert result.conversation.customer_name == "Priya"
    assert result.conversation.external_id == "priya_1"
    assert len(result.messages) == 2
    assert result.messages[0].role == "customer"
    assert result.messages[1].role == "agent"

    conv_count = db.scalar(select(Conversation).where(Conversation.tenant_id == "tenant_a"))
    assert conv_count is not None
    msg_count = list(db.scalars(select(Message).where(Message.tenant_id == "tenant_a")).all())
    assert len(msg_count) == 2


def test_upsert_same_keys_updates_in_place(db: Session) -> None:
    first = upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    second = upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(
            channel="intercom",
            customer_name="Priya S",
            messages=[
                MessageUpsert(
                    message_id="msg_conv_1_0",
                    role="customer",
                    content="Updated — still closing",
                    timestamp=_ts(10),
                ),
                MessageUpsert(
                    message_id="msg_conv_1_1",
                    role="agent",
                    content="Updated reply",
                    timestamp=_ts(11),
                ),
            ],
        ),
    )

    assert second.created is False
    assert second.conversation.id == first.conversation.id
    assert second.conversation.channel == "intercom"
    assert second.conversation.customer_name == "Priya S"
    assert second.messages_created == 0
    assert second.messages_updated == 2
    assert {m.id for m in second.messages} == {m.id for m in first.messages}
    assert second.messages[0].content == "Updated — still closing"

    convs = list(db.scalars(select(Conversation)).all())
    msgs = list(db.scalars(select(Message)).all())
    assert len(convs) == 1
    assert len(msgs) == 2


def test_upsert_replaces_shorter_thread_and_drops_leftover_messages(
    db: Session,
) -> None:
    """Mid-week ingest uses msg_{conv}_{index}; a shorter export must not
    leave leftover turns for Insights overlay / hydrate re-detect."""
    upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(
            messages=[
                MessageUpsert(
                    message_id="msg_conv_1_0",
                    role="customer",
                    content="I want to close my account",
                    timestamp=_ts(10),
                ),
                MessageUpsert(
                    message_id="msg_conv_1_1",
                    role="agent",
                    content="I can help with that",
                    timestamp=_ts(11),
                ),
                MessageUpsert(
                    message_id="msg_conv_1_2",
                    role="customer",
                    content="Stale turn from last week's longer export",
                    timestamp=_ts(12),
                ),
            ],
        ),
    )
    upsert_conversation(
        db,
        tenant_id="tenant_b",
        payload=_payload(
            messages=[
                MessageUpsert(
                    message_id="msg_conv_1_0",
                    role="customer",
                    content="Other tenant keep-me",
                    timestamp=_ts(10),
                ),
                MessageUpsert(
                    message_id="msg_conv_1_1",
                    role="agent",
                    content="Other tenant agent",
                    timestamp=_ts(11),
                ),
                MessageUpsert(
                    message_id="msg_conv_1_2",
                    role="customer",
                    content="Other tenant leftover-if-wrong-scope",
                    timestamp=_ts(12),
                ),
            ],
        ),
    )

    shorter = upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(
            messages=[
                MessageUpsert(
                    message_id="msg_conv_1_0",
                    role="customer",
                    content="Still closing — shorter export",
                    timestamp=_ts(10),
                ),
                MessageUpsert(
                    message_id="msg_conv_1_1",
                    role="agent",
                    content="Updated reply",
                    timestamp=_ts(11),
                ),
            ],
        ),
    )

    assert shorter.created is False
    assert shorter.messages_created == 0
    assert shorter.messages_updated == 2
    listed_a = list_conversations(db, "tenant_a")
    assert [m.message_id for m in listed_a[0][1]] == [
        "msg_conv_1_0",
        "msg_conv_1_1",
    ]
    assert [m.content for m in listed_a[0][1]] == [
        "Still closing — shorter export",
        "Updated reply",
    ]
    leftover_a = db.scalar(
        select(Message).where(
            Message.tenant_id == "tenant_a",
            Message.message_id == "msg_conv_1_2",
        )
    )
    assert leftover_a is None

    listed_b = list_conversations(db, "tenant_b")
    assert [m.message_id for m in listed_b[0][1]] == [
        "msg_conv_1_0",
        "msg_conv_1_1",
        "msg_conv_1_2",
    ]
    assert listed_b[0][1][2].content == "Other tenant leftover-if-wrong-scope"


def test_empty_message_payload_does_not_wipe_existing_thread(db: Session) -> None:
    upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    metadata_only = _payload(messages=[])
    result = upsert_conversation(
        db, tenant_id="tenant_a", payload=metadata_only
    )

    assert result.messages_created == 0
    assert result.messages_updated == 0
    listed = list_conversations(db, "tenant_a")
    assert [m.message_id for m in listed[0][1]] == [
        "msg_conv_1_0",
        "msg_conv_1_1",
    ]


def test_upsert_does_not_duplicate_on_partner_demo_reload(db: Session) -> None:
    payload = _payload()
    upsert_conversations(db, tenant_id="tenant_demo", payloads=[payload, payload])
    again = upsert_conversations(db, tenant_id="tenant_demo", payloads=[payload])

    assert again.created == 0
    assert again.updated == 1
    assert again.messages_created == 0
    assert again.messages_updated == 2
    assert db.scalar(select(Conversation).where(Conversation.tenant_id == "tenant_demo")) is not None
    assert len(list(db.scalars(select(Message)).all())) == 2


def test_tenant_isolation_same_conversation_id(db: Session) -> None:
    a = upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    b = upsert_conversation(db, tenant_id="tenant_b", payload=_payload())

    assert a.conversation.id != b.conversation.id
    assert a.messages[0].id != b.messages[0].id

    listed_a = list_conversations(db, "tenant_a")
    listed_b = list_conversations(db, "tenant_b")
    assert len(listed_a) == 1
    assert len(listed_b) == 1
    assert listed_a[0][0].tenant_id == "tenant_a"
    assert listed_b[0][0].tenant_id == "tenant_b"
    assert listed_a[0][0].conversation_id == listed_b[0][0].conversation_id == "conv_1"
    assert all(m.tenant_id == "tenant_a" for m in listed_a[0][1])
    assert all(m.tenant_id == "tenant_b" for m in listed_b[0][1])

    empty = list_conversations(db, "tenant_other")
    assert empty == []


def test_list_conversations_filters_by_conversation_ids(db: Session) -> None:
    upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(
            conversation_id="conv_keep",
            messages=[
                MessageUpsert(
                    message_id="msg_keep_0",
                    role="customer",
                    content="Need a callback",
                    timestamp=_ts(11),
                )
            ],
        ),
    )
    upsert_conversation(
        db,
        tenant_id="tenant_b",
        payload=_payload(conversation_id="conv_keep"),
    )

    listed = list_conversations(
        db, "tenant_a", conversation_ids=["conv_keep", "conv_missing"]
    )
    assert [row[0].conversation_id for row in listed] == ["conv_keep"]
    assert [m.content for m in listed[0][1]] == ["Need a callback"]

    assert list_conversations(db, "tenant_a", conversation_ids=[]) == []
    assert list_conversations(db, "tenant_a", conversation_ids=[""]) == []


def test_list_conversations_filters_updated_since(db: Session) -> None:
    older = upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(conversation_id="conv_old"),
    )
    newer = upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(conversation_id="conv_new"),
    )
    older.conversation.updated_at = datetime(2026, 9, 1, tzinfo=timezone.utc)
    newer.conversation.updated_at = datetime(2026, 9, 28, 7, 8, tzinfo=timezone.utc)
    db.flush()

    listed = list_conversations(
        db,
        "tenant_a",
        updated_since=datetime(2026, 9, 28, 7, 6, tzinfo=timezone.utc),
    )
    assert [row[0].conversation_id for row in listed] == ["conv_new"]


def test_list_conversations_does_not_leak_other_tenant_messages(db: Session) -> None:
    upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    upsert_conversation(
        db,
        tenant_id="tenant_b",
        payload=_payload(
            conversation_id="conv_other",
            messages=[
                MessageUpsert(
                    message_id="msg_other_0",
                    role="customer",
                    content="secret",
                    timestamp=_ts(12),
                )
            ],
        ),
    )

    listed = list_conversations(db, "tenant_a")
    assert len(listed) == 1
    assert listed[0][0].conversation_id == "conv_1"
    assert [m.content for m in listed[0][1]] == [
        "I want to close my account",
        "I can help with that",
    ]


def test_invalid_role_rejected(db: Session) -> None:
    payload = _payload(
        messages=[
            MessageUpsert.model_construct(
                message_id="msg_bad",
                role="bot",
                content="ok",
                timestamp=_ts(),
            )
        ]
    )
    with pytest.raises(InvalidMessageRoleError):
        upsert_conversation(db, tenant_id="tenant_a", payload=payload)


def test_delete_conversation_is_tenant_safe(db: Session) -> None:
    upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    upsert_conversation(db, tenant_id="tenant_b", payload=_payload())
    pred_a = record_prediction(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_1",
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
    record_prediction(
        db,
        tenant_id="tenant_b",
        conversation_id="conv_1",
        signal_type="retention",
        confidence=0.8,
        summary="Other tenant",
    )

    assert delete_conversation(db, tenant_id="tenant_a", conversation_id="conv_1") is True
    assert delete_conversation(db, tenant_id="tenant_a", conversation_id="conv_1") is False

    assert list_conversations(db, "tenant_a") == []
    listed_b = list_conversations(db, "tenant_b")
    assert len(listed_b) == 1
    assert listed_b[0][0].tenant_id == "tenant_b"
    assert len(listed_b[0][1]) == 2

    assert (
        db.scalar(
            select(SignalPrediction).where(SignalPrediction.tenant_id == "tenant_a")
        )
        is None
    )
    assert (
        db.scalar(
            select(SignalFeedback).where(SignalFeedback.tenant_id == "tenant_a")
        )
        is None
    )
    other_pred = db.scalar(
        select(SignalPrediction).where(SignalPrediction.tenant_id == "tenant_b")
    )
    assert other_pred is not None
    assert other_pred.conversation_id == "conv_1"


def test_prune_conversations_not_in_is_tenant_safe(db: Session) -> None:
    upsert_conversation(
        db, tenant_id="tenant_a", payload=_payload(conversation_id="conv_keep")
    )
    upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload(
            conversation_id="conv_drop",
            messages=[
                MessageUpsert(
                    message_id="msg_drop_0",
                    role="customer",
                    content="Showcase leftover",
                    timestamp=_ts(12),
                )
            ],
        ),
    )
    upsert_conversation(
        db,
        tenant_id="tenant_b",
        payload=_payload(
            conversation_id="conv_drop",
            messages=[
                MessageUpsert(
                    message_id="msg_b_0",
                    role="customer",
                    content="Other tenant drop id",
                    timestamp=_ts(12),
                )
            ],
        ),
    )
    record_prediction(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_drop",
        signal_type="lead",
        confidence=0.7,
        summary="Showcase lead",
    )
    record_prediction(
        db,
        tenant_id="tenant_b",
        conversation_id="conv_drop",
        signal_type="lead",
        confidence=0.7,
        summary="Other tenant lead",
    )

    deleted, kept = prune_conversations_not_in(
        db, tenant_id="tenant_a", keep_ids={"conv_keep"}
    )
    assert deleted == 1
    assert kept == 1

    listed_a = list_conversations(db, "tenant_a")
    assert [row[0].conversation_id for row in listed_a] == ["conv_keep"]
    assert (
        db.scalar(select(Message).where(Message.conversation_id == "conv_drop", Message.tenant_id == "tenant_a"))
        is None
    )
    assert (
        db.scalar(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == "tenant_a",
                SignalPrediction.conversation_id == "conv_drop",
            )
        )
        is None
    )

    listed_b = list_conversations(db, "tenant_b")
    assert len(listed_b) == 1
    assert listed_b[0][0].conversation_id == "conv_drop"
    assert listed_b[0][1][0].content == "Other tenant drop id"
    other_pred = db.scalar(
        select(SignalPrediction).where(SignalPrediction.tenant_id == "tenant_b")
    )
    assert other_pred is not None
    assert other_pred.conversation_id == "conv_drop"


def test_prune_empty_keep_set_deletes_all_tenant_rows(db: Session) -> None:
    upsert_conversation(
        db, tenant_id="tenant_a", payload=_payload(conversation_id="conv_a")
    )
    upsert_conversation(
        db, tenant_id="tenant_a", payload=_payload(conversation_id="conv_b")
    )
    upsert_conversation(
        db, tenant_id="tenant_b", payload=_payload(conversation_id="conv_a")
    )
    record_prediction(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_a",
        signal_type="lead",
        confidence=0.7,
        summary="Drop me",
    )

    deleted, kept = prune_conversations_not_in(
        db, tenant_id="tenant_a", keep_ids=set()
    )
    assert deleted == 2
    assert kept == 0
    assert list_conversations(db, "tenant_a") == []
    assert (
        db.scalar(
            select(SignalPrediction).where(SignalPrediction.tenant_id == "tenant_a")
        )
        is None
    )
    listed_b = list_conversations(db, "tenant_b")
    assert len(listed_b) == 1
    assert listed_b[0][0].conversation_id == "conv_a"


def test_prune_keep_set_noop_when_everything_is_kept(db: Session) -> None:
    upsert_conversation(
        db, tenant_id="tenant_a", payload=_payload(conversation_id="conv_keep")
    )
    deleted, kept = prune_conversations_not_in(
        db, tenant_id="tenant_a", keep_ids={"conv_keep", "conv_ghost"}
    )
    assert deleted == 0
    assert kept == 1
    assert [row[0].conversation_id for row in list_conversations(db, "tenant_a")] == [
        "conv_keep"
    ]


def test_upsert_and_list_round_trip_ground_truth(db: Session) -> None:
    labeled = _payload().model_copy(update={"ground_truth": "retention"})
    created = upsert_conversation(db, tenant_id="tenant_a", payload=labeled)

    assert created.created is True
    assert created.conversation.ground_truth == "retention"

    listed = list_conversations(db, "tenant_a")
    assert listed[0][0].ground_truth == "retention"


def test_upsert_omit_and_null_do_not_wipe_ground_truth(db: Session) -> None:
    labeled = _payload().model_copy(update={"ground_truth": "lead"})
    upsert_conversation(db, tenant_id="tenant_a", payload=labeled)

    omitted = upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    assert omitted.created is False
    assert omitted.conversation.ground_truth == "lead"

    explicit_null = _payload().model_copy(update={"ground_truth": None})
    assert "ground_truth" in explicit_null.model_fields_set
    kept = upsert_conversation(db, tenant_id="tenant_a", payload=explicit_null)
    assert kept.conversation.ground_truth == "lead"


def test_none_ground_truth_is_labeled_not_null(db: Session) -> None:
    payload = _payload().model_copy(update={"ground_truth": "none"})
    result = upsert_conversation(db, tenant_id="tenant_a", payload=payload)
    assert result.conversation.ground_truth == "none"
    listed = list_conversations(db, "tenant_a")
    assert listed[0][0].ground_truth == "none"


def test_clear_ground_truth_flag_and_patch_null(db: Session) -> None:
    labeled = _payload().model_copy(update={"ground_truth": "upsell"})
    upsert_conversation(db, tenant_id="tenant_a", payload=labeled)

    cleared = upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload().model_copy(update={"clear_ground_truth": True}),
    )
    assert cleared.conversation.ground_truth is None

    upsert_conversation(
        db,
        tenant_id="tenant_a",
        payload=_payload().model_copy(update={"ground_truth": "lead"}),
    )
    patched = patch_conversation_ground_truth(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_1",
        ground_truth=None,
    )
    assert patched is not None
    assert patched[0].ground_truth is None


def test_invalid_ground_truth_rejected(db: Session) -> None:
    payload = _payload().model_copy(update={"ground_truth": "churn"})
    with pytest.raises(InvalidGroundTruthError):
        upsert_conversation(db, tenant_id="tenant_a", payload=payload)

    upsert_conversation(db, tenant_id="tenant_a", payload=_payload())
    with pytest.raises(InvalidGroundTruthError):
        patch_conversation_ground_truth(
            db,
            tenant_id="tenant_a",
            conversation_id="conv_1",
            ground_truth="churn",
        )


def test_ground_truth_is_tenant_safe(db: Session) -> None:
    labeled = _payload().model_copy(update={"ground_truth": "retention"})
    upsert_conversation(db, tenant_id="tenant_a", payload=labeled)
    upsert_conversation(db, tenant_id="tenant_b", payload=_payload())

    listed_a = list_conversations(db, "tenant_a")
    listed_b = list_conversations(db, "tenant_b")
    assert listed_a[0][0].ground_truth == "retention"
    assert listed_b[0][0].ground_truth is None

    patched_b = patch_conversation_ground_truth(
        db,
        tenant_id="tenant_b",
        conversation_id="conv_1",
        ground_truth="lead",
    )
    assert patched_b is not None
    assert patched_b[0].ground_truth == "lead"
    assert patched_b[0].tenant_id == "tenant_b"

    missing = patch_conversation_ground_truth(
        db,
        tenant_id="tenant_a",
        conversation_id="conv_missing",
        ground_truth="lead",
    )
    assert missing is None

    listed_a_again = list_conversations(db, "tenant_a")
    assert listed_a_again[0][0].ground_truth == "retention"
