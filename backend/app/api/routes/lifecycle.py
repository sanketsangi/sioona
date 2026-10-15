"""Verified current admins only, independently of actor-auth rollout mode."""
from typing import Annotated, Literal
from fastapi import Depends, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.api.actor import Actor, _enforce, guarded_router
from app.db import bind_tenant, get_db
from app.models.lifecycle import AuditEvent, LegalHold, TenantDeletion
from app.services import lifecycle

router = guarded_router(tags=['lifecycle'])
DB = Annotated[Session, Depends(get_db)]


def admin(tenant_id: str, db: DB, assertion: Annotated[str | None, Header(alias='X-Sioona-Actor')] = None):
    bind_tenant(db, tenant_id)
    return _enforce(tenant_id, assertion, db, 'admin', None)


Admin = Annotated[Actor, Depends(admin)]


def receipt_actor(tenant_id: str, db: DB, assertion: Annotated[str | None, Header(alias='X-Sioona-Actor')] = None):
    bind_tenant(db, tenant_id)
    return _enforce(tenant_id, assertion, db, 'receipt', None)


ReceiptActor = Annotated[Actor, Depends(receipt_actor)]


class HoldInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    reason_code: Literal['litigation','regulatory','investigation']
    resource_type: Literal['tenant','conversation','upload'] = 'tenant'
    resource_id: str | None = Field(default=None, min_length=1, max_length=256)


class ConfirmInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    confirmation: str = Field(max_length=300)


def perform(db, action):
    try:
        return action()
    except lifecycle.LifecycleError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, 'lifecycle_unavailable') from None


@router.get('/v1/tenants/{tenant_id}/lifecycle')
def status(tenant_id: str, db: DB, actor: ReceiptActor, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    row = db.get(TenantDeletion, tenant_id)
    if actor.role == 'receipt':
        return {'policy_version': lifecycle.POLICY_VERSION, 'scheduler_enabled': False,
                'holds': [], 'audit': [], 'deletion': lifecycle.receipt(row)}
    holds = db.scalars(select(LegalHold).where(LegalHold.tenant_id == tenant_id, LegalHold.active.is_(True)).order_by(LegalHold.created_at).limit(100)).all()
    events = db.scalars(select(AuditEvent).where(AuditEvent.tenant_id == tenant_id).order_by(AuditEvent.created_at.desc()).limit(100)).all()
    return {'policy_version': lifecycle.POLICY_VERSION, 'scheduler_enabled': False,
        'holds': [{'id': h.id, 'resource_type': h.resource_type, 'resource_id': h.resource_id, 'reason_code': h.reason_code} for h in holds],
        'deletion': lifecycle.receipt(row) if row else None,
        'audit': [{'id': e.id, 'operation': e.operation, 'result': e.result, 'reason_code': e.reason_code, 'created_at': e.created_at} for e in events]}


@router.post('/v1/tenants/{tenant_id}/lifecycle/holds', status_code=201)
def hold(tenant_id: str, body: HoldInput, db: DB, actor: Admin):
    if (body.resource_type == 'tenant') != (body.resource_id is None):
        raise HTTPException(422, 'invalid_hold_scope')
    row = perform(db, lambda: lifecycle.place_hold(db, tenant_id, actor.user_id, body.reason_code, body.resource_type, body.resource_id))
    return {'id': row.id}


@router.post('/v1/tenants/{tenant_id}/lifecycle/holds/{hold_id}/release')
def release(tenant_id: str, hold_id: str, db: DB, actor: Admin):
    perform(db, lambda: lifecycle.release_hold(db, tenant_id, actor.user_id, hold_id))
    return {'released': True}


@router.post('/v1/tenants/{tenant_id}/lifecycle/exports', status_code=201)
def export(tenant_id: str, db: DB, actor: Admin):
    row = perform(db, lambda: lifecycle.create_export(db, tenant_id, actor.user_id))
    return {'id': row.id, 'expires_at': row.expires_at}


@router.get('/v1/tenants/{tenant_id}/lifecycle/exports/{export_id}')
def download(tenant_id: str, export_id: str, db: DB, actor: Admin):
    bundle = perform(db, lambda: lifecycle.download_export(db, tenant_id, export_id, actor.user_id))
    return Response(lifecycle.encoded(bundle), media_type='application/json', headers={
        'Cache-Control':'no-store', 'Content-Disposition':'attachment; filename="sioona-export.json"', 'X-Content-Type-Options':'nosniff'})


@router.post('/v1/tenants/{tenant_id}/lifecycle/deletions', status_code=201)
def request_deletion(tenant_id: str, db: DB, actor: Admin):
    return lifecycle.receipt(perform(db, lambda: lifecycle.request_deletion(db, tenant_id, actor.user_id)))


@router.post('/v1/tenants/{tenant_id}/lifecycle/deletions/{request_id}/confirm')
def confirm(tenant_id: str, request_id: str, body: ConfirmInput, db: DB, actor: Admin):
    return lifecycle.receipt(perform(db, lambda: lifecycle.confirm_deletion(db, tenant_id, request_id, actor.user_id, body.confirmation)))


@router.post('/v1/tenants/{tenant_id}/lifecycle/deletions/{request_id}/advance')
def advance(tenant_id: str, request_id: str, db: DB, actor: ReceiptActor):
    return lifecycle.receipt(perform(db, lambda: lifecycle.advance_deletion(db, tenant_id, request_id, actor.user_id)))


@router.post('/v1/tenants/{tenant_id}/lifecycle/retention/sweep')
def sweep(tenant_id: str, db: DB, actor: Admin):
    from app.services.tenant_data import wipe_tenant_data
    return {'counts': perform(db, lambda: wipe_tenant_data(db, tenant_id=tenant_id, retention_actor_id=actor.user_id))}
