"""D11 v1: explicit admin operations only. No scheduler and no outbound calls."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import uuid

from sqlalchemy import delete, select, update, tuple_, func, text, or_, JSON, null
from sqlalchemy.orm import Session
from app.models import Base, Membership, User
from app.models.lifecycle import AuditEvent, LegalHold, TenantDeletion, TenantExport, LifecycleLedgerSummary
from app.models.job import Job
from app.services.tenant_lock import lock_tenant_corpus

POLICY_VERSION = 'cb18.v1'
BATCH_SIZE = 250
EXPORT_MAX_ROWS = 25000
EXPORT_MAX_BYTES = 16 * 1024 * 1024
# Explicit dispositions: adding a table requires a deliberate policy decision.
DISPOSITIONS = {
    'lifecycle_ledger_summaries': 'export financial totals; retain 365d after deletion; privileged expiry',
    'live_installations': 'export credential reference only; delete with tenant; no expiry',
    'live_events': 'export redacted canonical input; unresolved retained for recovery; terminal payload expires 180d; replay receipts retained',
    'live_sources': 'export watermarks/tombstones; delete with tenant; no expiry',
    'users': 'shared identity; no export; delete only after last membership',
    'workspaces': 'export; delete last; no expiry',
    'memberships': 'export scoped IDs/role only; delete; no expiry',
    'pilot_requests': 'operator owned; excluded',
    'conversations': 'export; 180d text anonymization, 365d parent cleanup',
    'messages': 'export; 180d',
    'uploads': 'export; 180d snapshot redaction, 365d parent cleanup',
    'upload_conversations': 'export; lifetime of upload/conversation',
    'signal_predictions': 'export; 180d text anonymization, 365d parent cleanup',
    'signal_evidence': 'export; 180d',
    'detection_runs': 'export; 180d',
    'detection_resume': 'export; 180d from updated_at',
    'signal_feedback': 'export; 365d expiry through approved wipe/retention path',
    'supervised_action_decisions': 'export; 365d expiry through approved wipe/retention path',
    'pilot_settings': 'export; 365d from updated_at',
    'taxonomy_overrides': 'export; 365d from updated_at',
    'weekly_upload_receipts': 'export; 365d',
    'inference_attempts': 'export bounded ledger summary only; 365d',
    'inference_controls': 'export limits only; tenant deletion excludes global control',
    'inference_budgets': 'export financial summary; 365d',
    'inference_run_budgets': 'export; delete with tenant (no timestamp)',
    'inference_reservations': 'export financial summary; 365d settled only',
    'jobs': 'export metadata only; terminal jobs 30d',
    'job_conversations': 'export; lifetime of terminal job (30d)',
    'classification_cache': 'derived; no export; 7d maximum or expires_at',
    'audit_events': 'export; append-only; 365d privileged expiry only',
    'legal_holds': 'export; retained for hold authority',
    'tenant_deletions': 'counts-only tombstone; retained for restore reconciliation',
    'tenant_exports': 'private generated artifact; 24h; excluded from export; revoke at confirmation',
}
# FK order is explicit. Audit, tombstones and holds survive for reconciliation.
DELETE_ORDER = (
    'live_events', 'live_sources', 'live_installations',
    'tenant_exports', 'signal_evidence', 'signal_feedback', 'supervised_action_decisions',
    'signal_predictions', 'inference_reservations', 'inference_attempts',
    'messages', 'detection_runs', 'job_conversations', 'classification_cache',
    'jobs', 'upload_conversations', 'uploads', 'conversations', 'detection_resume',
    'weekly_upload_receipts', 'pilot_settings', 'taxonomy_overrides',
    'inference_run_budgets', 'inference_budgets', 'inference_controls',
    'memberships', 'workspaces',
)
# Explicit allowlists for records containing operational payloads or identity.
EXPORT_COLUMNS = {
    'live_installations': ('tenant_id','id','workspace_id','credential_ref','active','consent_reference','monitoring_reference','reconciliation_cursor','created_at'),
    'live_events': ('tenant_id','installation_id','event_id','source_id','provider_object_id','source_version','occurred_at','payload_sha256','content_sha256','kind','state','payload','job_id','reason','received_at'),
    'live_sources': ('tenant_id','installation_id','source_id','source_version','content_sha256','conversation_id','deleted'),
    'audit_events': ('id', 'tenant_id', 'actor_id', 'actor_role', 'resource_type', 'resource_id', 'resource_version', 'operation', 'result', 'reason_code', 'correlation_id', 'created_at'),
    'conversations': ('id', 'tenant_id', 'conversation_id', 'channel', 'customer_name', 'started_at', 'external_id', 'ground_truth', 'created_at', 'updated_at'),
    'detection_resume': ('tenant_id', 'failed_conversation_ids', 'skipped_conversation_ids', 'updated_at'),
    'detection_runs': ('tenant_id', 'run_id', 'conversation_id', 'content_hash', 'model_version', 'prompt_version', 'status', 'output', 'coverage', 'created_at'),
    'inference_attempts': ('tenant_id', 'id', 'stage', 'status', 'usage_status', 'input_tokens', 'output_tokens', 'estimated_cost_usd', 'cost_status', 'created_at'),
    'inference_budgets': ('tenant_id', 'budget_day', 'attempts', 'reserved_usd', 'spent_usd'),
    'inference_controls': ('tenant_id', 'enabled', 'daily_attempt_limit', 'run_attempt_limit', 'mode', 'limit_usd', 'updated_at'),
    'inference_reservations': ('tenant_id', 'attempt_id', 'run_id', 'budget_day', 'status', 'reserved_usd', 'created_at'),
    'inference_run_budgets': ('tenant_id', 'run_id', 'attempts'),
    'job_conversations': ('tenant_id', 'job_id', 'conversation_id', 'ordinal', 'content_sha256', 'context_sha256', 'completed'),
    'jobs': ('tenant_id', 'id', 'job_type', 'status', 'created_at', 'updated_at'),
    'legal_holds': ('id', 'tenant_id', 'reason_code', 'resource_type', 'resource_id', 'active', 'created_at'),
    'lifecycle_ledger_summaries': ('tenant_id', 'id', 'attempts', 'unknown_attempts', 'reserved_usd', 'spent_usd', 'created_at'),
    'memberships': ('tenant_id', 'user_id', 'role', 'created_at', 'revoked_at'),
    'messages': ('id', 'tenant_id', 'conversation_id', 'message_id', 'role', 'content', 'content_sha256', 'timestamp', 'created_at'),
    'pilot_settings': ('id', 'tenant_id', 'baseline_opportunities', 'baseline_note', 'weekly_export_count', 'last_uploaded_file_name', 'created_at', 'updated_at'),
    'signal_evidence': ('id', 'tenant_id', 'prediction_id', 'message_id', 'start_cp', 'end_cp', 'text_sha256', 'candidate_turns', 'created_at'),
    'signal_feedback': ('id', 'tenant_id', 'signal_id', 'feedback', 'note', 'reviewed_by', 'reviewed_at'),
    'signal_predictions': ('id', 'active', 'detection_run_id', 'tenant_id', 'conversation_id', 'signal_type', 'confidence', 'summary', 'urgency', 'urgency_timeframe', 'mentioned_value_inr', 'commercial_value_evidence', 'evidence_status', 'acted', 'outcome', 'outcome_value_inr', 'outcome_recorded_at', 'created_at'),
    'supervised_action_decisions': ('id', 'tenant_id', 'conversation_id', 'action_type', 'status', 'subject', 'body', 'evidence_quote', 'created_at', 'decided_at'),
    'taxonomy_overrides': ('id', 'tenant_id', 'signal_type', 'phrases', 'keywords', 'negative_phrases', 'updated_at'),
    'tenant_deletions': ('tenant_id', 'id', 'requested_by', 'state', 'fenced', 'checkpoint', 'counts', 'reason_code', 'policy_version', 'created_at', 'completed_at'),
    'upload_conversations': ('tenant_id', 'upload_id', 'conversation_id'),
    'uploads': ('tenant_id', 'upload_id', 'active', 'source', 'content_sha256', 'status', 'payload', 'imported_at'),
    'weekly_upload_receipts': ('tenant_id', 'receipt_id', 'weekly_file_count', 'created_at'),
    'workspaces': ('tenant_id', 'name', 'created_at'),
}
EXPORT_OMITTED_COLUMNS = {'inference_attempts': ('attempt_id', 'logical_operation_id', 'attempt_ordinal', 'conversation_id', 'detection_run_id', 'job_id', 'route_version', 'provider', 'model', 'prompt_version', 'cache_hit', 'error_category', 'http_status', 'provider_request_id', 'cached_input_tokens', 'reasoning_tokens', 'latency_ms', 'started_at', 'finished_at', 'rate_version'), 'inference_controls': ('scope', 'reason', 'updated_by'), 'jobs': ('upload_id', 'conversation_ids_sha256', 'conversation_count', 'config_sha256', 'priority', 'attempt_count', 'max_attempts', 'cursor', 'run_after', 'lease_owner', 'lease_token', 'leased_at', 'lease_expires_at', 'heartbeat_at', 'last_error_category')}

EXCLUDED_EXPORTS = {'users','pilot_requests','tenant_exports','classification_cache'}


class LifecycleError(ValueError):
    pass


def clock():
    return datetime.now(timezone.utc)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def json_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    raise TypeError('unsupported_export_value')


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), default=json_value).encode()


def audit(db, tenant, actor, operation, resource_type='tenant', resource_id=None, reason='approved', result='succeeded'):
    # Actor is a verified UUID, never a caller-supplied email/free-text label.
    actor = str(uuid.UUID(actor))
    rid = str(uuid.UUID(resource_id)) if resource_id else str(uuid.uuid5(uuid.NAMESPACE_URL, tenant))
    db.add(AuditEvent(tenant_id=tenant, actor_id=actor, resource_type=resource_type,
        resource_id=rid, operation=operation, reason_code=reason, result=result))


def check_hold(db, tenant):
    # Conservative closure: any resource hold blocks the entire sweep/deletion,
    # including parents/derived copies, rather than accidentally cascading it.
    if db.scalar(select(LegalHold.id).where(LegalHold.tenant_id == tenant, LegalHold.active.is_(True)).limit(1)):
        raise LifecycleError('legal_hold')


def ensure_open(db, tenant):
    row = db.get(TenantDeletion, tenant)
    if row and row.fenced:
        raise LifecycleError('tenant_deleting')


def place_hold(db, tenant, actor, reason, resource_type, resource_id):
    lock_tenant_corpus(db, tenant)
    deletion_row = db.get(TenantDeletion, tenant)
    if deletion_row and deletion_row.state == 'completed':
        raise LifecycleError('tenant_deleted')
    if resource_type != 'tenant':
        name, column = ('conversations', 'conversation_id') if resource_type == 'conversation' else ('uploads', 'upload_id')
        table = Base.metadata.tables[name]
        if not db.scalar(select(table.c[column]).where(table.c.tenant_id == tenant, table.c[column] == resource_id).limit(1)):
            raise LifecycleError('resource_not_found')
    row = LegalHold(tenant_id=tenant, reason_code=reason, resource_type=resource_type, resource_id=resource_id)
    db.add(row)
    db.flush()
    audit(db, tenant, actor, 'hold_placed', 'hold', row.id, reason)
    db.commit()
    return row


def release_hold(db, tenant, actor, hold_id):
    lock_tenant_corpus(db, tenant)
    row = db.scalar(select(LegalHold).where(LegalHold.tenant_id == tenant, LegalHold.id == hold_id).with_for_update())
    if row is None:
        raise LifecycleError('hold_not_found')
    row.active = False
    audit(db, tenant, actor, 'hold_released', 'hold', row.id)
    db.commit()


def create_export(db, tenant, actor):
    db.commit()  # End authorization before choosing the snapshot isolation.
    if db.get_bind().dialect.name != 'postgresql':
        return _create_export(db, tenant, actor)
    # Pin the connection: a session advisory lock must never escape to the pool.
    # Use the same corpus key/order as confirmation, before any RR snapshot or
    # tenant GUC SELECT can begin. Transaction locks alone freeze a stale snapshot
    # while waiting. Keeping the lock through publication serializes revocation.
    original_bind = db.bind
    key = int.from_bytes(hashlib.sha256(tenant.encode()).digest()[:8], 'big', signed=True)
    with db.get_bind().engine.connect() as connection:
        try:
            connection.execute(text('SELECT pg_advisory_lock(:key)'), {'key': key})
            connection.commit()
            connection.execution_options(isolation_level='REPEATABLE READ')
            db.bind = connection
            return _create_export(db, tenant, actor)
        finally:
            db.rollback()
            db.bind = original_bind
            try:
                connection.execute(text('SELECT pg_advisory_unlock(:key)'), {'key': key})
                connection.rollback()
            except Exception:
                connection.invalidate()  # Closing the socket releases session locks.
                raise


def _create_export(db, tenant, actor):
    ensure_open(db, tenant)
    snapshot = clock()
    data, total = {}, 0
    for name in sorted(DISPOSITIONS):
        if name in EXCLUDED_EXPORTS:
            continue
        table = Base.metadata.tables[name]
        columns = [table.c[n] for n in EXPORT_COLUMNS[name]]
        records = []
        query = select(*columns).where(table.c.tenant_id == tenant).order_by(*table.primary_key.columns)
        # Stream in bounded pages; hard cap the resulting private artifact.
        for row in db.execute(query.execution_options(yield_per=BATCH_SIZE)).mappings():
            total += 1
            if total > EXPORT_MAX_ROWS:
                raise LifecycleError('export_too_large')
            records.append(json.loads(encoded(dict(row))))
        data[name] = records
        if len(encoded(data)) > EXPORT_MAX_BYTES:
            raise LifecycleError('export_too_large')
    manifest = {'version': POLICY_VERSION, 'tenant_id': tenant, 'snapshot_at': snapshot.isoformat(),
        'checksums': {name: hashlib.sha256(encoded(rows)).hexdigest() for name, rows in data.items()}}
    row = TenantExport(tenant_id=tenant, bundle={'manifest': manifest, 'data': data}, expires_at=snapshot + timedelta(hours=24))
    db.add(row)
    db.flush()
    audit(db, tenant, actor, 'export_created', 'export', row.id)
    db.commit()
    return row


def verify_bundle(bundle):
    assert set(bundle['manifest']['checksums']) == set(bundle['data'])
    for name, rows in bundle['data'].items():
        assert hashlib.sha256(encoded(rows)).hexdigest() == bundle['manifest']['checksums'][name]


def download_export(db, tenant, export_id, actor=None):
    lock_tenant_corpus(db, tenant)
    ensure_open(db, tenant)
    row = db.scalar(select(TenantExport).where(TenantExport.tenant_id == tenant, TenantExport.id == export_id))
    if row is None or row.bundle is None or aware(row.expires_at) <= clock():
        raise LifecycleError('export_unavailable')
    result = row.bundle
    if actor:
        audit(db, tenant, actor, 'export_read', 'export', row.id)
        db.commit()
    return result


def request_deletion(db, tenant, actor):
    lock_tenant_corpus(db, tenant)
    row = db.get(TenantDeletion, tenant)
    if row:
        return row
    row = TenantDeletion(tenant_id=tenant, requested_by=str(uuid.UUID(actor)))
    db.add(row)
    db.flush()
    audit(db, tenant, actor, 'deletion_requested', 'deletion', row.id)
    db.commit()
    return row


def deletion(db, tenant, request_id):
    row = db.scalar(select(TenantDeletion).where(TenantDeletion.tenant_id == tenant, TenantDeletion.id == request_id).with_for_update().execution_options(populate_existing=True))
    if row is None:
        raise LifecycleError('deletion_not_found')
    return row


def confirm_deletion(db, tenant, request_id, actor, confirmation):
    lock_tenant_corpus(db, tenant)
    row = deletion(db, tenant, request_id)
    if confirmation != f'DELETE {tenant}':
        raise LifecycleError('confirmation_mismatch')
    check_hold(db, tenant)
    if row.fenced:
        return row
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(('cb18:' + tenant).encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    # Fence leases before the persistent write barrier is raised, in one commit.
    db.execute(update(Job).where(Job.tenant_id == tenant, Job.status.in_(['queued','leased'])).values(
        status='cancelled', lease_token=Job.lease_token + 1, lease_owner=None, lease_expires_at=None))
    db.execute(delete(TenantExport).where(TenantExport.tenant_id == tenant))
    budgets = Base.metadata.tables['inference_budgets']
    totals = db.execute(select(func.coalesce(func.sum(budgets.c.attempts), 0),
        func.coalesce(func.sum(budgets.c.reserved_usd), 0), func.coalesce(func.sum(budgets.c.spent_usd), 0)).where(budgets.c.tenant_id == tenant)).one()
    attempts = Base.metadata.tables['inference_attempts']
    ledger_totals = db.execute(select(func.count(), func.coalesce(func.sum(attempts.c.estimated_cost_usd), 0)).where(attempts.c.tenant_id == tenant)).one()
    unknown = db.scalar(select(func.count()).select_from(attempts).where(attempts.c.tenant_id == tenant,
        (attempts.c.status == 'pending') | (attempts.c.usage_status == 'unknown') | (attempts.c.cost_status == 'unknown'))) or 0
    db.add(LifecycleLedgerSummary(tenant_id=tenant, id=row.id, attempts=ledger_totals[0],
        reserved_usd=totals[1], spent_usd=ledger_totals[1], unknown_attempts=unknown))
    row.fenced, row.state = True, 'confirmed'
    audit(db, tenant, actor, 'deletion_confirmed', 'deletion', row.id)
    db.commit()
    return row


def delete_batch(db, table, predicate, limit):
    keys = list(table.primary_key.columns)
    selection = select(*keys).where(predicate).order_by(*keys).limit(limit)
    return int(db.execute(delete(table).where(tuple_(*keys).in_(selection))).rowcount or 0)


def remove_memberships(db, tenant, limit, preserve=None):
    rows = list(db.scalars(select(Membership).where(Membership.tenant_id == tenant, Membership.user_id != uuid.UUID(preserve) if preserve else True).order_by(Membership.user_id).limit(limit)))
    for row in rows:
        user_id = row.user_id
        if db.get_bind().dialect.name == 'postgresql':
            # The restricted function sees all memberships despite forced RLS.
            db.execute(text('SELECT cb18_remove_membership(:tenant, :uid)'), {'tenant': tenant, 'uid': user_id})
        else:
            db.delete(row)
            db.flush()
            if not db.scalar(select(Membership.user_id).where(Membership.user_id == user_id).limit(1)):
                db.execute(delete(User).where(User.id == user_id))
    return len(rows)


def advance_deletion(db, tenant, request_id, actor, batch_size=BATCH_SIZE):
    from app.services.tenant_data import wipe_tenant_data
    return wipe_tenant_data(db, tenant_id=tenant, request_id=request_id, actor_id=actor, batch_size=batch_size)


def run_deletion_step(db, tenant, request_id, actor, batch_size):
    if not 1 <= batch_size <= BATCH_SIZE:
        raise LifecycleError('invalid_batch_size')
    lock_tenant_corpus(db, tenant)
    row = deletion(db, tenant, request_id)
    if row.state == 'completed':
        return row
    if not row.fenced:
        raise LifecycleError('confirmation_required')
    try:
        check_hold(db, tenant)
    except LifecycleError:
        row.state, row.reason_code = 'blocked', 'legal_hold'
        audit(db, tenant, actor, 'deletion_blocked', 'deletion', row.id, 'legal_hold', 'blocked')
        db.commit()
        return row
    row.state, row.reason_code = 'running', None
    if row.checkpoint < len(DELETE_ORDER):
        name = DELETE_ORDER[row.checkpoint]
        table = Base.metadata.tables[name]
        if name == 'workspaces':
            # Keep the executing admin authorized until the final atomic step.
            final_members = remove_memberships(db, tenant, batch_size)
            row.counts = {**row.counts, 'memberships': row.counts.get('memberships', 0) + final_members}
        count = remove_memberships(db, tenant, batch_size, actor) if name == 'memberships' else delete_batch(db, table, table.c.tenant_id == tenant, batch_size)
        row.counts = {**row.counts, name: row.counts.get(name, 0) + count}
        if count < batch_size or name == 'workspaces':
            row.checkpoint += 1
        audit(db, tenant, actor, 'deletion_step', 'deletion', row.id)
    if row.checkpoint == len(DELETE_ORDER):
        row.state, row.completed_at = 'completed', clock()
        audit(db, tenant, actor, 'deletion_completed', 'deletion', row.id)
    db.commit()  # delete + counts + checkpoint are atomic; retries cannot double count
    return row


def receipt(row):
    return {'id': row.id, 'tenant_id': row.tenant_id, 'state': row.state, 'checkpoint': row.checkpoint, 'steps': len(DELETE_ORDER),
        'counts': row.counts, 'reason_code': row.reason_code, 'policy_version': row.policy_version,
        'completed_at': row.completed_at.isoformat() if row.completed_at else None, 'backup_expiry': 'Hosting provider natural retention window; no immediate backup deletion.'}


def sweep(db, tenant, actor):
    """One bounded manual sweep. Holds conservatively block all related copies.

    Parent stubs remain to preserve 365-day review/outcome records; text is
    irreversibly anonymized at the shorter deadline. No scheduler invokes this.
    """
    lock_tenant_corpus(db, tenant)
    ensure_open(db, tenant)
    check_hold(db, tenant)
    now = clock()
    counts = {}
    for name, days, column in (
        ('tenant_exports',1,'expires_at'), ('signal_evidence',180,'created_at'),
        ('messages',180,'created_at'), ('detection_runs',180,'created_at'),
        ('detection_resume',180,'updated_at'), ('pilot_settings',365,'updated_at'),
        ('taxonomy_overrides',365,'updated_at'), ('weekly_upload_receipts',365,'created_at'),
        ('classification_cache',7,'created_at'),
        ('signal_feedback',365,'reviewed_at'), ('supervised_action_decisions',365,'decided_at'),
    ):
        table = Base.metadata.tables[name]
        cutoff = now if name == 'tenant_exports' else now - timedelta(days=days)
        counts[name] = delete_batch(db, table, (table.c.tenant_id == tenant) & (table.c[column] <= cutoff), BATCH_SIZE)
    for name, days, column, values in (
        ('conversations',180,'created_at',dict(customer_name=None, external_id=None, ground_truth=None)),
        ('uploads',180,'imported_at',dict(payload=None, source='expired')),
        ('signal_predictions',180,'created_at',dict(summary='', commercial_value_evidence=None, evidence_status='unresolved', urgency=None, urgency_timeframe=None, mentioned_value_inr=None)),
        ('signal_predictions',365,'outcome_recorded_at',dict(outcome=None, outcome_value_inr=None, outcome_recorded_at=None)),
    ):
        table = Base.metadata.tables[name]
        keys = list(table.primary_key.columns)
        # JSON null and SQL NULL differ; use SQL NULL so anonymization is
        # idempotent and subsequent batches can advance past cleared rows.
        values = {key: null() if value is None and isinstance(table.c[key].type, JSON) else value for key, value in values.items()}
        changed = or_(*(table.c[key].is_distinct_from(value) for key, value in values.items()))
        ids = select(*keys).where(table.c.tenant_id == tenant, table.c[column] <= now-timedelta(days=days), changed).order_by(*keys).limit(BATCH_SIZE)
        counts[name] = counts.get(name, 0) + int(db.execute(update(table).where(tuple_(*keys).in_(ids)).values(**values)).rowcount or 0)
    # Live receipts/tombstones retain replay defense. Never expire unresolved work.
    live_events = Base.metadata.tables['live_events']
    counts['live_event_payloads'] = int(db.execute(update(live_events).where(
        live_events.c.tenant_id == tenant,
        live_events.c.state.in_(['succeeded','ignored','cancelled']),
        live_events.c.received_at <= now-timedelta(days=180),
        live_events.c.payload.is_not(None)).values(payload=null())).rowcount or 0)
    # Delete only terminal jobs and their bounded references; pending work stays.
    table = Base.metadata.tables['jobs']
    ids = list(db.scalars(select(table.c.id).where(table.c.tenant_id == tenant,
        table.c.status.in_(['succeeded','cancelled','dead_lettered']), table.c.updated_at <= now-timedelta(days=30)).limit(BATCH_SIZE)))
    refs = Base.metadata.tables['job_conversations']
    counts['job_conversations'] = delete_batch(db, refs, (refs.c.tenant_id == tenant) & refs.c.job_id.in_(ids), BATCH_SIZE)
    remaining = select(refs.c.job_id).where(refs.c.tenant_id == tenant)
    counts['jobs'] = int(db.execute(delete(table).where(table.c.tenant_id == tenant, table.c.id.in_(ids), table.c.id.not_in(remaining))).rowcount or 0)
    # Remove expired graph parents only after their longer-lived children have
    # expired. Fresh reviews/outcomes keep an anonymized parent, never prose.
    uploads = Base.metadata.tables['uploads']
    memberships = Base.metadata.tables['upload_conversations']
    jobs_table = Base.metadata.tables['jobs']
    referenced_uploads = select(jobs_table.c.upload_id).where(jobs_table.c.tenant_id == tenant,
        jobs_table.c.upload_id.is_not(None))
    upload_ids = select(uploads.c.upload_id).where(uploads.c.tenant_id == tenant,
        uploads.c.imported_at <= now-timedelta(days=180), uploads.c.upload_id.not_in(referenced_uploads)).limit(BATCH_SIZE)
    counts['upload_conversations'] = delete_batch(db, memberships,
        (memberships.c.tenant_id == tenant) & memberships.c.upload_id.in_(upload_ids), BATCH_SIZE)
    remaining_uploads = select(memberships.c.upload_id).where(memberships.c.tenant_id == tenant)
    counts['uploads_removed'] = delete_batch(db, uploads, (uploads.c.tenant_id == tenant) &
        uploads.c.upload_id.in_(upload_ids) & uploads.c.upload_id.not_in(remaining_uploads), BATCH_SIZE)
    predictions = Base.metadata.tables['signal_predictions']
    feedback = Base.metadata.tables['signal_feedback']
    evidence = Base.metadata.tables['signal_evidence']
    prediction_scope = (predictions.c.tenant_id == tenant) & (predictions.c.created_at <= now-timedelta(days=180))
    prediction_scope &= predictions.c.id.not_in(select(feedback.c.signal_id).where(feedback.c.tenant_id == tenant))
    prediction_scope &= predictions.c.id.not_in(select(evidence.c.prediction_id).where(evidence.c.tenant_id == tenant))
    prediction_scope &= (predictions.c.outcome_recorded_at.is_(None) | (predictions.c.outcome_recorded_at <= now-timedelta(days=365)))
    prediction_scope &= (~predictions.c.acted | (predictions.c.created_at <= now-timedelta(days=365)))
    counts['predictions_removed'] = delete_batch(db, predictions, prediction_scope, BATCH_SIZE)
    conversations = Base.metadata.tables['conversations']
    conversation_scope = (conversations.c.tenant_id == tenant) & (conversations.c.created_at <= now-timedelta(days=180))
    for child, column in (('messages','conversation_id'), ('signal_predictions','conversation_id'),
                          ('upload_conversations','conversation_id'), ('supervised_action_decisions','conversation_id')):
        child_table = Base.metadata.tables[child]
        conversation_scope &= conversations.c.conversation_id.not_in(select(child_table.c[column]).where(child_table.c.tenant_id == tenant))
    counts['conversations_removed'] = delete_batch(db, conversations, conversation_scope, BATCH_SIZE)
    for name, column in (('inference_reservations','created_at'), ('inference_attempts','created_at'), ('inference_budgets','budget_day')):
        table = Base.metadata.tables[name]
        cutoff = (now-timedelta(days=365)).date() if column == 'budget_day' else now-timedelta(days=365)
        predicate = (table.c.tenant_id == tenant) & (table.c[column] <= cutoff)
        if name == 'inference_attempts':
            predicate &= table.c.status != 'pending'
        if name == 'inference_reservations':
            predicate &= table.c.status == 'settled'
        if name == 'inference_budgets':
            reservations = Base.metadata.tables['inference_reservations']
            outstanding_days = select(reservations.c.budget_day).where(reservations.c.tenant_id == tenant, reservations.c.status == 'authorized')
            predicate &= table.c.budget_day.not_in(outstanding_days)
        counts[name] = delete_batch(db, table, predicate, BATCH_SIZE)
    # Financial/audit summaries expire through an age- and tenant-restricted
    # definer function; runtime has no direct audit UPDATE/DELETE privilege.
    if db.get_bind().dialect.name == 'postgresql':
        counts['expired_summaries'] = db.scalar(text('SELECT cb18_expire_summaries(:tenant)'), {'tenant': tenant})
    else:
        # SQLite has no roles/definer functions; keep the same bounded policy
        # in the local verification path after the hold check above.
        counts['expired_summaries'] = sum(
            delete_batch(db, model.__table__,
                (model.tenant_id == tenant) & (model.created_at < now - timedelta(days=365)),
                BATCH_SIZE)
            for model in (AuditEvent, LifecycleLedgerSummary)
        )
        db.expire_all()
    audit(db, tenant, actor, 'retention_sweep', 'retention')
    db.commit()
    return counts


def mark_deletion_failed(db, tenant, request_id, actor):
    """Record a safe retry state after rolling back the interrupted batch."""
    lock_tenant_corpus(db, tenant)
    row = deletion(db, tenant, request_id)
    if row.fenced and row.state != 'completed':
        row.state, row.reason_code = 'failed', 'internal_error'
        audit(db, tenant, actor, 'deletion_failed', 'deletion', row.id, 'internal_error', 'failed')
        db.commit()


def reconcile_tombstone(db, tenant, trusted_receipt, actor):
    """Operator-only restore primitive; never exposed as an HTTP operation.

    Input must come from the trusted, separately retained completed receipt
    inventory. Run before allowing traffic/workers on a restored database.
    Re-fence restored work and replay the same bounded deletion path, with holds
    checked at each batch. No provider backup is mutated by this function.
    """
    if (trusted_receipt.get('tenant_id') != tenant
            or trusted_receipt.get('state') != 'completed'
            or trusted_receipt.get('policy_version') != POLICY_VERSION):
        raise LifecycleError('invalid_tombstone')
    request_id = str(uuid.UUID(trusted_receipt['id']))
    if not all(type(value) is int and value >= 0 for value in trusted_receipt.get('counts', {}).values()):
        raise LifecycleError('invalid_tombstone')
    lock_tenant_corpus(db, tenant)
    row = db.get(TenantDeletion, tenant)
    if row is None:
        row = TenantDeletion(tenant_id=tenant, id=request_id, requested_by=str(uuid.UUID(actor)))
        db.add(row)
        db.flush()
    # If the restore already includes a fence, new writes are already denied.
    if not row.fenced:
        db.execute(update(Job).where(Job.tenant_id == tenant, Job.status.in_(['queued','leased'])).values(
            status='cancelled', lease_token=Job.lease_token + 1, lease_owner=None, lease_expires_at=None))
    db.execute(delete(TenantExport).where(TenantExport.tenant_id == tenant))
    row.fenced, row.state, row.checkpoint, row.counts = True, 'confirmed', 0, {}
    row.completed_at = None
    audit(db, tenant, actor, 'deletion_confirmed', 'deletion', row.id)
    db.commit()
    return row


def expire_deleted_tenant_summaries(db, tenant):
    """Operator-only manual expiry; no HTTP route or scheduler invokes this.

    Bind the trusted tenant before calling. Tombstones remain for restore replay.
    """
    lock_tenant_corpus(db, tenant)
    row = db.get(TenantDeletion, tenant)
    if row is None or row.state != 'completed':
        raise LifecycleError('deletion_not_completed')
    check_hold(db, tenant)
    cutoff = clock() - timedelta(days=365)
    if row.completed_at is None or aware(row.completed_at) > cutoff:
        return 0
    if db.get_bind().dialect.name == 'postgresql':
        count = db.scalar(text('SELECT cb18_expire_summaries(:tenant)'), {'tenant': tenant})
    else:
        count = sum(delete_batch(db, model.__table__,
            (model.tenant_id == tenant) & (model.created_at < cutoff), BATCH_SIZE)
            for model in (AuditEvent, LifecycleLedgerSummary))
    db.commit()
    db.expire_all()
    return count
