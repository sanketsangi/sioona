"""Upsert and list tenant-scoped conversations + messages."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.conversation import GROUND_TRUTH_VALUES, Conversation
from app.models.message import MESSAGE_ROLES, Message
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.schemas.conversation import ConversationUpsert, MessageUpsert


class InvalidMessageRoleError(ValueError):
    """Raised when a message role is not customer|agent|system."""


class InvalidGroundTruthError(ValueError):
    """Raised when ground_truth is not lead|retention|upsell|none|null."""


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


def _validate_ground_truth(value: str | None) -> str | None:
    if value is None:
        return None
    if value not in GROUND_TRUTH_VALUES:
        raise InvalidGroundTruthError(
            f"invalid ground_truth: {value!r}; "
            "expected lead|retention|upsell|none|null"
        )
    return value


def _apply_ground_truth(row: Conversation, payload: ConversationUpsert) -> None:
    """Set GT from a labeled value or clear flag; omit/null on upsert do not wipe."""
    if "ground_truth" in payload.model_fields_set and payload.ground_truth is not None:
        _validate_ground_truth(payload.ground_truth)
    if payload.clear_ground_truth:
        row.ground_truth = None
        return
    if "ground_truth" not in payload.model_fields_set:
        return
    if payload.ground_truth is None:
        return
    row.ground_truth = payload.ground_truth


def _apply_conversation_fields(
    row: Conversation,
    payload: ConversationUpsert,
) -> None:
    row.channel = payload.channel
    row.customer_name = payload.customer_name
    row.started_at = payload.started_at
    row.external_id = payload.external_id
    _apply_ground_truth(row, payload)
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
        _apply_ground_truth(conversation, payload)
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


def patch_conversation_ground_truth(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    ground_truth: str | None,
) -> tuple[Conversation, list[Message]] | None:
    """Set or clear ground_truth on one tenant conversation. None clears to NULL."""
    _validate_ground_truth(ground_truth)
    row = db.scalar(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.conversation_id == conversation_id,
        )
    )
    if row is None:
        return None
    row.ground_truth = ground_truth
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    messages = list(
        db.scalars(
            select(Message)
            .where(
                Message.tenant_id == tenant_id,
                Message.conversation_id == conversation_id,
            )
            .order_by(Message.timestamp.asc())
        ).all()
    )
    return row, messages


def list_conversations(
    db: Session,
    tenant_id: str,
    conversation_ids: list[str] | None = None,
) -> list[tuple[Conversation, list[Message]]]:
    """Return this tenant's conversations with messages, newest started_at first.

    ``conversation_ids`` scopes the list (Insights overlay). Omitted → all
    tenant rows (hydrate). Present but empty / blank ids → [].
    """
    stmt = (
        select(Conversation)
        .where(Conversation.tenant_id == tenant_id)
        .order_by(Conversation.started_at.desc())
    )
    if conversation_ids is not None:
        keep = [cid for cid in conversation_ids if cid]
        if not keep:
            return []
        stmt = stmt.where(Conversation.conversation_id.in_(keep))
    convos = list(db.scalars(stmt).all())
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


def delete_conversation(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    commit: bool = True,
) -> bool:
    """Delete one conversation and its messages/predictions/feedback.

    Tenant-scoped only. Returns False when this tenant has no such row.
    No FK cascade on chats — children are deleted explicitly.
    """
    row = db.scalar(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.conversation_id == conversation_id,
        )
    )
    if row is None:
        return False

    pred_ids = list(
        db.scalars(
            select(SignalPrediction.id).where(
                SignalPrediction.tenant_id == tenant_id,
                SignalPrediction.conversation_id == conversation_id,
            )
        ).all()
    )
    if pred_ids:
        db.execute(
            delete(SignalFeedback).where(
                SignalFeedback.tenant_id == tenant_id,
                SignalFeedback.signal_id.in_(pred_ids),
            )
        )
        db.execute(
            delete(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
                SignalPrediction.conversation_id == conversation_id,
            )
        )
    db.execute(
        delete(Message).where(
            Message.tenant_id == tenant_id,
            Message.conversation_id == conversation_id,
        )
    )
    db.delete(row)
    if commit:
        db.commit()
    return True


def prune_conversations_not_in(
    db: Session,
    *,
    tenant_id: str,
    keep_ids: set[str],
) -> tuple[int, int]:
    """Delete this tenant's conversations whose ids are not in ``keep_ids``.

    Returns (deleted, kept). Never touches other tenants.
    """
    existing = list(
        db.scalars(
            select(Conversation.conversation_id).where(
                Conversation.tenant_id == tenant_id
            )
        ).all()
    )
    deleted = 0
    kept = 0
    for cid in existing:
        if cid in keep_ids:
            kept += 1
            continue
        if delete_conversation(
            db, tenant_id=tenant_id, conversation_id=cid, commit=False
        ):
            deleted += 1
    db.commit()
    return deleted, kept
