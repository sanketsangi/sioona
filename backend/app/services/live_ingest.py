"""CB-16: caller owns the transaction; no provider I/O or model calls here.

The web verifier resolves the installation from signed app_id using operator
configuration. The backend independently matches persisted installation authority.
All transitions serialize on the same corpus lock as jobs and revocation.
"""
import uuid
from sqlalchemy import delete, select, update
from app.db import bind_tenant
from app.models.live_ingest import LiveInstallation, LiveEvent, LiveSource
from app.models.job import Job
from app.models.message import Message
from app.models.upload import Upload
from app.models.signal_evidence import SignalEvidence
from app.models.signal_prediction import SignalPrediction
from app.schemas.live_ingest import LiveEventIn
from app.schemas.job import JobUpload
from app.services import jobs
from app.services.tenant_lock import lock_tenant_corpus
from app.services import lifecycle

ACTIVE = ('queued', 'leased', 'failed')

class LiveError(ValueError):
    pass

def locked(db, tenant):
    bind_tenant(db, tenant)
    lock_tenant_corpus(db, tenant)
    lifecycle.ensure_open(db, tenant)

def installation(db, tenant, iid):
    row = db.get(LiveInstallation, (tenant, iid))
    if row is None:
        raise LiveError('integration_not_found')
    if not row.active:
        raise LiveError('integration_revoked')
    return row

def audit(db, tenant, actor, operation, iid, eid=''):
    rid = str(uuid.uuid5(uuid.NAMESPACE_URL, f'{tenant}:{iid}:{eid}'))
    lifecycle.audit(db, tenant, actor, operation, 'live_event' if eid else 'integration', rid)

def configure_installation(db, tenant, iid, body, actor):
    locked(db, tenant)
    if tenant == 'tenant_demo':
        raise LiveError('demo_integration_forbidden')
    prior = db.get(LiveInstallation, (tenant, iid))
    if prior:
        # Revocation is permanent. Reinstallation requires a new installation ID.
        if not prior.active:
            raise LiveError('integration_revoked')
        if prior.workspace_id != body.workspace_id:
            raise LiveError('installation_identity_conflict')
        prior.consent_reference, prior.monitoring_reference = body.consent_reference, body.monitoring_reference
    else:
        prior = LiveInstallation(tenant_id=tenant, id=iid, **body.model_dump())
        db.add(prior)
    audit(db, tenant, actor, 'integration_configured', iid)
    db.flush()
    return prior

def revoke_installation(db, tenant, iid, actor):
    locked(db, tenant)
    row = installation(db, tenant, iid)
    row.active = False
    for event in db.scalars(select(LiveEvent).where(LiveEvent.tenant_id == tenant, LiveEvent.installation_id == iid)):
        if event.job_id:
            job = db.get(Job, (tenant, event.job_id))
            if job and job.status in ACTIVE:
                cancel_job(job, db)
        if event.state in ('pending', 'dispatched'):
            event.state, event.reason = 'cancelled', 'integration_revoked'
    audit(db, tenant, actor, 'integration_revoked', iid)
    db.flush()

def cancel_job(job, db):
    job.status, job.lease_token = 'cancelled', job.lease_token + 1
    jobs.clear_lease(job, jobs.now(db))

def accept_event(db, tenant, body: LiveEventIn):
    locked(db, tenant)
    inst = installation(db, tenant, body.installation_id)
    if inst.workspace_id != body.workspace_id:
        raise LiveError('installation_identity_conflict')
    prior = db.get(LiveEvent, (tenant, inst.id, body.event_id))
    if prior:
        if prior.payload_sha256 != body.payload_sha256:
            raise LiveError('event_identity_conflict')
        return prior
    payload = body.conversation.model_dump(mode='json') if body.conversation else None
    row = LiveEvent(tenant_id=tenant, installation_id=inst.id, event_id=body.event_id,
        source_id=body.source_id, provider_object_id=body.provider_object_id,
        source_version=body.source_version, occurred_at=body.occurred_at,
        payload_sha256=body.payload_sha256, content_sha256=jobs.digest(payload),
        kind=body.kind, state='pending', payload=payload)
    db.add(row)
    db.flush()
    dispatch(db, tenant, row)
    return row

def source(db, tenant, event):
    return db.get(LiveSource, (tenant, event.installation_id, event.source_id))

def dispatch(db, tenant, event):
    inst = installation(db, tenant, event.installation_id)
    current = source(db, tenant, event)
    if current and current.deleted:
        event.state, event.reason, event.payload = 'ignored', 'source_deleted', None
        return
    if current and event.source_version < current.source_version:
        event.state, event.reason = 'ignored', 'older_version'
        return
    if current and event.source_version == current.source_version:
        event.state = 'ignored' if event.content_sha256 == current.content_sha256 else 'dead_lettered'
        event.reason = 'duplicate_version' if event.state == 'ignored' else 'version_conflict'
        return
    if event.kind == 'unresolved':
        event.state, event.reason = 'dead_lettered', 'source_fetch_required'
        return
    if event.kind == 'delete':
        try:
            lifecycle.check_hold(db, tenant)
        except lifecycle.LifecycleError:
            event.state, event.reason = 'dead_lettered', 'legal_hold'
            return
        if current and current.conversation_id:
            scrub_source(db, tenant, current.conversation_id)
        for prior in db.scalars(select(LiveEvent).where(LiveEvent.tenant_id == tenant,
                LiveEvent.installation_id == inst.id, LiveEvent.source_id == event.source_id)):
            if prior.job_id:
                job = db.get(Job, (tenant, prior.job_id))
                if job and job.status in ACTIVE:
                    cancel_job(job, db)
            prior.payload = None
            if prior.state in ('pending', 'dispatched'):
                prior.state, prior.reason = 'cancelled', 'source_deleted'
        if not current:
            current = LiveSource(tenant_id=tenant, installation_id=inst.id, source_id=event.source_id,
                source_version=event.source_version, content_sha256=event.content_sha256, deleted=True)
            db.add(current)
        current.deleted, current.source_version = True, event.source_version
        event.state, event.reason = 'succeeded', 'source_deleted'
        db.flush()
        return
    body = JobUpload(source='intercom-live', replace=False, conversations=[event.payload])
    cid = body.conversations[0].conversation_id
    # Only one event updates a conversation until the prior worker terminates.
    for job in db.scalars(select(Job).where(Job.tenant_id == tenant, Job.status.in_(ACTIVE))):
        if cid in jobs.job_ids(db, job):
            return
    # A complete provider snapshot replaces removed messages as well as upserts.
    present = {m.message_id for m in body.conversations[0].messages}
    removed = list(db.scalars(select(Message.message_id).where(Message.tenant_id == tenant,
        Message.conversation_id == cid, Message.message_id.not_in(present))))
    if removed:
        from app.services.evidence_anchors import mark_anchored_predictions_stale
        mark_anchored_predictions_stale(db, tenant_id=tenant, message_ids=removed)
        db.execute(delete(Message).where(Message.tenant_id == tenant, Message.message_id.in_(removed)))
    upload_id = jobs.digest(['intercom', inst.id, event.event_id])
    job = jobs.enqueue_upload(db, tenant, upload_id, body)
    event.job_id, event.state, event.reason = job.id, 'dispatched', None
    if not current:
        current = LiveSource(tenant_id=tenant, installation_id=inst.id, source_id=event.source_id,
            source_version=event.source_version, content_sha256=event.content_sha256, conversation_id=cid, deleted=False)
        db.add(current)
    else:
        current.source_version, current.content_sha256, current.conversation_id = event.source_version, event.content_sha256, cid
    db.flush()

def dispatch_pending(db, tenant):
    locked(db, tenant)
    # Bounded pages; successful/terminal receipts stay durable for replay defense.
    for row in db.scalars(select(LiveEvent).where(LiveEvent.tenant_id == tenant,
            LiveEvent.state == 'dispatched', LiveEvent.job_id.in_(select(Job.id).where(Job.tenant_id == tenant, Job.status.in_(['succeeded','dead_lettered','cancelled'])))).order_by(LiveEvent.received_at).limit(100)):
        job = db.get(Job, (tenant, row.job_id))
        if job and job.status in ('succeeded', 'dead_lettered', 'cancelled'):
            row.state, row.reason = job.status, job.last_error_category
    db.flush()
    for row in db.scalars(select(LiveEvent).where(LiveEvent.tenant_id == tenant,
            LiveEvent.state == 'pending').order_by(LiveEvent.source_version, LiveEvent.received_at, LiveEvent.event_id).limit(100)):
        try:
            dispatch(db, tenant, row)
        except LiveError as error:
            row.state, row.reason = 'cancelled', str(error)
    db.flush()

def requeue(db, tenant, iid, eid, actor):
    locked(db, tenant)
    installation(db, tenant, iid)
    row = db.get(LiveEvent, (tenant, iid, eid))
    if row is None:
        raise LiveError('event_not_found')
    if row.job_id:
        job = db.get(Job, (tenant, row.job_id))
        current = source(db, tenant, row)
        if not current or current.deleted or current.source_version != row.source_version:
            raise LiveError('source_superseded')
        if not job or job.status not in ('dead_lettered', 'cancelled'):
            raise LiveError('event_not_terminal')
        if not row.payload:
            raise LiveError('source_fetch_required')
        if jobs.config_hash(db, tenant) != job.config_sha256:
            raise LiveError('config_changed')
        job.status, job.attempt_count, job.lease_token = 'queued', 0, job.lease_token + 1
        jobs.clear_lease(job, jobs.now(db))
        job.run_after = jobs.now(db)
        row.state, row.reason = 'dispatched', None
    else:
        if row.state != 'dead_lettered':
            raise LiveError('event_not_terminal')
        if row.kind == 'unresolved':
            raise LiveError('source_fetch_required')
        if row.reason == 'version_conflict':
            raise LiveError('source_version_conflict')
        row.state, row.reason = 'pending', None
        dispatch(db, tenant, row)
    audit(db, tenant, actor, 'live_requeued', iid, eid)
    db.flush()
    return row

def scrub_source(db, tenant, cid):
    """Source deletion: preserve decisions/ledger, remove displayable source copies."""
    from app.models.conversation import Conversation
    from app.models.detection_run import DetectionRun
    from app.models.classification_cache import ClassificationCache
    from app.models.supervised_action import SupervisedActionDecision
    pids = select(SignalPrediction.id).where(SignalPrediction.tenant_id == tenant, SignalPrediction.conversation_id == cid)
    db.execute(delete(SignalEvidence).where(SignalEvidence.tenant_id == tenant, SignalEvidence.prediction_id.in_(pids)))
    db.execute(update(SignalPrediction).where(SignalPrediction.tenant_id == tenant, SignalPrediction.conversation_id == cid).values(
        active=False, summary='', commercial_value_evidence=None, evidence_status='stale'))
    db.execute(delete(Message).where(Message.tenant_id == tenant, Message.conversation_id == cid))
    db.execute(update(Conversation).where(Conversation.tenant_id == tenant, Conversation.conversation_id == cid).values(customer_name=None, external_id=None))
    db.execute(update(SupervisedActionDecision).where(SupervisedActionDecision.tenant_id == tenant,
        SupervisedActionDecision.conversation_id == cid).values(subject='', body='', evidence_quote=''))
    db.execute(delete(DetectionRun).where(DetectionRun.tenant_id == tenant, DetectionRun.conversation_id == cid))
    # Derived cache keys do not retain conversation IDs. Conservatively invalidate tenant cache.
    db.execute(delete(ClassificationCache).where(ClassificationCache.tenant_id == tenant))
    for upload in db.scalars(select(Upload).where(Upload.tenant_id == tenant)):
        payload = upload.payload or {}
        if any(c.get('conversation_id') == cid for c in payload.get('conversations', [])) or any(
                c.get('conversation_id') == cid for c in payload.get('snapshot', {}).get('conversations', [])):
            upload.payload, upload.active = None, False
    db.flush()

def event_view(db, tenant, row):
    job = db.get(Job, (tenant, row.job_id)) if row.job_id else None
    return dict(event_id=row.event_id, installation_id=row.installation_id, source_id=row.source_id,
        source_version=row.source_version, state=job.status if job else row.state,
        reason=job.last_error_category if job else row.reason, job_id=row.job_id,
        received_at=row.received_at, provider_object_id=row.provider_object_id)


def resolve_event(db, tenant, iid, eid, conversation, actor):
    """Explicit admin recovery with a redacted, provider-refetched full snapshot.

    Original event digest/timestamp remain immutable. Resolution is audited and
    cannot overwrite a dispatched receipt or evade source ordering/tombstones.
    """
    locked(db, tenant)
    installation(db, tenant, iid)
    row = db.get(LiveEvent, (tenant, iid, eid))
    if not row or row.state != 'dead_lettered' or row.kind != 'unresolved' or row.job_id:
        raise LiveError('event_not_resolvable')
    if conversation.channel != 'intercom' or not conversation.messages:
        raise LiveError('invalid_live_snapshot')
    current = source(db, tenant, row)
    if current and current.conversation_id and current.conversation_id != conversation.conversation_id:
        raise LiveError('source_identity_conflict')
    from app.ai.gateway import redact
    conversation = conversation.model_copy(deep=True)
    conversation.customer_name = None
    for message in conversation.messages:
        message.content = redact(message.content)
    row.payload = conversation.model_dump(mode='json')
    row.content_sha256 = jobs.digest(row.payload)
    row.kind, row.state, row.reason = 'upsert', 'pending', None
    dispatch(db, tenant, row)
    audit(db, tenant, actor, 'live_requeued', iid, eid)
    db.flush()
    return row
