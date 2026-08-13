"""Conversation and message upsert endpoints (durable chats slice 1)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.conversation import (
    ConversationBulkResponse,
    ConversationBulkUpsert,
    ConversationResponse,
    ConversationUpsert,
    MessageResponse,
)
from app.services.conversations import (
    ConversationUpsertResult,
    InvalidMessageRoleError,
    list_conversations,
    upsert_conversation,
    upsert_conversations,
)

router = APIRouter(tags=["conversations"])


def _to_response(
    conversation: Conversation,
    messages: list[Message],
) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        tenant_id=conversation.tenant_id,
        conversation_id=conversation.conversation_id,
        channel=conversation.channel,
        customer_name=conversation.customer_name,
        started_at=conversation.started_at,
        external_id=conversation.external_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[MessageResponse.model_validate(m) for m in messages],
    )


def _from_upsert(item: ConversationUpsertResult) -> ConversationResponse:
    return _to_response(item.conversation, item.messages)


@router.post(
    "/v1/conversations",
    response_model=ConversationResponse,
    status_code=201,
)
def create_or_update_conversation(
    body: ConversationUpsert,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationResponse:
    """Upsert one conversation + messages for the tenant in X-Tenant-Id."""
    try:
        item = upsert_conversation(db, tenant_id=tenant_id, payload=body)
        return _from_upsert(item)
    except InvalidMessageRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc


@router.post(
    "/v1/conversations/bulk",
    response_model=ConversationBulkResponse,
    status_code=201,
)
def create_or_update_conversations_bulk(
    body: ConversationBulkUpsert,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationBulkResponse:
    """Upsert many conversations + messages (Partner Demo / ingest)."""
    try:
        result = upsert_conversations(
            db, tenant_id=tenant_id, payloads=body.conversations
        )
        return ConversationBulkResponse(
            conversations=[_from_upsert(item) for item in result.items],
            created=result.created,
            updated=result.updated,
            messages_created=result.messages_created,
            messages_updated=result.messages_updated,
        )
    except InvalidMessageRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc


@router.get(
    "/v1/tenants/{tenant_id}/conversations",
    response_model=list[ConversationResponse],
)
def get_tenant_conversations(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ConversationResponse]:
    """List this tenant's conversations. Insights still reads JSON; this is API-only."""
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        rows = list_conversations(db, tenant_id)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [_to_response(conversation, messages) for conversation, messages in rows]
