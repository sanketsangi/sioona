"""Supervised draft decision endpoints. Nothing is sent."""

from typing import Annotated

from fastapi import Depends, HTTPException, Query, status, Header
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.supervised_action import (
    SupervisedActionDecisionResponse,
    SupervisedActionDecisionUpsert,
)
from app.services.supervised_actions import (
    InvalidSupervisedActionError,
    list_supervised_action_decisions,
    upsert_supervised_action_decision,
)

router = guarded_router(tags=["supervised-actions"])


@router.post(
    "/v1/supervised-actions",
    response_model=SupervisedActionDecisionResponse,
)
def submit_supervised_action_decision(
    body: SupervisedActionDecisionUpsert,
    tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    assertion: Annotated[str | None, Header(alias="X-Sioona-Actor")] = None,
) -> SupervisedActionDecisionResponse:
    """Upsert Approve / Edit / Dismiss for one conversation + draft kind."""
    from app.api.actor import _enforce
    actor_id = _enforce(tenant_id, assertion, db, 'review', None).user_id if assertion else None
    try:
        row = upsert_supervised_action_decision(
            db,
            tenant_id=tenant_id,
            conversation_id=body.conversation_id,
            action_type=body.action_type,
            status=body.status,
            subject=body.subject,
            body=body.body,
            evidence_quote=body.evidence_quote,
            decided_at=body.decided_at,
            actor_id=actor_id,
        )
    except InvalidSupervisedActionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return SupervisedActionDecisionResponse.model_validate(row)


@router.post(
    "/v1/tenants/{tenant_id}/supervised-actions",
    response_model=SupervisedActionDecisionResponse,
)
def submit_supervised_action_decision_for_tenant(
    tenant_id: str,
    body: SupervisedActionDecisionUpsert,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    assertion: Annotated[str | None, Header(alias="X-Sioona-Actor")] = None,
) -> SupervisedActionDecisionResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    return submit_supervised_action_decision(body, tenant_id, db, assertion)


@router.get(
    "/v1/tenants/{tenant_id}/supervised-actions",
    response_model=list[SupervisedActionDecisionResponse],
)
def get_supervised_action_decisions(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    conversation_id: Annotated[list[str] | None, Query()] = None,
) -> list[SupervisedActionDecisionResponse]:
    """List decisions for the active keep-set.

    Repeat ``conversation_id`` so other packs stay out. Omitted → full tenant.
    """
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        rows = list_supervised_action_decisions(
            db, tenant_id, conversation_ids=conversation_id
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [SupervisedActionDecisionResponse.model_validate(row) for row in rows]
