"""Upsert + tenant isolation for durable conversations/messages."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.conversation import ConversationUpsert, MessageUpsert
from app.services.conversations import (
    InvalidMessageRoleError,
    list_conversations,
    upsert_conversation,
    upsert_conversations,
)


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
