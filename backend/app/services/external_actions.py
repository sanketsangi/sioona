"""Explicit local/sandbox outbox. Never retries a submitted execution."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import re
import uuid
import httpx
from sqlalchemy import select, func
from app.models.supervised_action import ActionProposal, ActionExecution, SupervisedActionDecision
from app.models.membership import Membership
from app.services import lifecycle
from app.services.tenant_lock import lock_tenant_corpus

class ActionError(ValueError):
    pass

def enabled():
    return os.getenv('SIOONA_EXTERNAL_ACTIONS_ENABLED', '0') == '1' and os.getenv('SIOONA_EXTERNAL_ACTIONS_ENV') == 'sandbox'

def sandbox_config(tenant, target):
    # Operator-owned configuration, never a request credential or URL. Each
    # tenant has an explicit conversation allowlist and its own sandbox token.
    try:
        tenants = json.loads(os.getenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', '{}'))
    except (ValueError, TypeError):
        raise ActionError('sandbox_configuration_invalid') from None
    config = tenants.get(tenant, {}) if isinstance(tenants, dict) else {}
    if not isinstance(config, dict):
        raise ActionError('sandbox_configuration_invalid')
    targets = config.get('conversation_ids')
    if config.get('sandbox') is not True or not isinstance(targets, list) or target not in targets:
        raise ActionError('sandbox_target_required')
    token, admin = config.get('token'), config.get('admin_id')
    if not isinstance(token, str) or not token.strip() or not re.fullmatch(r'[0-9]+', str(admin)):
        raise ActionError('sandbox_credentials_required')
    return token, str(admin)

def digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def audit(db, tenant, actor, state, rid):
    from app.models.lifecycle import AuditEvent
    p = db.get(ActionProposal, (tenant, rid))
    e = db.get(ActionExecution, (tenant, rid)) if p is None else None
    result = 'failed' if e is not None and e.state == 'failed' else 'succeeded'
    if e is not None and e.state == 'unknown':
        result = 'blocked'
    db.add(AuditEvent(tenant_id=tenant, actor_id=str(uuid.UUID(actor)), resource_type='action',
        resource_id=rid, resource_version=str(p.action_version if p else e.action_version),
        operation='action_'+state, correlation_id=rid, reason_code='approved', result=result,
        # now() is transaction-start time, which can precede lock acquisition
        # and invert a concurrent unknown/result transition in the audit view.
        created_at=func.clock_timestamp() if db.get_bind().dialect.name == 'postgresql' else datetime.now(timezone.utc)))

def locked(db, tenant):
    lock_tenant_corpus(db, tenant)
    lifecycle.ensure_open(db, tenant)

def get(db, model, tenant, identity):
    row = db.get(model, (tenant, identity), populate_existing=True)
    if row is None:
        raise ActionError('action_not_found')
    return row

def invalidate(db, tenant, decision, actor):
    for p in db.scalars(select(ActionProposal).where(ActionProposal.tenant_id == tenant, ActionProposal.decision_id == decision, ActionProposal.state == 'proposed')):
        p.state = 'superseded'
        for e in db.scalars(select(ActionExecution).where(ActionExecution.tenant_id == tenant, ActionExecution.proposal_id == p.id, ActionExecution.state == 'approved')):
            e.state = 'failed'
            audit(db, tenant, actor, 'failed', e.id)
        audit(db, tenant, actor, 'invalidated', p.id)

def propose(db, tenant, actor, decision, target, body):
    locked(db, tenant)
    decision = uuid.UUID(str(decision))
    row = db.scalar(select(SupervisedActionDecision).where(SupervisedActionDecision.tenant_id == tenant, SupervisedActionDecision.id == decision))
    if row is None or not re.fullmatch(r'[0-9]{1,128}', target) or not body.strip() or len(body) > 10000:
        raise ActionError('invalid_proposal')
    unresolved = db.scalar(select(ActionExecution.id).join(ActionProposal, (ActionExecution.tenant_id == ActionProposal.tenant_id) & (ActionExecution.proposal_id == ActionProposal.id)).where(ActionExecution.tenant_id == tenant, ActionProposal.decision_id == decision, ActionExecution.state.in_(['attempted','unknown'])))
    if unresolved: raise ActionError('reconciliation_required')
    version = (db.scalar(select(func.max(ActionProposal.action_version)).where(ActionProposal.tenant_id == tenant, ActionProposal.decision_id == decision)) or 0)+1
    invalidate(db, tenant, decision, actor)
    _, admin = sandbox_config(tenant, target)
    payload = {'admin_id': admin, 'body': body.strip(), 'message_type': 'note', 'type': 'admin'}
    p = ActionProposal(tenant_id=tenant, decision_id=decision, action_version=version, target=target, payload_json=payload, payload_sha256=digest(payload), state='proposed')
    db.add(p); db.flush()
    audit(db, tenant, actor, 'proposed', p.id)
    db.commit()
    return p

def approve(db, tenant, actor, identity, sha, target, version, expires):
    locked(db, tenant)
    p = get(db, ActionProposal, tenant, identity)
    now = datetime.now(timezone.utc)
    if expires.tzinfo is None or not now < expires <= now+timedelta(minutes=15):
        raise ActionError('invalid_expiry')
    if p.state != 'proposed' or (sha, target, version) != (p.payload_sha256, p.target, p.action_version) or digest(p.payload_json) != sha:
        raise ActionError('approval_mismatch')
    if db.scalar(select(ActionExecution).where(ActionExecution.tenant_id == tenant, ActionExecution.proposal_id == identity)):
        raise ActionError('already_approved')
    e = ActionExecution(tenant_id=tenant, proposal_id=p.id, payload_sha256=sha, target=target, actor_id=actor, action_version=version, expires_at=expires)
    db.add(e); db.flush(); audit(db, tenant, actor, 'approved', e.id); db.commit()
    return e

def submit_note(token, admin, target, payload, execution_id):
    # Fixed endpoint; no redirects, transport retries, comments or attachments.
    with httpx.Client(timeout=10, follow_redirects=False) as client:
        response = client.post('https://api.intercom.io/conversations/'+target+'/reply',
            headers={'Authorization': 'Bearer '+token, 'Intercom-Version': '2.14', 'Idempotency-Key': execution_id},
            json={'body': payload['body'], 'message_type': 'note', 'type': 'admin', 'admin_id': admin})
    if response.status_code >= 500 or response.status_code in (408, 429):
        return 'unknown', None
    if not 200 <= response.status_code < 300:
        return 'failed', None
    # Keep only a bounded provider identity, never provider text.
    receipt = str(response.json().get('id', ''))
    return ('succeeded', receipt) if re.fullmatch(r'[A-Za-z0-9_-]{1,128}', receipt) else ('unknown', None)

def execute(db, tenant, actor, identity):
    locked(db, tenant)
    e = get(db, ActionExecution, tenant, identity)
    if e.state != 'approved':
        # A crash after the committed attempt is ambiguous and never resubmitted.
        if e.state == 'attempted':
            e.state = 'unknown'; audit(db, tenant, actor, 'unknown', e.id); db.commit()
        return e
    p = get(db, ActionProposal, tenant, e.proposal_id)
    if not enabled(): raise ActionError('external_actions_disabled')
    member = db.get(Membership, (tenant, uuid.UUID(actor)), populate_existing=True)
    if member is None or member.role != 'admin' or member.revoked_at is not None:
        raise ActionError('current_admin_required')
    if e.actor_id != actor or lifecycle.aware(e.expires_at) <= datetime.now(timezone.utc) or p.state != 'proposed' or (e.payload_sha256, e.target, e.action_version) != (digest(p.payload_json), p.target, p.action_version):
        raise ActionError('approval_invalid')
    token, admin = sandbox_config(tenant, e.target)
    if p.payload_json.get('admin_id') != admin: raise ActionError('approval_invalid')
    e.state = 'attempted'; audit(db, tenant, actor, 'attempted', e.id)
    # Durable before network: a process crash cannot lead to blind resubmission.
    db.commit()
    try:
        state, receipt = submit_note(token, admin, e.target, p.payload_json, e.id)
    except Exception:
        state, receipt = 'unknown', None
    locked(db, tenant)
    e = get(db, ActionExecution, tenant, identity)
    if e.state in ('attempted', 'unknown'):
        e.state, e.provider_receipt = state, receipt
        audit(db, tenant, actor, state, e.id); db.commit()
    return e

def reconcile(db, tenant, actor, identity, state, receipt):
    locked(db, tenant)
    e = get(db, ActionExecution, tenant, identity)
    if e.state not in ('unknown','attempted') or state not in ('succeeded','failed') or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', receipt):
        raise ActionError('invalid_reconciliation')
    e.state, e.provider_receipt = state, receipt
    audit(db, tenant, actor, 'reconciled', e.id); db.commit()
    return e
