"""Conversation and message upsert endpoints (durable chats slice 1)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.conversation import (
    ConversationBulkResponse,
    ConversationBulkUpsert,
    ConversationDeleteResponse,
    ConversationGroundTruthPatch,
    ConversationPruneRequest,
    ConversationPruneResponse,
    ConversationResponse,
    ConversationUpsert,
    MessageResponse,
)
from app.services.conversations import (
    ConversationUpsertResult,
    InvalidGroundTruthError,
    InvalidMessageRoleError,
    delete_conversation,
    list_conversations,
    patch_conversation_ground_truth,
    prune_conversations_not_in,
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
        ground_truth=conversation.ground_truth,
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
    except InvalidGroundTruthError as exc:
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
    except InvalidGroundTruthError as exc:
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
    conversation_id: Annotated[list[str] | None, Query()] = None,
) -> list[ConversationResponse]:
    """List this tenant's conversations. Insights still reads JSON; this is API-only.

    Repeat ``conversation_id`` to return only those rows (request-scoped
    overlay). Omitted → full tenant list (cold-start hydrate).
    """
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        rows = list_conversations(
            db, tenant_id, conversation_ids=conversation_id
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [_to_response(conversation, messages) for conversation, messages in rows]


@router.delete(
    "/v1/tenants/{tenant_id}/conversations/{conversation_id}",
    response_model=ConversationDeleteResponse,
)
def delete_tenant_conversation(
    tenant_id: str,
    conversation_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationDeleteResponse:
    """Delete one conversation (and messages/predictions) for this tenant."""
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        deleted = delete_conversation(
            db, tenant_id=tenant_id, conversation_id=conversation_id
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="conversation_not_found",
        )
    return ConversationDeleteResponse(deleted=True)


@router.post(
    "/v1/tenants/{tenant_id}/conversations/prune",
    response_model=ConversationPruneResponse,
)
def prune_tenant_conversations(
    tenant_id: str,
    body: ConversationPruneRequest,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationPruneResponse:
    """Delete this tenant's conversations whose ids are not in keep_conversation_ids."""
    assert_tenant_match(tenant_id, header_tenant_id)
    keep = {cid for cid in body.keep_conversation_ids if cid}
    try:
        deleted, kept = prune_conversations_not_in(
            db, tenant_id=tenant_id, keep_ids=keep
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return ConversationPruneResponse(deleted=deleted, kept=kept)


@router.patch(
    "/v1/tenants/{tenant_id}/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
def patch_tenant_conversation_ground_truth(
    tenant_id: str,
    conversation_id: str,
    body: ConversationGroundTruthPatch,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationResponse:
    """Set or clear ground_truth. ``null`` is the explicit Unset clear."""
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        patched = patch_conversation_ground_truth(
            db,
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            ground_truth=body.ground_truth,
        )
    except InvalidGroundTruthError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    if patched is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="conversation_not_found",
        )
    row, messages = patched
    return _to_response(row, messages)
