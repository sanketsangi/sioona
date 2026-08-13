"""Upsert and list tenant-scoped conversations + messages."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import MESSAGE_ROLES, Message
from app.schemas.conversation import ConversationUpsert, MessageUpsert


class InvalidMessageRoleError(ValueError):
    """Raised when a message role is not customer|agent|system."""


@dataclass
class ConversationUpsertResult:
    """One conversation after upsert, with nested messages and create/update flags."""

    conversation: Conversation
    messages: list[Message]
    created: bool
    messages_created: int
    messages_updated: int


@dataclass
class ConversationBulkResult:
    """Bulk upsert counts plus per-conversation rows."""

    items: list[ConversationUpsertResult]
    created: int
    updated: int
    messages_created: int
    messages_updated: int


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _validate_role(role: str) -> str:
    if role not in MESSAGE_ROLES:
        raise InvalidMessageRoleError(
            f"invalid message role: {role!r}; expected customer|agent|system"
        )
    return role


def _apply_conversation_fields(
    row: Conversation,
    payload: ConversationUpsert,
) -> None:
    row.channel = payload.channel
    row.customer_name = payload.customer_name
    row.started_at = payload.started_at
    row.external_id = payload.external_id
    row.updated_at = _now()


def _apply_message_fields(
    row: Message,
    *,
    conversation_id: str,
    payload: MessageUpsert,
) -> None:
    row.conversation_id = conversation_id
    row.role = _validate_role(payload.role)
    row.content = payload.content
    row.timestamp = payload.timestamp


def _upsert_one_message(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    payload: MessageUpsert,
) -> tuple[Message, bool]:
    """Insert or update one message. Returns (row, created)."""
    _validate_role(payload.role)
    existing = db.scalar(
        select(Message).where(
            Message.tenant_id == tenant_id,
            Message.message_id == payload.message_id,
        )
    )
    if existing is not None:
        _apply_message_fields(
            existing, conversation_id=conversation_id, payload=payload
        )
        return existing, False

    row = Message(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        message_id=payload.message_id,
        role=payload.role,
        content=payload.content,
        timestamp=payload.timestamp,
    )
    db.add(row)
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:
        raced = db.scalar(
            select(Message).where(
                Message.tenant_id == tenant_id,
                Message.message_id == payload.message_id,
            )
        )
        if raced is None:
            raise
        _apply_message_fields(
            raced, conversation_id=conversation_id, payload=payload
        )
        return raced, False
    return row, True


def upsert_conversation(
    db: Session,
    *,
    tenant_id: str,
    payload: ConversationUpsert,
    commit: bool = True,
) -> ConversationUpsertResult:
    """Insert or update the conversation for tenant + conversation_id.

    Nested messages upsert on (tenant_id, message_id). Re-detect / Partner Demo
    reuse the same Neon rows.
    """
    existing = db.scalar(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.conversation_id == payload.conversation_id,
        )
    )
    created = False
    if existing is not None:
        _apply_conversation_fields(existing, payload)
        conversation = existing
    else:
        conversation = Conversation(
            tenant_id=tenant_id,
            conversation_id=payload.conversation_id,
            channel=payload.channel,
            customer_name=payload.customer_name,
            started_at=payload.started_at,
            external_id=payload.external_id,
            updated_at=_now(),
        )
        db.add(conversation)
        try:
            with db.begin_nested():
                db.flush()
            created = True
        except IntegrityError:
            raced = db.scalar(
                select(Conversation).where(
                    Conversation.tenant_id == tenant_id,
                    Conversation.conversation_id == payload.conversation_id,
                )
            )
            if raced is None:
                raise
            _apply_conversation_fields(raced, payload)
            conversation = raced
            created = False

    messages: list[Message] = []
    messages_created = 0
    messages_updated = 0
    for msg in payload.messages:
        row, msg_created = _upsert_one_message(
            db,
            tenant_id=tenant_id,
            conversation_id=payload.conversation_id,
            payload=msg,
        )
        messages.append(row)
        if msg_created:
            messages_created += 1
        else:
            messages_updated += 1

    if commit:
        db.commit()
        db.refresh(conversation)
        for row in messages:
            db.refresh(row)

    return ConversationUpsertResult(
        conversation=conversation,
        messages=messages,
        created=created,
        messages_created=messages_created,
        messages_updated=messages_updated,
    )


def upsert_conversations(
    db: Session,
    *,
    tenant_id: str,
    payloads: list[ConversationUpsert],
) -> ConversationBulkResult:
    """Bulk upsert in one transaction (Partner Demo / ingest)."""
    items: list[ConversationUpsertResult] = []
    created = 0
    updated = 0
    messages_created = 0
    messages_updated = 0

    for payload in payloads:
        item = upsert_conversation(
            db, tenant_id=tenant_id, payload=payload, commit=False
        )
        items.append(item)
        if item.created:
            created += 1
        else:
            updated += 1
        messages_created += item.messages_created
        messages_updated += item.messages_updated

    db.commit()
    for item in items:
        db.refresh(item.conversation)
        for row in item.messages:
            db.refresh(row)

    return ConversationBulkResult(
        items=items,
        created=created,
        updated=updated,
        messages_created=messages_created,
        messages_updated=messages_updated,
    )


def list_conversations(
    db: Session,
    tenant_id: str,
) -> list[tuple[Conversation, list[Message]]]:
    """Return this tenant's conversations with messages, newest started_at first."""
    convos = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.tenant_id == tenant_id)
            .order_by(Conversation.started_at.desc())
        ).all()
    )
    if not convos:
        return []

    conv_ids = [c.conversation_id for c in convos]
    messages = list(
        db.scalars(
            select(Message)
            .where(
                Message.tenant_id == tenant_id,
                Message.conversation_id.in_(conv_ids),
            )
            .order_by(Message.timestamp.asc())
        ).all()
    )
    by_conv: dict[str, list[Message]] = {c.conversation_id: [] for c in convos}
    for msg in messages:
        by_conv.setdefault(msg.conversation_id, []).append(msg)
    return [(c, by_conv.get(c.conversation_id, [])) for c in convos]
