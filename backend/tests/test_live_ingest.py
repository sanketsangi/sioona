"""CB-16 durable receipts, ordering, revocation and explicit recovery."""
from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from app.config import get_settings
from app.models.job import Job
from app.models.live_ingest import LiveEvent, LiveSource
from app.schemas.live_ingest import LiveEventIn, InstallationIn
from app.services import live_ingest as live, jobs
from tests.test_jobs import body

@pytest.fixture(autouse=True)
def config(monkeypatch):
    monkeypatch.setenv('SIOONA_DETECTION_EXECUTION', 'worker')
    monkeypatch.setenv('DETECT_LLM', '0')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

def install(db):
    live.configure_installation(db, 'a', 'install1', InstallationIn(workspace_id='w1', consent_reference='consent-1', monitoring_reference='monitor-1'), '00000000-0000-0000-0000-000000000001')
    db.commit()

def event(eid='e1', version=100, text='hello', kind='upsert'):
    return LiveEventIn(installation_id='install1', workspace_id='w1', event_id=eid,
        payload_sha256=jobs.digest([eid, version, text]), source_id='source1', source_version=version,
        occurred_at=datetime.now(timezone.utc), kind=kind,
        conversation=body(text=text).conversations[0] if kind == 'upsert' else None)

def test_receipt_and_job_commit_together_and_duplicate_is_idempotent(db):
    install(db)
    receipt = live.accept_event(db, 'a', event())
    jid = receipt.job_id
    db.rollback()
    assert db.get(LiveEvent, ('a', 'install1', 'e1')) is None
    assert db.get(Job, ('a', jid)) is None
    receipt = live.accept_event(db, 'a', event())
    db.commit()
    assert live.accept_event(db, 'a', event()).job_id == receipt.job_id
    assert len(list(db.scalars(select(Job)))) == 1
    with pytest.raises(live.LiveError, match='event_identity_conflict'):
        live.accept_event(db, 'a', event(text='different'))

def test_busy_conversation_is_retained_and_later_version_advances(db):
    install(db)
    first = live.accept_event(db, 'a', event())
    second = live.accept_event(db, 'a', event('e2', 102, 'new text'))
    older = live.accept_event(db, 'a', event('e0', 99))
    db.commit()
    assert second.state == 'pending' and second.payload
    assert older.state == 'ignored'
    db.get(Job, ('a', first.job_id)).status = 'succeeded'
    db.commit()
    live.dispatch_pending(db, 'a')
    db.commit()
    assert second.job_id and second.state == 'dispatched'
    assert db.get(LiveSource, ('a', 'install1', 'source1')).source_version == 102

def test_equal_version_conflict_and_unresolved_go_to_recoverable_dead_letter(db):
    install(db)
    live.accept_event(db, 'a', event())
    conflict = live.accept_event(db, 'a', event('e2', 100, 'changed'))
    unresolved = live.accept_event(db, 'a', event('e3', 101, kind='unresolved'))
    db.commit()
    assert conflict.state == unresolved.state == 'dead_lettered'
    assert unresolved.source_id and unresolved.payload is None

def test_revocation_cancels_jobs_fences_workers_and_blocks_requeue(db):
    install(db)
    receipt = live.accept_event(db, 'a', event())
    db.commit()
    lease = jobs.claim(db, 'a', 'worker')
    db.commit()
    live.revoke_installation(db, 'a', 'install1', '00000000-0000-0000-0000-000000000001')
    db.commit()
    with pytest.raises(jobs.LeaseLost): jobs.fenced(db, lease, corpus=True)
    with pytest.raises(live.LiveError, match='integration_revoked'): live.accept_event(db, 'a', event('e2'))
    with pytest.raises(live.LiveError, match='integration_revoked'): live.requeue(db, 'a', 'install1', 'e1', '00000000-0000-0000-0000-000000000001')
    assert db.get(Job, ('a', receipt.job_id)).status == 'cancelled'

def test_dead_letter_requeue_keeps_identity_and_advances_fence(db):
    install(db)
    receipt = live.accept_event(db, 'a', event())
    db.commit()
    row = db.get(Job, ('a', receipt.job_id))
    row.status, row.attempt_count, row.lease_token = 'dead_lettered', 3, 7
    db.commit()
    live.requeue(db, 'a', 'install1', 'e1', '00000000-0000-0000-0000-000000000001')
    db.commit()
    assert row.status == 'queued' and row.attempt_count == 0 and row.lease_token == 8
    assert live.accept_event(db, 'a', event()).job_id == row.id

def test_deletion_tombstone_prevents_resurrection_and_scrubs_source_copies(db):
    from app.models.message import Message
    from app.models.upload import Upload
    install(db)
    receipt = live.accept_event(db, 'a', event())
    db.commit()
    from app.models.supervised_action import SupervisedActionDecision
    db.add(SupervisedActionDecision(tenant_id='a', conversation_id='c1', action_type='lead_outreach_draft', status='approved', subject='private', body='private', evidence_quote='private'))
    db.commit()
    deleted = live.accept_event(db, 'a', event('delete', 103, kind='delete'))
    db.commit()
    assert deleted.state == 'succeeded'
    assert not list(db.scalars(select(Message)))
    assert db.get(Upload, ('a', db.get(Job, ('a', receipt.job_id)).upload_id)).payload is None
    assert live.accept_event(db, 'a', event('late', 104)).state == 'ignored'
    assert db.get(LiveEvent, ('a', 'install1', 'e1')).payload is None

pytest_plugins = ["tests.actor_support"]

@pytest.mark.parametrize('mode', ['off','shadow','enforce'])
def test_live_api_enforces_admin_and_named_principal_in_all_modes(api, monkeypatch, mode):
    from tests.actor_support import actor_headers, add_member
    client, factory = api
    monkeypatch.setenv('SIOONA_ACTOR_AUTH', mode)
    get_settings.cache_clear()
    admin = add_member(factory, 'admin@example.test', 'a', 'admin')
    reviewer = add_member(factory, 'reviewer@example.test', 'a', 'reviewer')
    root = '/v1/tenants/a/live'
    config = dict(workspace_id='w1', consent_reference='consent1', monitoring_reference='monitor1')
    assert client.put(root + '/installations/install1', json=config, headers={'X-Tenant-Id':'a','X-Sioona-Role':'admin'}).status_code == 401
    assert client.put(root + '/installations/install1', json=config, headers=actor_headers(reviewer,'a')).status_code == 403
    assert client.put(root + '/installations/install1', json=config, headers=actor_headers(admin,'a')).status_code == 200
    payload = event().model_dump(mode='json')
    assert client.post(root + '/events', json=payload, headers=actor_headers(admin,'a')).status_code == 403
    assert client.post(root + '/events', json=payload, headers=actor_headers('principal:detection-worker','a')).status_code == 403
    accepted = client.post(root + '/events', json=payload, headers=actor_headers('principal:live-ingest','a'))
    assert accepted.status_code == 202, accepted.text
    forged = client.post(root + '/events', json=payload, headers=actor_headers('principal:live-ingest','b'))
    assert forged.status_code == 404
    listed = client.get(root + '/events', headers=actor_headers(admin,'a'))
    assert listed.status_code == 200 and 'hello' not in listed.text
    assert client.post(root + '/installations/install1/revoke', headers=actor_headers(admin,'a')).status_code == 200
    assert client.post(root + '/events', json=payload, headers=actor_headers('principal:live-ingest','a')).status_code == 409


def test_live_event_runs_existing_worker_and_processes_later_snapshot(db, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    from app.worker import Worker
    from app.models.detection_run import DetectionRun
    monkeypatch.setenv('SIOONA_WORKER_TENANTS','a,b')
    get_settings.cache_clear()
    install(db)
    first = live.accept_event(db,'a',event())
    db.commit()
    second = live.accept_event(db,'a',event('e2',102,'updated message'))
    db.commit()
    worker = Worker(sessions=sessionmaker(bind=db.get_bind(),expire_on_commit=False),tenants=['a'])
    assert worker.run_once('a')
    assert worker.run_once('a')
    db.expire_all()
    assert db.get(Job,('a',first.job_id)).status == 'succeeded'
    assert db.get(Job,('a',second.job_id)).status == 'succeeded'
    assert len(list(db.scalars(select(DetectionRun)))) == 2


def test_admin_resolution_checkpoint_and_permanent_revocation(api):
    from tests.actor_support import actor_headers, add_member
    client, factory = api
    admin = add_member(factory, 'recover@example.test', 'a', 'admin')
    root = '/v1/tenants/a/live'
    headers = actor_headers(admin, 'a')
    assert client.put(root+'/installations/install1', headers=headers, json={
        'workspace_id':'w1', 'consent_reference':'consent1', 'monitoring_reference':'monitor1',
    }).status_code == 200
    principal = actor_headers('principal:live-ingest','a')
    unresolved = event(kind='unresolved').model_dump(mode='json')
    assert client.post(root+'/events', headers=principal, json=unresolved).json()['state'] == 'dead_lettered'
    snapshot = event(text='Contact recover@example.test').conversation.model_dump(mode='json')
    snapshot['channel'] = 'intercom'
    path = root+'/installations/install1/events/e1/resolution'
    assert client.put(path, headers=actor_headers('principal:live-ingest','a'), json={'conversation':snapshot}).status_code == 403
    recovered = client.put(path, headers=headers, json={'conversation':snapshot})
    assert recovered.status_code == 200 and recovered.json()['job_id']
    assert client.put(path, headers=headers, json={'conversation':snapshot}).status_code == 409
    with factory() as db:
        row = db.get(LiveEvent, ('a','install1','e1'))
        assert 'recover@example.test' not in str(row.payload)
    checkpoint = root+'/installations/install1/checkpoint'
    assert client.put(checkpoint, headers=headers, json={'cursor':'page1'}).status_code == 200
    assert client.put(checkpoint, headers=headers, json={'cursor':'page2'}).status_code == 409
    assert client.put(checkpoint, headers=headers, json={'expected_cursor':'page1','cursor':'page2'}).status_code == 200
    assert client.post(root+'/installations/install1/revoke', headers=headers).status_code == 200
    assert client.put(root+'/installations/install1', headers=headers, json={
        'workspace_id':'w1', 'consent_reference':'consent1', 'monitoring_reference':'monitor1',
    }).status_code == 409
