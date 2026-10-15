"""Sandbox-only exact approval and at-most-once dispatch regressions."""
from datetime import datetime, timedelta, timezone
import uuid
import pytest
from sqlalchemy import select
from app.models.supervised_action import SupervisedActionDecision
from app.models.lifecycle import AuditEvent
from app.services import external_actions as actions
from tests.actor_support import api


ACTOR = str(uuid.uuid4())

@pytest.fixture(autouse=True)
def sandbox(monkeypatch):
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', '{"a":{"sandbox":true,"conversation_ids":["123"],"admin_id":"42","token":"synthetic"}}')

def proposal(db):
    from app.models.membership import Membership
    from app.models import User, Workspace
    db.add(Workspace(tenant_id='a', name='Synthetic'))
    db.add(User(id=uuid.UUID(ACTOR), email='synthetic@example.test'))
    db.flush()
    db.add(Membership(tenant_id='a', user_id=uuid.UUID(ACTOR), role='admin'))
    row = SupervisedActionDecision(tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='approved', subject='Note', body='Operator note')
    db.add(row); db.commit()
    return actions.propose(db, 'a', ACTOR, row.id, '123', 'Operator note')

def approve(db, p):
    return actions.approve(db, 'a', ACTOR, p.id, p.payload_sha256, p.target, p.action_version, datetime.now(timezone.utc)+timedelta(minutes=5))

def test_draft_approval_is_not_execution_permission(db):
    p = proposal(db)
    with pytest.raises(actions.ActionError): actions.execute(db, 'a', ACTOR, p.id)
    assert p.state == 'proposed'

def test_exact_binding_edit_and_expiry(db):
    p = proposal(db)
    with pytest.raises(actions.ActionError): actions.approve(db, 'a', ACTOR, p.id, '0'*64, p.target, 1, datetime.now(timezone.utc)+timedelta(minutes=5))
    e = approve(db, p)
    newer = actions.propose(db, 'a', ACTOR, p.decision_id, '123', 'Edited')
    assert newer.action_version == 2 and e.state == 'failed'
    assert actions.execute(db, 'a', ACTOR, e.id).state == 'failed'

def test_timeout_unknown_no_retry_and_reconcile(db, monkeypatch):
    p = proposal(db); e = approve(db, p)
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    monkeypatch.setattr(actions, 'sandbox_config', lambda tenant, target: ('token', '42'))
    calls = []
    def submit(*args):
        calls.append(args); raise TimeoutError()
    monkeypatch.setattr(actions, 'submit_note', submit)
    assert actions.execute(db, 'a', ACTOR, e.id).state == 'unknown'
    assert actions.execute(db, 'a', ACTOR, e.id).state == 'unknown'
    assert len(calls) == 1
    actions.reconcile(db, 'a', ACTOR, e.id, 'succeeded', '987')
    assert e.state == 'succeeded'
    assert [r.operation for r in db.scalars(select(AuditEvent).order_by(AuditEvent.created_at))] == ['action_proposed','action_approved','action_attempted','action_unknown','action_reconciled']

def test_disabled_and_foreign_tenant_fail_closed(db):
    p = proposal(db); e = approve(db, p)
    with pytest.raises(actions.ActionError): actions.execute(db, 'a', ACTOR, e.id)
    with pytest.raises(actions.ActionError): actions.execute(db, 'b', ACTOR, e.id)
    assert e.state == 'approved'


def test_approval_expiry_actor_change_tamper_and_revocation(db, monkeypatch):
    from app.models.membership import Membership
    p = proposal(db); e = approve(db, p)
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    with pytest.raises(actions.ActionError):
        actions.execute(db, 'a', str(uuid.uuid4()), e.id)
    member = db.get(Membership, ('a', uuid.UUID(ACTOR)))
    member.revoked_at = datetime.now(timezone.utc); db.commit()
    with pytest.raises(actions.ActionError, match='current_admin_required'):
        actions.execute(db, 'a', ACTOR, e.id)
    member.revoked_at = None; db.commit()
    e.expires_at = datetime.now(timezone.utc)-timedelta(seconds=1); db.commit()
    with pytest.raises(actions.ActionError, match='approval_invalid'):
        actions.execute(db, 'a', ACTOR, e.id)


def test_unknown_blocks_replacement_and_draft_edit_invalidates(db, monkeypatch):
    from app.services.supervised_actions import upsert_supervised_action_decision
    p = proposal(db); e = approve(db, p)
    upsert_supervised_action_decision(db, tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='edited', subject='Edited', body='New note', actor_id=ACTOR)
    assert e.state == 'failed' and p.state == 'superseded'
    p = actions.propose(db, 'a', ACTOR, p.decision_id, '123', 'New note')
    e = approve(db, p); e.state='unknown'; db.commit()
    with pytest.raises(actions.ActionError, match='reconciliation_required'):
        actions.propose(db, 'a', ACTOR, p.decision_id, '123', 'Retry note')


def test_adapter_never_posts_customer_comment(monkeypatch):
    calls = []
    class Client:
        def __init__(self, **kwargs): assert kwargs['follow_redirects'] is False
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            calls.append((url, kwargs))
            class Response:
                status_code = 200
                def json(self): return {'id':'123'}
            return Response()
    monkeypatch.setattr(actions.httpx, 'Client', Client)
    payload = {'body':'Synthetic note','message_type':'note','type':'admin','admin_id':'42'}
    assert actions.submit_note('synthetic', '42', '123', payload, 'execution1') == ('succeeded','123')
    assert calls[0][1]['json'] == payload
    assert calls[0][0] == 'https://api.intercom.io/conversations/123/reply'


@pytest.mark.parametrize('mode', ['off','shadow','enforce'])
def test_always_verified_admin_routes(api, monkeypatch, mode):
    from tests.actor_support import actor_headers, add_member
    from app.config import get_settings
    client, factory = api
    owner = add_member(factory, 'owner@example.test', 'a', 'admin')
    reviewer = add_member(factory, 'reviewer@example.test', 'a', 'reviewer')
    monkeypatch.setenv('SIOONA_ACTOR_AUTH', mode); get_settings.cache_clear()
    prefix = '/v1/tenants/a/external-actions'
    assert client.get(prefix, headers={'X-Tenant-Id':'a','X-Sioona-Role':'admin'}).status_code == 401
    assert client.get(prefix, headers=actor_headers(reviewer, 'a')).status_code == 403
    assert client.get(prefix, headers=actor_headers(owner, 'a')).status_code == 200
    with factory() as db:
        row = SupervisedActionDecision(tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='approved', subject='Note', body='Synthetic')
        db.add(row); db.commit(); decision = str(row.id)
    p = client.post(prefix+'/proposals', headers=actor_headers(owner, 'a'), json={'decision_id':decision, 'target':'123', 'body':'Internal note'}).json()
    assert 'payload_sha256' in p
    approval = {'payload_sha256':p['payload_sha256'], 'target':'123', 'action_version':1, 'expires_at':(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()}
    e = client.post(prefix+'/proposals/'+p['id']+'/approve', headers=actor_headers(owner, 'a'), json=approval)
    assert e.status_code == 200
    assert client.post(prefix+'/executions/'+e.json()['id']+'/execute', headers=actor_headers(owner, 'a')).status_code == 409


def test_draft_review_remains_available_to_reviewers_without_execution(api):
    from tests.actor_support import actor_headers, add_member
    client, factory = api
    reviewer = add_member(factory, 'reviewer@example.test', 'a', 'reviewer')
    response = client.post('/v1/tenants/a/supervised-actions', headers=actor_headers(reviewer,'a'), json={
        'conversation_id':'c', 'action_type':'upsell_note_draft', 'status':'approved', 'subject':'Note', 'body':'Synthetic', 'evidence_quote':''})
    assert response.status_code == 200
    from app.models.supervised_action import ActionExecution
    with factory() as db:
        assert list(db.scalars(select(ActionExecution))) == []


def test_payload_tampering_and_target_revocation_never_dispatch(db, monkeypatch):
    p = proposal(db); e = approve(db, p)
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    calls=[]
    monkeypatch.setattr(actions, 'submit_note', lambda *args: calls.append(args))
    original = p.payload_json
    p.payload_json = {**original, 'body':'Tampered'}; db.commit()
    with pytest.raises(actions.ActionError, match='approval_invalid'):
        actions.execute(db,'a',ACTOR,e.id)
    p.payload_json = original; db.commit()
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG','{}')
    with pytest.raises(actions.ActionError, match='sandbox_target_required'):
        actions.execute(db,'a',ACTOR,e.id)
    assert calls == [] and e.state == 'approved'


def test_failed_execution_audit_records_failed_result(db, monkeypatch):
    p = proposal(db)
    e = approve(db, p)
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    monkeypatch.setattr(actions, 'submit_note', lambda *args: ('failed', None))
    assert actions.execute(db, 'a', ACTOR, e.id).state == 'failed'
    event = db.scalar(select(AuditEvent).where(AuditEvent.operation == 'action_failed'))
    assert event.result == 'failed'
    assert event.correlation_id == e.id


def test_reconciled_failure_audit_preserves_verified_result(db):
    p = proposal(db)
    e = approve(db, p)
    e.state = 'unknown'
    db.commit()
    actions.reconcile(db, 'a', ACTOR, e.id, 'failed', 'investigation_123')
    event = db.scalar(select(AuditEvent).where(AuditEvent.operation == 'action_reconciled'))
    assert event.result == 'failed'


@pytest.mark.parametrize('mode', ['off', 'shadow', 'enforce'])
def test_foreign_resource_ids_are_hidden_from_valid_admin(api, monkeypatch, mode):
    from tests.actor_support import actor_headers, add_member
    from app.config import get_settings
    client, factory = api
    owner = add_member(factory, 'owner@example.test', 'a', 'admin')
    outsider = add_member(factory, 'outsider@example.test', 'b', 'admin')
    monkeypatch.setenv('SIOONA_ACTOR_AUTH', mode)
    get_settings.cache_clear()
    with factory() as db:
        draft = SupervisedActionDecision(tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='approved', subject='Note', body='Private')
        db.add(draft)
        db.commit()
        p = actions.propose(db, 'a', owner, draft.id, '123', 'Private operator note')
        e = actions.approve(db, 'a', owner, p.id, p.payload_sha256, p.target, 1, datetime.now(timezone.utc)+timedelta(minutes=5))
        pid, eid = p.id, e.id
    headers = actor_headers(outsider, 'b')
    prefix = '/v1/tenants/b/external-actions'
    approval = {'payload_sha256':'a'*64, 'target':'123', 'action_version':1, 'expires_at':(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()}
    requests = [(f'/proposals/{pid}/approve', approval), (f'/executions/{eid}/execute', {}), (f'/executions/{eid}/reconcile', {'state':'failed','provider_receipt':'investigation'})]
    for suffix, body in requests:
        response = client.post(prefix+suffix, headers=headers, json=body)
        assert response.status_code == 409
        assert response.json()['detail'] == 'action_not_found'
    assert client.get(prefix, headers=headers).json() == {'proposals':[], 'executions':[], 'decisions':[]}


@pytest.mark.parametrize('config', [
    '{"a":{"sandbox":true,"conversation_ids":"123","admin_id":"42","token":"synthetic"}}',
    '{"a":[]}',
    'invalid-json',
])
def test_sandbox_configuration_requires_an_exact_target_list(monkeypatch, config):
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', config)
    with pytest.raises(actions.ActionError):
        actions.sandbox_config('a', '12')


@pytest.mark.parametrize('timeout', [False, True])
def test_http_operator_flow_is_exact_audited_and_never_resubmitted(api, monkeypatch, timeout):
    from tests.actor_support import actor_headers, add_member
    client, factory = api
    actor = add_member(factory, 'operator@example.test', 'a', 'admin')
    headers = actor_headers(actor, 'a')
    prefix = '/v1/tenants/a/external-actions'
    draft = client.post('/v1/tenants/a/supervised-actions', headers=headers, json={
        'conversation_id':'c', 'action_type':'upsell_note_draft', 'status':'approved',
        'subject':'Note', 'body':'Synthetic operator note', 'evidence_quote':''})
    assert draft.status_code == 200
    p = client.post(prefix+'/proposals', headers=headers, json={
        'decision_id':draft.json()['id'], 'target':'123', 'body':'Synthetic operator note'}).json()
    assert client.get(prefix, headers=headers).json()['executions'] == []
    approved = client.post(prefix+'/proposals/'+p['id']+'/approve', headers=headers, json={
        'payload_sha256':p['payload_sha256'], 'target':p['target'], 'action_version':p['action_version'],
        'expires_at':(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()})
    assert approved.status_code == 200
    eid = approved.json()['id']
    calls = []
    def submit(token, admin, target, payload, execution_id):
        calls.append(execution_id)
        assert target == p['target'] and payload == p['payload_json']
        assert payload['message_type'] == 'note' and payload['type'] == 'admin'
        if timeout:
            raise TimeoutError('synthetic post-submit timeout')
        return 'succeeded', 'receipt_123'
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_ENABLED', '1')
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_ENV', 'sandbox')
    monkeypatch.setattr(actions, 'submit_note', submit)
    expected = 'unknown' if timeout else 'succeeded'
    for _ in range(2):
        response = client.post(prefix+'/executions/'+eid+'/execute', headers=headers)
        assert response.status_code == 200
        assert response.json()['state'] == expected
    assert calls == [eid]
    if timeout:
        response = client.post(prefix+'/executions/'+eid+'/reconcile', headers=headers,
            json={'state':'succeeded', 'provider_receipt':'investigation_123'})
        assert response.status_code == 200 and response.json()['state'] == 'succeeded'
    with factory() as db:
        operations = list(db.scalars(select(AuditEvent.operation).where(AuditEvent.resource_type == 'action').order_by(AuditEvent.created_at)))
        assert operations == ['action_proposed', 'action_approved', 'action_attempted', 'action_unknown' if timeout else 'action_succeeded'] + (['action_reconciled'] if timeout else [])


def test_source_deletion_invalidates_unattempted_approval(db, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), 'sioona_detection_execution', 'worker')
    from tests.test_live_ingest import install, event
    from app.services import live_ingest as live
    install(db)
    source = event()
    source.conversation.conversation_id = 'c'
    live.accept_event(db, 'a', source)
    db.commit()
    p = proposal(db)
    e = approve(db, p)
    calls = []
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    monkeypatch.setattr(actions, 'submit_note', lambda *args: calls.append(args))
    deleted = live.accept_event(db, 'a', event('delete', 101, kind='delete'))
    db.commit()
    assert deleted.state == 'succeeded'
    assert p.state == 'superseded' and e.state == 'failed'
    assert actions.execute(db, 'a', ACTOR, e.id).state == 'failed'
    assert calls == []
    events = list(db.scalars(select(AuditEvent).where(AuditEvent.operation.in_(['action_invalidated', 'action_failed']))))
    assert len(events) == 2
    assert all(row.actor_role == 'service' and row.reason_code == 'source_deleted' for row in events)


@pytest.mark.parametrize('response_body', [
    {'id': None}, {'id': True}, {'id': False}, {}, {'id': {}},
    {'id': 123}, {'id': 'bad receipt'}, {'id': 'None'}, ['unexpected'],
])
def test_malformed_success_receipt_stays_unknown_without_retry(db, monkeypatch, response_body):
    calls = []
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, *args, **kwargs):
            calls.append(kwargs)
            class Response:
                status_code = 200
                def json(self): return response_body
            return Response()
    monkeypatch.setattr(actions.httpx, 'Client', Client)
    assert actions.submit_note('synthetic', '42', '123', {'body': 'Synthetic note'}, 'execution') == ('unknown', None)
    calls.clear()
    p = proposal(db)
    e = approve(db, p)
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    for _ in range(2):
        assert actions.execute(db, 'a', ACTOR, e.id).state == 'unknown'
    assert len(calls) == 1
    assert e.provider_receipt is None
    rows = list(db.scalars(select(AuditEvent).where(AuditEvent.operation == 'action_unknown')))
    assert len(rows) == 1 and rows[0].result == 'blocked'
    with pytest.raises(actions.ActionError, match='reconciliation_required'):
        actions.propose(db, 'a', ACTOR, p.decision_id, '123', 'Replacement')
