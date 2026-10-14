"""CB-14 regressions: synthetic data and injected providers only."""
import pytest
from app.schemas.job import HistoricalDetectJobIn
from app.services import classification_cache as cache
from app.services import jobs
from tests.test_jobs import body, worker_config

pytest_plugins = ["tests.actor_support"]


def test_historical_schema_10k_and_duplicates():
    assert len(HistoricalDetectJobIn(request_id="history", conversation_ids=[f"c{i}" for i in range(10000)]).conversation_ids) == 10000
    with pytest.raises(ValueError):
        HistoricalDetectJobIn(request_id="history", conversation_ids=["c", "c"])


def test_cache_identity_includes_context_and_versions():
    chat = body().conversations[0]
    key = cache.identity("a", chat, "model", {})
    assert key != cache.identity("b", chat, "model", {})
    assert key != cache.identity("a", chat, "other", {})
    assert key != cache.identity("a", chat, "model", {"lead": {"keywords": ["x"]}})
    assert key != cache.identity("a", chat.model_copy(update={"channel": "email"}), "model", {})
    clone = chat.model_copy(update={"conversation_id": "another", "messages": [chat.messages[0].model_copy(update={"message_id": "another-message"})]})
    assert key == cache.identity("a", clone, "model", {})


def test_historical_enqueue_reference_only_and_page(db):
    from app.services.conversations import upsert_conversations
    chats = body(tuple(f"c{i:04}" for i in range(205))).conversations
    upsert_conversations(db, tenant_id="a", payloads=chats, commit=False)
    row = jobs.enqueue_historical(db, "a", "history", [c.conversation_id for c in chats])
    db.commit()
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    page = jobs.work_page(db, lease)
    assert len(page) == 100
    assert row.conversation_count == 205
    from app.models.upload import Upload
    assert "demat" not in str(db.get(Upload, ("a", row.upload_id)).payload)
    for chat in page:
        jobs.publish_conversation(db, lease, chat.conversation_id, jobs.chat_content_hash(chat), "heuristic", [])
        db.commit()
    jobs.yield_chunk(db, lease)
    db.commit()
    assert row.status == "queued" and row.cursor == 100 and row.attempt_count == 0
    lease = jobs.claim(db, "a", "worker2")
    assert len(jobs.work_page(db, lease)) == 100
    assert jobs.work_page(db, lease)[0].conversation_id == "c0100"


def enable_provider(monkeypatch, db, calls):
    from app.config import get_settings
    from app.services.inference_budget import configure
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("DETECT_LLM_PRIMARY", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    configure(db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    configure(db, "a", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    db.commit()
    def provider(model, messages):
        calls.append(model)
        return {"type": "lead", "confidence": .9, "summary": "Buying intent", "quotes": ["I want to open a demat account"]}, {"status": "succeeded", "usage": {"input_tokens": 10, "output_tokens": 5, "cached_input_tokens": 2}}
    return provider


def test_worker_hits_no_provider_or_budget_and_rebuilds_anchors(db, monkeypatch):
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker
    from app.worker import Worker
    from app.models.inference_attempt import InferenceAttempt
    from app.models.inference_budget import InferenceReservation
    from app.models.signal_evidence import SignalEvidence
    from app.services.inference_ledger import query_detection_run_inference
    from app.models.job import Job
    calls = []
    provider = enable_provider(monkeypatch, db, calls)
    jid = jobs.enqueue_upload(db, "a", "same", body(("c1", "c2"))).id
    db.commit()
    worker = Worker(sessionmaker(bind=db.get_bind()), call=provider)
    assert worker.run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    assert len(calls) == 1
    attempts = list(db.scalars(select(InferenceAttempt).order_by(InferenceAttempt.started_at)))
    assert len(attempts) == 2
    hit = next(a for a in attempts if a.cache_hit)
    assert hit.conversation_id == "c2" and hit.estimated_cost_usd == 0 and hit.cost_status == "reconciled"
    assert hit.cached_input_tokens == hit.input_tokens == hit.output_tokens == 0
    assert hit.provider_request_id is None
    assert len(list(db.scalars(select(InferenceReservation)))) == 1
    assert {a.message_id for a in db.scalars(select(SignalEvidence))} == {"m-c1", "m-c2"}
    summary = query_detection_run_inference(db, tenant_id="a", detection_run_id=jid)
    assert summary.cache_hits == 1 and summary.unknown_cost_count == 1


@pytest.mark.parametrize("component", range(6))
def test_each_cache_key_component_is_required(db, component):
    chat = body().conversations[0]
    key = cache.identity("a", chat, "model", {})
    parsed = {"type": "lead", "confidence": .9, "summary": "Buying intent", "quotes": ["I want to open a demat account"]}
    cache.store(db, key, parsed, chat)
    db.commit()
    assert cache.lookup(db, key, chat)[1]
    changed = list(key)
    changed[component] = "other" if component not in (1, 5) else "f" * 64
    assert cache.lookup(db, tuple(changed), chat) is None


def test_expired_invalid_and_ungrounded_cache_are_misses(db):
    from datetime import datetime, timedelta, timezone
    from app.models.classification_cache import ClassificationCache
    chat = body().conversations[0]
    key = cache.identity("a", chat, "model", {})
    parsed = {"type": "lead", "confidence": .9, "summary": "Buying intent", "quotes": ["I want to open a demat account"]}
    cache.store(db, key, parsed, chat)
    db.commit()
    row = db.get(ClassificationCache, key)
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert cache.lookup(db, key, chat) is None
    db.commit()
    assert db.get(ClassificationCache, key) is None
    cache.store(db, key, parsed, chat)
    db.commit()
    row = db.get(ClassificationCache, key)
    row.classification = {"type": "lead", "confidence": .9, "quotes": ["fabricated quote"]}
    db.commit()
    assert cache.lookup(db, key, chat) is None
    row.classification = {"garbage": True}
    db.commit()
    assert cache.lookup(db, key, chat) is None


def test_cache_keeps_first_result_until_expiry(db):
    from datetime import datetime, timedelta, timezone
    from app.models.classification_cache import ClassificationCache
    chat = body().conversations[0]
    key = cache.identity("a", chat, "model", {})
    first = {"type": "lead", "confidence": .9, "summary": "First result", "quotes": ["I want to open a demat account"]}
    second = {**first, "confidence": .8, "summary": "Second result"}
    cache.store(db, key, first, chat)
    db.commit()
    cache.store(db, key, second, chat)
    db.commit()
    db.expire_all()
    assert cache.lookup(db, key, chat)[0] == {**first, "summary": ""}
    db.get(ClassificationCache, key).expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    cache.store(db, key, second, chat)
    db.commit()
    db.expire_all()
    assert cache.lookup(db, key, chat)[0] == {**second, "summary": ""}


def test_cache_hit_atomic_rollback_on_lease_loss(db, monkeypatch):
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker
    from app.models.inference_attempt import InferenceAttempt
    from app.models.job import Job
    from app.worker import Worker
    calls = []
    provider = enable_provider(monkeypatch, db, calls)
    jid = jobs.enqueue_upload(db, "a", "same", body(("c1", "c2"))).id
    db.commit()
    original = jobs.publish_conversation
    def lose(db, lease, cid, *args):
        if cid == "c2":
            raise jobs.LeaseLost("synthetic loss")
        return original(db, lease, cid, *args)
    monkeypatch.setattr(jobs, "publish_conversation", lose)
    Worker(sessionmaker(bind=db.get_bind()), call=provider).run_once("a")
    db.expire_all()
    assert not list(db.scalars(select(InferenceAttempt).where(InferenceAttempt.cache_hit.is_(True))))
    assert db.get(Job, ("a", jid)).cursor == 1


def test_historical_overlap_source_change_and_cancellation(db):
    from app.services.conversations import upsert_conversations
    from app.models.message import Message
    from app.models.detection_resume import DetectionResume
    chats = body(("c1", "c2")).conversations
    upsert_conversations(db, tenant_id="a", payloads=chats, commit=False)
    row = jobs.enqueue_historical(db, "a", "history", ["c1", "c2"])
    db.commit()
    with pytest.raises(jobs.JobError, match="conversation_job_in_progress"):
        jobs.enqueue_upload(db, "a", "overlap", body())
    db.rollback()
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    first = jobs.work_page(db, lease)[0]
    jobs.publish_conversation(db, lease, first.conversation_id, jobs.chat_content_hash(first), "heuristic", [])
    db.commit()
    db.query(Message).filter_by(tenant_id="a", message_id="m-c1").update({"content": "changed"})
    db.commit()
    jobs.cancel(db, "a", row.id)
    db.commit()
    assert set(db.get(DetectionResume, "a").failed_conversation_ids) == {"c1", "c2"}
    with pytest.raises(jobs.LeaseLost):
        jobs.publish_conversation(db, lease, "c2", jobs.chat_content_hash(chats[1]), "heuristic", [])


def test_cache_hit_requires_explicit_zero_usage(db):
    from datetime import datetime, timezone
    from sqlalchemy.exc import IntegrityError
    from app.models.inference_attempt import InferenceAttempt
    db.add(InferenceAttempt(tenant_id="a", attempt_id="invalid-hit", logical_operation_id="op", attempt_ordinal=1,
        stage="detect", route_version="route", provider="groq", model="model", prompt_version="prompt",
        cache_hit=True, status="succeeded", usage_status="reported", started_at=datetime.now(timezone.utc),
        finished_at=datetime.now(timezone.utc), estimated_cost_usd=0, cost_status="reconciled"))
    with pytest.raises(IntegrityError):
        db.flush()


from tests.test_gateway import ROWS


@pytest.mark.parametrize("row", ROWS, ids=lambda row: row["id"])
def test_cached_and_uncached_offline_replay_parity(db, row):
    from types import SimpleNamespace as NS
    from app.ai import gateway
    from app.models.classification_cache import ClassificationCache
    from sqlalchemy import select
    assert len(ROWS) == 120
    chat = NS(customer_name=row["conversation"]["customerName"], channel=row["conversation"]["channel"], messages=[NS(**m) for m in row["messages"]])
    parsed = gateway.parse_classification(row["replay"])
    key = cache.identity("a", chat, gateway.DEFAULT_MODEL, {})
    try:
        expected = gateway.classification_output(parsed, chat, chat.messages, gateway.DEFAULT_MODEL)
    except gateway.ProviderFailure as rejected:
        uncached = gateway.heuristic_output(chat, chat.messages)
        # Attempted cache admission must reject the same response on every run.
        for _ in range(2):
            with pytest.raises(gateway.ProviderFailure) as failure:
                cache.store(db, key, parsed, chat)
            assert failure.value.category == rejected.category
            db.commit()
            assert cache.lookup(db, key, chat) is None
            assert list(db.scalars(select(ClassificationCache))) == []
            assert gateway.heuristic_output(chat, chat.messages) == uncached == row["output"]
    else:
        cache.store(db, key, parsed, chat)
        db.commit()
        actual = cache.lookup(db, key, chat)
        assert actual is not None
        # Free-form provider summaries are deliberately redacted from the cache;
        # classification, confidence, quotes and commercial evidence are unchanged.
        assert [{k: v for k, v in item.items() if k != "summary"} for item in actual[1]] == [
            {k: v for k, v in item.items() if k != "summary"} for item in expected]
        assert cache.lookup(db, key, chat) == actual


def test_historical_chunk_completion(db, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    from app.services.conversations import upsert_conversations
    from app.models.job import Job
    from app.worker import Worker
    chats = body(tuple(f"c{i:04}" for i in range(205))).conversations
    upsert_conversations(db, tenant_id="a", payloads=chats, commit=False)
    jid = jobs.enqueue_historical(db, "a", "history", [c.conversation_id for c in chats]).id
    db.commit()
    worker = Worker(sessionmaker(bind=db.get_bind()), call=lambda *_: pytest.fail("provider called"))
    for cursor in (100, 200, 205):
        assert worker.run_once("a")
        db.expire_all()
        row = db.get(Job, ("a", jid))
        assert row.cursor == cursor
        assert row.status == ("succeeded" if cursor == 205 else "queued")
    assert not worker.run_once("a")


def test_historical_missing_reference_fails_without_partial_enqueue(db):
    from app.models.job import Job
    from sqlalchemy import select
    with pytest.raises(jobs.JobError, match="source_unavailable"):
        jobs.enqueue_historical(db, "a", "missing", ["missing"])
    db.rollback()
    assert list(db.scalars(select(Job))) == []


def test_historical_http_verified_actor_only(api):
    from tests.actor_support import actor_headers, add_member
    client, factory = api
    actor = add_member(factory, "a@example.test", "a", "reviewer")
    response = client.put("/v1/tenants/a/jobs/uploads/source", json=body(("c1", "c2")).model_dump(mode="json"), headers=actor_headers(actor, "a"))
    assert response.status_code == 202
    assert client.post("/v1/tenants/a/jobs/historical", json={"request_id": "history", "conversation_ids": ["c1"]}).status_code in {401, 403}
    client.post(f"/v1/tenants/a/jobs/{response.json()['job_id']}/cancel", headers=actor_headers(actor, "a"))
    response = client.post("/v1/tenants/a/jobs/historical", json={"request_id": "history", "conversation_ids": ["c1", "c2"]}, headers=actor_headers(actor, "a"))
    assert response.status_code == 202
    assert response.json()["conversation_count"] == 2


def test_fallback_is_metered_and_cached_under_actual_model(db, monkeypatch):
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    from app.ai.gateway import ProviderFailure
    from app.worker import Worker
    from app.models.inference_attempt import InferenceAttempt
    from app.models.inference_budget import InferenceReservation
    calls = []
    successful = enable_provider(monkeypatch, db, [])
    monkeypatch.setenv("DETECT_LLM_FALLBACK_MODEL", "fallback-model")
    get_settings.cache_clear()
    primary = get_settings().detect_llm_model
    def provider(model, messages):
        calls.append(model)
        if model == primary:
            raise ProviderFailure("quota", daily_quota=True)
        return successful(model, messages)
    jobs.enqueue_upload(db, "a", "fallback", body(("c1", "c2")))
    db.commit()
    Worker(sessionmaker(bind=db.get_bind()), call=provider).run_once("a")
    rows = list(db.scalars(select(InferenceAttempt)))
    assert calls == [primary, "fallback-model", primary]
    assert len(rows) == 4 and sum(r.cache_hit for r in rows) == 1
    hit = next(r for r in rows if r.cache_hit)
    assert hit.model == "fallback-model" and hit.estimated_cost_usd == 0
    assert len(list(db.scalars(select(InferenceReservation)))) == 3


def test_historical_budget_denial_never_dispatches(db, monkeypatch):
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    from app.models.inference_attempt import InferenceAttempt
    from app.models.job import Job
    from app.services.conversations import upsert_conversations
    from app.worker import Worker
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    upsert_conversations(db, tenant_id="a", payloads=body().conversations, commit=False)
    jid = jobs.enqueue_historical(db, "a", "denied", ["c1"]).id
    db.commit()
    Worker(sessionmaker(bind=db.get_bind()), call=lambda *_: pytest.fail("unbudgeted call")).run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).last_error_category == "ai_paused"
    assert db.scalar(select(InferenceAttempt)) is None


def test_cache_identity_is_sensitive_to_order_and_privacy_version(monkeypatch):
    from app.ai import gateway
    chat = body().conversations[0]
    second = chat.messages[0].model_copy(update={"message_id": "second", "content": "Actually I no longer want this"})
    chat = chat.model_copy(update={"messages": [chat.messages[0], second]})
    key = cache.identity("a", chat, "model", {})
    assert key != cache.identity("a", chat.model_copy(update={"messages": list(reversed(chat.messages))}), "model", {})
    monkeypatch.setattr(gateway, "PORT_SHA256", "f" * 64)
    assert key != cache.identity("a", chat, "model", {})


@pytest.mark.parametrize('scope', ['a', 'global'])
@pytest.mark.parametrize('unconfigured', [False, True])
def test_warm_cache_respects_ai_controls(db, monkeypatch, scope, unconfigured):
    from sqlalchemy import select, delete
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    from app.models.inference_budget import InferenceControl, InferenceReservation
    from app.models.inference_attempt import InferenceAttempt
    from app.models.detection_run import DetectionRun
    from app.models.job import Job
    from app.services.inference_budget import configure
    from app.ai.gateway import heuristic_output
    from app.worker import Worker
    calls = []
    provider = enable_provider(monkeypatch, db, calls)
    configure(db, 'global', 1000, 1000, True, 'synthetic', jobs.PRINCIPAL)
    chat = body().conversations[0]
    parsed, _ = provider(get_settings().detect_llm_model, [])
    cache.store(db, cache.identity('a', chat, get_settings().detect_llm_model, {}), parsed, chat)
    if unconfigured:
        db.execute(delete(InferenceControl).where(InferenceControl.scope == scope))
    else:
        configure(db, scope, 1000, 1000, False, 'paused', jobs.PRINCIPAL)
    jid = jobs.enqueue_upload(db, 'a', 'paused', body()).id
    db.commit()
    monkeypatch.setattr(cache, 'lookup', lambda *_: pytest.fail('paused cache consulted'))
    Worker(sessionmaker(bind=db.get_bind()), call=lambda *_: pytest.fail('paused provider called')).run_once('a')
    db.expire_all()
    row = db.get(Job, ('a', jid))
    assert row.status == 'succeeded' and row.last_error_category == 'ai_paused'
    run = db.get(DetectionRun, ('a', jid, 'c1'))
    assert run.model_version == 'heuristic'
    assert run.output == heuristic_output(chat, chat.messages, {})
    assert list(db.scalars(select(InferenceAttempt))) == []
    assert list(db.scalars(select(InferenceReservation))) == []


def test_cache_discards_sensitive_free_text_and_reconstructs(db, monkeypatch):
    import json
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker
    from app.models.classification_cache import ClassificationCache
    from app.models.signal_evidence import SignalEvidence
    from app.models.message import Message
    from app.models.job import Job
    from app.models.inference_attempt import InferenceAttempt
    from app.services.evidence_anchors import reconstruct
    from app.worker import Worker
    calls = []
    successful = enable_provider(monkeypatch, db, calls)
    marker = 'SYNTHETIC-SENSITIVE-MARKER'
    def provider(*args):
        parsed, result = successful(*args)
        parsed['quotes'].append(marker)
        parsed['summary'] = marker
        parsed['unused'] = marker
        return parsed, result
    jid = jobs.enqueue_upload(db, 'a', 'sanitize', body(('c1', 'c2'))).id
    db.commit()
    Worker(sessionmaker(bind=db.get_bind()), call=provider).run_once('a')
    db.expire_all()
    assert db.get(Job, ('a', jid)).status == 'succeeded'
    rows = list(db.scalars(select(ClassificationCache)))
    assert len(rows) == 1 and marker not in json.dumps(rows[0].classification)
    assert set(rows[0].classification) == {'type', 'confidence', 'summary', 'quotes'}
    assert len(calls) == 1
    assert len(list(db.scalars(select(InferenceAttempt).where(InferenceAttempt.cache_hit.is_(True))))) == 1
    anchors = list(db.scalars(select(SignalEvidence)))
    assert {a.message_id for a in anchors} == {'m-c1', 'm-c2'}
    for anchor in anchors:
        message = db.scalar(select(Message).where(Message.tenant_id == 'a', Message.message_id == anchor.message_id))
        assert anchor.tenant_id == message.tenant_id == 'a'
        assert reconstruct(message.content, start=anchor.start_cp, end=anchor.end_cp, digest=anchor.text_sha256) == 'I want to open a demat account'


@pytest.mark.parametrize('operation', ['lookup', 'store'])
def test_cache_purges_expired_rows_only_for_current_tenant(db, operation):
    from datetime import timedelta
    from sqlalchemy import select
    from app.models.classification_cache import ClassificationCache
    chat = body().conversations[0]
    parsed = {'type': 'lead', 'confidence': .9, 'summary': '', 'quotes': ['I want to open a demat account']}
    for tenant in ('a', 'b'):
        key = cache.identity(tenant, chat, 'old-model', {})
        cache.store(db, key, parsed, chat)
        db.flush()
        db.get(ClassificationCache, key).expires_at = jobs.now(db) - timedelta(seconds=1)
    db.commit()
    key = cache.identity('a', chat, 'new-model', {})
    cache.lookup(db, key, chat) if operation == 'lookup' else cache.store(db, key, parsed, chat)
    db.commit()
    rows = list(db.scalars(select(ClassificationCache)))
    assert not any(r.tenant_id == 'a' and r.model_id == 'old-model' for r in rows)
    assert any(r.tenant_id == 'b' and r.model_id == 'old-model' for r in rows)


@pytest.mark.parametrize('scope', ['a', 'global'])
def test_pause_after_cache_lookup_prevents_publication(db, monkeypatch, scope):
    from sqlalchemy import select
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    from app.models.detection_run import DetectionRun
    from app.models.inference_attempt import InferenceAttempt
    from app.services.inference_budget import configure
    from app.worker import Worker
    calls = []
    provider = enable_provider(monkeypatch, db, calls)
    chat = body().conversations[0]
    parsed, _ = provider(get_settings().detect_llm_model, [])
    cache.store(db, cache.identity('a', chat, get_settings().detect_llm_model, {}), parsed, chat)
    jid = jobs.enqueue_upload(db, 'a', 'pause-during-lookup', body()).id
    db.commit()
    lookup = cache.lookup
    def pause_after_lookup(session, *args):
        hit = lookup(session, *args)
        assert hit is not None
        configure(session, scope, 1000, 1000, False, 'paused', jobs.PRINCIPAL)
        return hit
    monkeypatch.setattr(cache, 'lookup', pause_after_lookup)
    Worker(sessionmaker(bind=db.get_bind()), call=lambda *_: pytest.fail('paused provider called')).run_once('a')
    db.expire_all()
    assert db.get(DetectionRun, ('a', jid, 'c1')).model_version == 'heuristic'
    assert list(db.scalars(select(InferenceAttempt))) == []


def test_cache_normalizes_classification_fields_before_storage(db):
    from app.models.classification_cache import ClassificationCache
    chat = body().conversations[0]
    key = cache.identity('a', chat, 'model', {})
    parsed = {'type': 'lead', 'confidence': 3, 'summary': 'discard me',
              'quotes': ['I want to open a demat account'], 'extra': 'discard me'}
    cache.store(db, key, parsed, chat)
    db.commit()
    assert db.get(ClassificationCache, key).classification == {
        'type': 'lead', 'confidence': 1, 'summary': '',
        'quotes': ['I want to open a demat account']}
