"""CB-18 local contracts; PostgreSQL enforcement is tested separately."""
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, func
from app.models import Base, User, Workspace, Membership, Conversation, SignalEvidence
from app.services import lifecycle


def seed(db):
    shared, solo = uuid.uuid4(), uuid.uuid4()
    db.add_all([User(id=shared, email='shared@example.test'), User(id=solo, email='solo@example.test'), Workspace(tenant_id='a', name='A'), Workspace(tenant_id='b', name='B')])
    db.flush()
    db.add_all([Membership(tenant_id='a', user_id=shared, role='admin'), Membership(tenant_id='b', user_id=shared, role='admin'), Membership(tenant_id='a', user_id=solo, role='reviewer')])
    db.add_all([Conversation(tenant_id=t, conversation_id='c', channel='chat', started_at=datetime.now(timezone.utc)) for t in ('a','b')])
    db.flush()
    from app.models import Message, SignalPrediction
    import hashlib
    for tenant in ('a','b'):
        content = 'Persisted redacted source'
        db.add(Message(tenant_id=tenant, conversation_id='c', message_id='m', role='customer', content=content,
            content_sha256=hashlib.sha256(content.encode()).hexdigest(), timestamp=datetime.now(timezone.utc)))
        prediction = SignalPrediction(tenant_id=tenant, conversation_id='c', signal_type='lead', confidence=0.9, summary='Persisted summary')
        db.add(prediction)
        db.flush()
        db.add(SignalEvidence(tenant_id=tenant, prediction_id=prediction.id, message_id='m', start_cp=0,
            end_cp=len(content), text_sha256=hashlib.sha256(content.encode()).hexdigest(), candidate_turns=1))
    db.commit()
    return str(shared), solo


def test_inventory_is_exhaustive():
    assert set(lifecycle.DISPOSITIONS) == set(Base.metadata.tables)


def test_export_isolated_checksummed_expiring_and_revoked(db):
    actor, _ = seed(db)
    bundle = lifecycle.create_export(db, 'a', actor)
    export_id = bundle.id
    payload = lifecycle.download_export(db, 'a', export_id)
    assert payload['manifest']['version'] == 'cb18.v1'
    assert 'users' not in payload['data']
    assert 'b' not in [r['tenant_id'] for r in payload['data']['conversations']]
    lifecycle.verify_bundle(payload)
    request = lifecycle.request_deletion(db, 'a', actor)
    with pytest.raises(lifecycle.LifecycleError):
        lifecycle.confirm_deletion(db, 'a', request.id, actor, 'wrong')
    lifecycle.confirm_deletion(db, 'a', request.id, actor, 'DELETE a')
    with pytest.raises(lifecycle.LifecycleError):
        lifecycle.download_export(db, 'a', export_id)


def test_hold_blocks_delete_and_sweep_but_allows_export(db):
    actor, _ = seed(db)
    lifecycle.place_hold(db, 'a', actor, 'litigation', 'tenant', None)
    assert lifecycle.create_export(db, 'a', actor)
    request = lifecycle.request_deletion(db, 'a', actor)
    with pytest.raises(lifecycle.LifecycleError, match='legal_hold'):
        lifecycle.confirm_deletion(db, 'a', request.id, actor, 'DELETE a')
    with pytest.raises(lifecycle.LifecycleError, match='legal_hold'):
        lifecycle.sweep(db, 'a', actor)


def test_crash_resume_shared_users_and_counts_only_receipt(db):
    actor, solo = seed(db)
    request = lifecycle.request_deletion(db, 'a', actor)
    lifecycle.confirm_deletion(db, 'a', request.id, actor, 'DELETE a')
    first = lifecycle.advance_deletion(db, 'a', request.id, actor, batch_size=1)
    assert first.state == 'running'
    db.close()  # all completed work and checkpoints must already be durable
    while True:
        request = lifecycle.advance_deletion(db, 'a', request.id, actor, batch_size=1)
        if request.state == 'completed':
            break
    assert db.get(User, uuid.UUID(actor)) is not None
    assert db.get(User, solo) is None
    assert db.get(Workspace, 'a') is None
    assert db.get(Workspace, 'b') is not None
    assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.tenant_id == 'a')) == 0
    receipt = lifecycle.receipt(request)
    assert all(isinstance(n, int) for n in receipt['counts'].values())
    assert 'email' not in json.dumps(receipt)
    assert lifecycle.advance_deletion(db, 'a', request.id, actor).state == 'completed'


def test_expired_download_and_late_write_fail_closed(db):
    from sqlalchemy.exc import IntegrityError
    actor, _ = seed(db)
    bundle = lifecycle.create_export(db, 'a', actor)
    export_id = bundle.id
    bundle.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    with pytest.raises(lifecycle.LifecycleError, match='export_unavailable'):
        lifecycle.download_export(db, 'a', export_id)
    request = lifecycle.request_deletion(db, 'a', actor)
    lifecycle.confirm_deletion(db, 'a', request.id, actor, 'DELETE a')
    db.add(Conversation(tenant_id='a', conversation_id='late', channel='chat', started_at=datetime.now(timezone.utc)))
    with pytest.raises(IntegrityError, match='tenant_deleting'):
        db.commit()
    db.rollback()
    db.add(Conversation(tenant_id='b', conversation_id='allowed', channel='chat', started_at=datetime.now(timezone.utc)))
    db.commit()


def test_failed_batch_rolls_back_counts_and_resumes(db, monkeypatch):
    actor, _ = seed(db)
    request = lifecycle.request_deletion(db, 'a', actor)
    request_id = request.id
    lifecycle.confirm_deletion(db, 'a', request_id, actor, 'DELETE a')
    # Reach a batch with actual evidence, then fail after DELETE but before commit.
    lifecycle.advance_deletion(db, 'a', request_id, actor)
    before = dict(request.counts)
    checkpoint = request.checkpoint
    original = lifecycle.delete_batch
    def crash(*args):
        original(*args)
        raise RuntimeError('synthetic_mid_batch_crash')
    monkeypatch.setattr(lifecycle, 'delete_batch', crash)
    with pytest.raises(RuntimeError):
        lifecycle.advance_deletion(db, 'a', request_id, actor)
    db.refresh(request)
    assert request.state == 'failed'
    assert request.checkpoint == checkpoint and request.counts == before
    assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.tenant_id == 'a')) == 1
    monkeypatch.setattr(lifecycle, 'delete_batch', original)
    while lifecycle.advance_deletion(db, 'a', request_id, actor).state != 'completed':
        pass
    assert request.counts['signal_evidence'] == 1


def test_restore_tombstone_refences_and_replays_before_traffic(db):
    from app.models.lifecycle import TenantDeletion
    from sqlalchemy import delete
    actor, _ = seed(db)
    request = lifecycle.request_deletion(db, 'a', actor)
    request_id = request.id
    lifecycle.confirm_deletion(db, 'a', request_id, actor, 'DELETE a')
    while lifecycle.advance_deletion(db, 'a', request_id, actor).state != 'completed':
        pass
    receipt = lifecycle.receipt(request)
    # Simulate an old backup without the tombstone and with restored source rows.
    db.execute(delete(TenantDeletion).where(TenantDeletion.tenant_id == 'a'))
    db.add(Workspace(tenant_id='a', name='restored'))
    db.flush()
    db.add(Membership(tenant_id='a', user_id=uuid.UUID(actor), role='admin'))
    db.add(Conversation(tenant_id='a', conversation_id='restored', channel='chat', started_at=datetime.now(timezone.utc)))
    db.commit()
    restored = lifecycle.reconcile_tombstone(db, 'a', receipt, actor)
    assert restored.fenced and restored.checkpoint == 0
    while lifecycle.advance_deletion(db, 'a', restored.id, actor).state != 'completed':
        pass
    assert db.get(Workspace, 'a') is None and db.get(Workspace, 'b') is not None


def test_retention_clocks_anonymization_holds_and_batch_progress(db):
    from app.models import Message, SignalPrediction
    from app.models.lifecycle import TenantExport
    from sqlalchemy import update
    actor, _ = seed(db)
    old = datetime.now(timezone.utc) - timedelta(days=181)
    for model in (Conversation, Message, SignalPrediction, SignalEvidence):
        db.execute(update(model).where(model.tenant_id=='a').values(created_at=old))
    db.commit()
    counts = lifecycle.sweep(db, 'a', actor)
    assert counts['messages'] == 1 and counts['signal_evidence'] == 1
    assert db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id=='a')) is None
    assert db.scalar(select(Message).where(Message.tenant_id=='b')).content
    assert lifecycle.sweep(db, 'a', actor)['signal_predictions'] == 0


def test_export_columns_require_explicit_policy_for_schema_changes():
    for name, table in Base.metadata.tables.items():
        if name in lifecycle.EXCLUDED_EXPORTS:
            continue
        assert set(lifecycle.EXPORT_COLUMNS[name]) | set(lifecycle.EXPORT_OMITTED_COLUMNS.get(name, ())) == set(table.c.keys()), name
    forbidden = {'email', 'provider_request_id', 'updated_by'}
    assert not forbidden.intersection(name for columns in lifecycle.EXPORT_COLUMNS.values() for name in columns)


def test_another_current_admin_can_resume_without_removing_their_authority(db):
    actor, solo = seed(db)
    db.get(Membership, ('a', solo)).role = 'admin'
    db.commit()
    request = lifecycle.request_deletion(db, 'a', actor)
    rid = request.id
    lifecycle.confirm_deletion(db, 'a', rid, str(solo), 'DELETE a')
    while True:
        row = lifecycle.advance_deletion(db, 'a', rid, str(solo), batch_size=1)
        if row.state == 'completed':
            break
        assert db.get(Membership, ('a', solo)) is not None


def test_resource_hold_cannot_target_another_tenants_resource(db):
    actor, _ = seed(db)
    db.add(Conversation(tenant_id='b', conversation_id='b-only', channel='chat', started_at=datetime.now(timezone.utc)))
    db.commit()
    with pytest.raises(lifecycle.LifecycleError, match='resource_not_found'):
        lifecycle.place_hold(db, 'a', actor, 'regulatory', 'conversation', 'b-only')
    assert lifecycle.place_hold(db, 'a', actor, 'regulatory', 'conversation', 'c')


def test_manual_retention_expires_old_audit_and_financial_summaries(db):
    from app.models.lifecycle import AuditEvent, LifecycleLedgerSummary
    actor, _ = seed(db)
    old = datetime.now(timezone.utc) - timedelta(days=366)
    event_id = str(uuid.uuid4())
    db.add(AuditEvent(id=event_id, tenant_id='a', actor_id=actor,
        resource_type='retention', resource_id=str(uuid.uuid4()),
        operation='retention_sweep', created_at=old))
    db.add(LifecycleLedgerSummary(tenant_id='a', id=str(uuid.uuid4()), attempts=1,
        unknown_attempts=0, reserved_usd=0, spent_usd=0, created_at=old))
    db.commit()
    counts = lifecycle.sweep(db, 'a', actor)
    assert counts['expired_summaries'] == 2
    assert db.scalar(select(func.count()).select_from(LifecycleLedgerSummary)) == 0
    assert db.get(AuditEvent, event_id) is None


def test_restore_receipt_is_bound_to_its_original_tenant(db):
    actor, _ = seed(db)
    row = lifecycle.request_deletion(db, 'a', actor)
    lifecycle.confirm_deletion(db, 'a', row.id, actor, 'DELETE a')
    while lifecycle.advance_deletion(db, 'a', row.id, actor).state != 'completed':
        pass
    saved = lifecycle.receipt(row)
    assert saved['tenant_id'] == 'a'
    with pytest.raises(lifecycle.LifecycleError, match='invalid_tombstone'):
        lifecycle.reconcile_tombstone(db, 'b', saved, actor)
    assert db.get(Workspace, 'b') is not None
