"""CB-16 always-enforced installation admin and verified webhook principal API."""
from typing import Annotated
from fastapi import Depends, Header, HTTPException, Path, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, tuple_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.api.actor import Actor, _enforce, guarded_router
from app.db import get_db, bind_tenant
from app.models.live_ingest import LiveEvent, LiveInstallation
from app.schemas.live_ingest import LiveEventIn, InstallationIn
from app.schemas.ingestion import IngestionConversation
from app.services import live_ingest as live, lifecycle

router = guarded_router(tags=['live-ingest'])
DB = Annotated[Session, Depends(get_db)]
Identity = Annotated[str, Path(pattern=r'^[A-Za-z0-9_-]{1,128}$')]
Assertion = Annotated[str | None, Header(alias='X-Sioona-Actor')]

def admin(tenant_id: str, db: DB, assertion: Assertion = None):
    bind_tenant(db, tenant_id)
    return _enforce(tenant_id, assertion, db, 'admin', None)
Admin = Annotated[Actor, Depends(admin)]

def perform(db, action):
    try:
        result = action()
        db.commit()
        return result
    except (live.LiveError, lifecycle.LifecycleError) as error:
        db.rollback()
        raise HTTPException(409, str(error)) from None
    except (SQLAlchemyError, ValueError):
        db.rollback()
        raise HTTPException(503, 'live_ingest_unavailable') from None

@router.put('/v1/tenants/{tenant_id}/live/installations/{installation_id}')
def configure(tenant_id: str, installation_id: Identity, body: InstallationIn, db: DB, actor: Admin):
    if len(installation_id) > 64:
        raise HTTPException(422, 'invalid_installation_id')
    def action():
        row = live.configure_installation(db, tenant_id, installation_id, body, actor.user_id)
        return {'installation_id': row.id, 'active': row.active}
    return perform(db, action)

@router.post('/v1/tenants/{tenant_id}/live/installations/{installation_id}/revoke')
def revoke(tenant_id: str, installation_id: Identity, db: DB, actor: Admin):
    def action():
        live.revoke_installation(db, tenant_id, installation_id, actor.user_id)
        return {'revoked': True}
    return perform(db, action)

@router.post('/v1/tenants/{tenant_id}/live/events', status_code=202)
def accept(tenant_id: str, body: LiveEventIn, db: DB, assertion: Assertion = None):
    bind_tenant(db, tenant_id)
    actor = _enforce(tenant_id, assertion, db, 'review', 'live:accept')
    if actor.user_id != 'principal:live-ingest':
        raise HTTPException(403, 'live_principal_required')
    return perform(db, lambda: live.event_view(db, tenant_id, live.accept_event(db, tenant_id, body)))

@router.get('/v1/tenants/{tenant_id}/live/events')
def events(tenant_id: str, db: DB, actor: Admin, response: Response,
           after: str = Query(default='', max_length=193), limit: int = Query(default=50, ge=1, le=100)):
    response.headers['Cache-Control'] = 'no-store'
    cursor = after.split(':', 1) if after else ['', '']
    if len(cursor) != 2:
        raise HTTPException(400, 'invalid_cursor')
    rows = list(db.scalars(select(LiveEvent).where(LiveEvent.tenant_id == tenant_id,
        tuple_(LiveEvent.event_id, LiveEvent.installation_id) > tuple(cursor)).order_by(LiveEvent.event_id, LiveEvent.installation_id).limit(limit + 1)))
    # Event IDs are provider-unique; workspace installation remains part of authority.
    return {'events': [live.event_view(db, tenant_id, row) for row in rows[:limit]],
        'next_cursor': f'{rows[limit-1].event_id}:{rows[limit-1].installation_id}' if len(rows) > limit else None}

@router.post('/v1/tenants/{tenant_id}/live/installations/{installation_id}/events/{event_id}/requeue')
def requeue(tenant_id: str, installation_id: Identity, event_id: Identity, db: DB, actor: Admin):
    return perform(db, lambda: live.event_view(db, tenant_id,
        live.requeue(db, tenant_id, installation_id, event_id, actor.user_id)))

class Resolution(BaseModel):
    model_config = ConfigDict(extra='forbid')
    conversation: IngestionConversation

@router.put('/v1/tenants/{tenant_id}/live/installations/{installation_id}/events/{event_id}/resolution')
def resolve(tenant_id: str, installation_id: Identity, event_id: Identity, body: Resolution, db: DB, actor: Admin):
    return perform(db, lambda: live.event_view(db, tenant_id,
        live.resolve_event(db, tenant_id, installation_id, event_id, body.conversation, actor.user_id)))

class Checkpoint(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_cursor: str | None = Field(default=None, max_length=256)
    cursor: str = Field(pattern=r'^[A-Za-z0-9_:/.,=-]{1,256}$')

@router.put('/v1/tenants/{tenant_id}/live/installations/{installation_id}/checkpoint')
def checkpoint(tenant_id: str, installation_id: Identity, body: Checkpoint, db: DB, actor: Admin):
    def action():
        live.locked(db, tenant_id)
        row = live.installation(db, tenant_id, installation_id)
        if row.reconciliation_cursor != body.expected_cursor:
            raise live.LiveError('checkpoint_conflict')
        row.reconciliation_cursor = body.cursor
        live.audit(db, tenant_id, actor.user_id, 'integration_configured', installation_id)
        return {'cursor': row.reconciliation_cursor}
    return perform(db, action)
