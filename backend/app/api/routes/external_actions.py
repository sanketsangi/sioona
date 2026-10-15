"""Always verified admin actions. Draft review endpoints never call these."""
from datetime import datetime
from uuid import UUID
from fastapi import HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from app.api.actor import guarded_router
from app.api.routes.live_ingest import Admin, DB
from app.models.supervised_action import ActionProposal, ActionExecution, SupervisedActionDecision
from app.services import external_actions as service
from app.services.lifecycle import LifecycleError

router = guarded_router(tags=['external-actions'])
PREFIX = '/v1/tenants/{tenant_id}/external-actions'

class Proposal(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decision_id: UUID
    target: str = Field(pattern=r'^[0-9]{1,128}$')
    body: str = Field(min_length=1, max_length=10000)

class Approval(BaseModel):
    model_config = ConfigDict(extra='forbid')
    payload_sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    target: str = Field(pattern=r'^[0-9]{1,128}$')
    action_version: int = Field(ge=1)
    expires_at: datetime

class Reconciliation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    state: str = Field(pattern=r'^(succeeded|failed)$')
    provider_receipt: str = Field(pattern=r'^[A-Za-z0-9_-]{1,128}$')

def view(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}

def perform(db, fn):
    try: return view(fn())
    except (service.ActionError, LifecycleError) as error:
        db.rollback(); raise HTTPException(409, str(error)) from None
    except SQLAlchemyError:
        db.rollback(); raise HTTPException(503, 'external_actions_unavailable') from None

@router.post(PREFIX+'/proposals')
def propose(tenant_id: str, body: Proposal, db: DB, actor: Admin):
    return perform(db, lambda: service.propose(db, tenant_id, actor.user_id, body.decision_id, body.target, body.body))

@router.post(PREFIX+'/proposals/{proposal_id}/approve')
def approve(tenant_id: str, proposal_id: UUID, body: Approval, db: DB, actor: Admin):
    return perform(db, lambda: service.approve(db, tenant_id, actor.user_id, str(proposal_id), body.payload_sha256, body.target, body.action_version, body.expires_at))

@router.post(PREFIX+'/executions/{execution_id}/execute')
def execute(tenant_id: str, execution_id: UUID, db: DB, actor: Admin):
    return perform(db, lambda: service.execute(db, tenant_id, actor.user_id, str(execution_id)))

@router.post(PREFIX+'/executions/{execution_id}/reconcile')
def reconcile(tenant_id: str, execution_id: UUID, body: Reconciliation, db: DB, actor: Admin):
    return perform(db, lambda: service.reconcile(db, tenant_id, actor.user_id, str(execution_id), body.state, body.provider_receipt))

@router.get(PREFIX)
def listing(tenant_id: str, db: DB, actor: Admin, response: Response):
    response.headers["Cache-Control"] = "no-store"
    try: service.locked(db, tenant_id)
    except LifecycleError: raise HTTPException(409, "tenant_deleting") from None
    # Bounded operator view; no credentials or provider response bodies.
    result = {name: [view(row) for row in db.scalars(select(model).where(model.tenant_id == tenant_id).order_by(model.created_at.desc(), model.id).limit(50))]
            for name, model in [('proposals', ActionProposal), ('executions', ActionExecution)]}
    result['decisions'] = [{'id':str(row.id), 'conversation_id':row.conversation_id} for row in db.scalars(select(SupervisedActionDecision).where(SupervisedActionDecision.tenant_id == tenant_id).order_by(SupervisedActionDecision.decided_at.desc(), SupervisedActionDecision.id).limit(50))]
    return result
