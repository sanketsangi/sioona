"""Durable job API and lifecycle contracts; PostgreSQL races live separately."""

from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from app.config import get_settings
from app.models.job import Job
from app.models.upload import Upload
from app.models.detection_run import DetectionRun
from app.models.inference_attempt import InferenceAttempt
from app.models.detection_resume import DetectionResume
from app.schemas.job import JobUpload
from app.services import jobs
from app.services.inference_budget import configure
from app.worker import Worker
from tests.actor_support import actor_headers, add_member

pytest_plugins = ["tests.actor_support"]


def body(ids=("c1",), text="I want to open a demat account"):
    return JobUpload(
        source="synthetic.csv",
        conversations=[
            {
                "conversation_id": cid,
                "channel": "upload",
                "started_at": "2026-10-14T00:00:00Z",
                "messages": [
                    {
                        "message_id": f"m-{cid}",
                        "role": "customer",
                        "content": text,
                        "timestamp": "2026-10-14T00:00:00Z",
                    }
                ],
            }
            for cid in ids
        ],
    )


@pytest.fixture(autouse=True)
def worker_config(monkeypatch):
    monkeypatch.setenv("SIOONA_DETECTION_EXECUTION", "worker")
    monkeypatch.setenv("SIOONA_WORKER_TENANTS", "a,b")
    monkeypatch.setenv("SIOONA_WORKER_PAUSE", "0")
    monkeypatch.setenv("DETECT_LLM", "0")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def enqueue(db, upload="u1", ids=("c1",)):
    row = jobs.enqueue_upload(db, "a", upload, body(ids))
    db.commit()
    return row.id


def test_atomic_outbox_and_bounded_reference(db):
    jid = jobs.enqueue_upload(db, "a", "u1", body()).id
    db.rollback()
    assert db.get(Job, ("a", jid)) is None
    assert db.get(Upload, ("a", "u1")) is None
    jid = enqueue(db)
    row = db.get(Job, ("a", jid))
    assert row.conversation_count == 1 and len(row.conversation_ids_sha256) == 64
    assert "demat" not in str(row.__dict__)
    assert jobs.enqueue_upload(db, "a", "u1", body()).id == jid
    with pytest.raises(jobs.JobError, match="upload_identity_conflict"):
        jobs.enqueue_upload(db, "a", "u1", body(text="Different source"))


def test_heartbeat_pause_and_exhaustion(db):
    jid = enqueue(db)
    assert jobs.claim(db, "a", "worker", paused=True) is None
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    old = db.get(Job, ("a", jid)).lease_expires_at
    jobs.heartbeat(db, lease)
    db.commit()
    assert jobs.utc(db.get(Job, ("a", jid)).lease_expires_at) >= jobs.utc(old)
    for attempt in range(1, 4):
        jobs.fail(db, lease, "timeout")
        db.commit()
        row = db.get(Job, ("a", jid))
        if attempt < 3:
            assert row.status == "failed"
            row.run_after = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
            lease = jobs.claim(db, "a", "worker")
            db.commit()
    assert row.status == "dead_lettered" and row.attempt_count == 3
    assert db.get(DetectionResume, "a").failed_conversation_ids == ["c1"]


def test_cancel_fences_a_provider_in_flight(db):
    jid = enqueue(db)
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    row = jobs.cancel(db, "a", jid)
    db.commit()
    assert row.status == "cancelled"
    with pytest.raises(jobs.LeaseLost):
        jobs.complete(db, lease)
    assert db.get(DetectionResume, "a").failed_conversation_ids == ["c1"]


def test_worker_heuristic_reconstruction_and_detect(db):
    jid = enqueue(db)
    factory = sessionmaker(bind=db.get_bind(), autoflush=False)
    worker = Worker(factory)
    assert worker.run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    assert db.get(Upload, ("a", "u1")).status == "completed"
    assert db.get(DetectionRun, ("a", jid, "c1")) is not None
    row = jobs.enqueue_detect(db, "a", "recheck", ["c1"])
    db.commit()
    assert worker.run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", row.id)).status == "succeeded"
    assert db.get(Upload, ("a", "recheck")).active is False


def test_metering_pending_commits_before_dispatch(db, monkeypatch):
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    configure(db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL)
    db.commit()
    jid = enqueue(db)
    factory = sessionmaker(bind=db.get_bind(), autoflush=False)

    def call(model, messages):
        with factory() as check:
            row = check.scalar(
                select(InferenceAttempt).where(InferenceAttempt.job_id == jid)
            )
            assert row.status == "pending" and row.input_tokens is None
        return {
            "type": "lead",
            "confidence": 0.9,
            "summary": "Buying intent",
            "quotes": ["I want to open a demat account"],
        }, {"status": "succeeded", "usage": {}}

    assert Worker(factory, call=call).run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    ledger = db.scalar(select(InferenceAttempt))
    assert ledger.status == "succeeded" and ledger.usage_status == "unknown"
    assert ledger.input_tokens is None and ledger.output_tokens is None


def test_missing_budget_never_dispatches(db, monkeypatch):
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    jid = enqueue(db)

    def forbidden(*_):
        raise AssertionError("unmetered provider")

    assert Worker(sessionmaker(bind=db.get_bind()), call=forbidden).run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).last_error_category == "ai_paused"
    assert db.scalar(select(InferenceAttempt)) is None


def test_api_verified_actor_status_and_cancel(api, monkeypatch):
    client, factory = api
    monkeypatch.setenv("SIOONA_DETECTION_EXECUTION", "worker")
    get_settings.cache_clear()
    a = add_member(factory, "a@example.test", "a", "reviewer")
    b = add_member(factory, "b@example.test", "b", "reviewer")
    path = "/v1/tenants/a/jobs/uploads/u1"
    response = client.put(
        path, json=body().model_dump(mode="json"), headers=actor_headers(a, "a")
    )
    assert response.status_code == 202, response.text
    jid = response.json()["job_id"]
    assert (
        client.get(
            f"/v1/tenants/a/jobs/{jid}", headers=actor_headers(b, "b")
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/v1/tenants/a/jobs/{jid}/cancel", headers=actor_headers(b, "b")
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/v1/tenants/a/jobs/{jid}/cancel", headers=actor_headers(a, "a")
        ).json()["status"]
        == "cancelled"
    )
    # Verified authority is required even during the legacy auth rollout.
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "off")
    get_settings.cache_clear()
    assert (
        client.put(
            path, json=body().model_dump(mode="json"), headers={"X-Tenant-Id": "a"}
        ).status_code
        == 401
    )


def test_inline_mode_preserved_and_jobs_disabled(db, monkeypatch):
    monkeypatch.delenv("SIOONA_DETECTION_EXECUTION")
    get_settings.cache_clear()
    assert get_settings().sioona_detection_execution == "inline"
    with pytest.raises(jobs.JobError, match="worker_mode_required"):
        enqueue(db)


def test_pause_drains_without_spending_retry(db):
    jid = enqueue(db)
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    jobs.drain(db, lease)
    db.commit()
    row = db.get(Job, ("a", jid))
    assert row.status == "queued" and row.attempt_count == 0
    next_lease = jobs.claim(db, "a", "new")
    db.commit()
    assert next_lease.token == lease.token + 1


def test_completed_job_upload_snapshot_is_reconstructible(db):
    from app.schemas.ingestion import IngestionFile
    from app.services.upload_snapshot import load_upload_snapshot

    b = body(ids=("c1", "c2"))
    b.files = [
        IngestionFile(source="first.csv", conversation_ids=["c1"]),
        IngestionFile(source="second.csv", conversation_ids=["c2"]),
    ]
    row = jobs.enqueue_upload(db, "a", "u1", b)
    jid = row.id
    db.commit()
    assert Worker(sessionmaker(bind=db.get_bind())).run_once("a")
    db.expire_all()
    parent = db.get(Upload, ("a", "u1"))
    snapshot, run = load_upload_snapshot(db, parent)
    assert run == jid and len(snapshot.detections) == 2
    children = db.scalars(
        select(Upload).where(Upload.tenant_id == "a", Upload.upload_id != "u1")
    ).all()
    assert len(children) == 2
    for child in children:
        snapshot, run = load_upload_snapshot(db, child)
        assert run == jid and len(snapshot.detections) == 1


def test_recovery_cron_excludes_durable_jobs_even_after_rollback(db, monkeypatch):
    from app.services.ingestion_recovery import recover_staged_ingestions

    enqueue(db)
    monkeypatch.setenv("SIOONA_DETECTION_EXECUTION", "inline")
    get_settings.cache_clear()
    assert recover_staged_ingestions(db, grace_seconds=0)["attempted"] == 0


def test_provider_failures_are_metered_and_bounded(db, monkeypatch):
    from app.ai.gateway import ProviderFailure

    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    configure(db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL)
    db.commit()
    jid = enqueue(db)
    calls = []

    def fail(*_):
        calls.append(1)
        raise ProviderFailure(
            "timeout", result={"status": "timeout", "error_category": "timeout"}
        )

    worker = Worker(sessionmaker(bind=db.get_bind()), call=fail)
    for index in range(3):
        assert worker.run_once("a")
        db.expire_all()
        row = db.get(Job, ("a", jid))
        if index < 2:
            assert row.status == "failed"
            row.run_after = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
    assert row.status == "dead_lettered" and len(calls) == 3
    attempts = db.scalars(select(InferenceAttempt)).all()
    assert len(attempts) == 3 and all(
        a.status == "timeout" and a.input_tokens is None for a in attempts
    )


def test_daily_quota_fallback_has_separate_pending_reservation(db, monkeypatch):
    from app.ai.gateway import ProviderFailure

    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    configure(db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL)
    db.commit()
    jid = enqueue(db)
    calls = []

    def call(model, messages):
        calls.append(model)
        if len(calls) == 1:
            raise ProviderFailure("quota", daily_quota=True)
        return {"type": "none", "confidence": 0.9, "summary": "Ops", "quotes": []}, {
            "status": "succeeded",
            "usage": {},
        }

    assert Worker(sessionmaker(bind=db.get_bind()), call=call).run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    assert calls == ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]
    attempts = db.scalars(
        select(InferenceAttempt).order_by(InferenceAttempt.attempt_ordinal)
    ).all()
    assert [a.attempt_ordinal for a in attempts] == [1, 2]


def test_detect_preserves_canonical_metadata(db):
    from app.models.conversation import Conversation

    b = body()
    b.conversations[0].external_id = "external-synthetic"
    b.conversations[0].ground_truth = "lead"
    jobs.enqueue_upload(db, "a", "u1", b)
    db.commit()
    Worker(sessionmaker(bind=db.get_bind())).run_once("a")
    jobs.enqueue_detect(db, "a", "recheck", ["c1"])
    db.commit()
    chat = db.scalar(
        select(Conversation).where(
            Conversation.tenant_id == "a", Conversation.conversation_id == "c1"
        )
    )
    assert chat.external_id == "external-synthetic" and chat.ground_truth == "lead"


def test_changed_publication_stays_in_resume(db):
    from app.models.message import Message

    enqueue(db)
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    content_hash = jobs.conversation_content_hash(db, "a", "c1")
    jobs.publish_conversation(db, lease, "c1", content_hash, "heuristic", [])
    db.commit()
    message = db.scalar(select(Message).where(Message.tenant_id == "a"))
    message.content = "New genuine request"
    db.commit()
    jobs.fail(db, lease, "source_changed")
    db.commit()
    assert db.get(DetectionResume, "a").failed_conversation_ids == ["c1"]


def test_admission_rechecks_lease_after_budget_lock(db, monkeypatch):
    configure(db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL)
    db.commit()
    jid = enqueue(db)
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    original = jobs.reserve

    def delayed_reserve(*args, **kwargs):
        result = original(*args, **kwargs)
        db.get(Job, ("a", jid)).lease_expires_at = datetime.now(
            timezone.utc
        ) - timedelta(seconds=1)
        return result

    monkeypatch.setattr(jobs, "reserve", delayed_reserve)
    with pytest.raises(jobs.LeaseLost):
        jobs.admit(
            db,
            lease,
            "c1",
            jobs.conversation_content_hash(db, "a", "c1"),
            "qwen/qwen3.8-27b",
        )
    db.rollback()
    assert db.scalar(select(InferenceAttempt)) is None


def test_worker_tick_rotates_busy_tenants(monkeypatch):
    """Same fairness invariant that failed before the initial rotation fix."""
    claimed = []
    worker = Worker(tenants=("a", "b", "c"))
    def busy(tenant):
        claimed.append(tenant)
        return True
    monkeypatch.setattr(worker, "run_once", busy)
    for _ in range(6):
        assert worker.tick()
    assert claimed == ["a", "b", "c", "a", "b", "c"]


def test_worker_tick_skips_empty_tenants_and_respects_pause(monkeypatch):
    claimed = []
    worker = Worker(tenants=("a", "b"))
    def busy(tenant):
        claimed.append(tenant)
        return tenant == "b"
    monkeypatch.setattr(worker, "run_once", busy)
    assert worker.tick()
    assert worker.tick()
    assert claimed == ["a", "b", "b"]
    monkeypatch.setenv("SIOONA_WORKER_PAUSE", "1")
    assert not worker.tick()
    assert claimed == ["a", "b", "b"]


def test_pause_preserves_only_unpublished_ids_for_resume(db):
    jid = enqueue(db, ids=("c1", "c2"))
    lease = jobs.claim(db, "a", "worker")
    db.commit()
    jobs.publish_conversation(db, lease, "c1", jobs.conversation_content_hash(db, "a", "c1"), "heuristic", [])
    db.commit()
    jobs.drain(db, lease)
    db.commit()
    resume = db.get(DetectionResume, "a")
    assert resume is not None
    assert resume.skipped_conversation_ids == ["c2"]
    assert resume.failed_conversation_ids == []
    assert Worker(sessionmaker(bind=db.get_bind())).run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    assert db.get(DetectionResume, "a").skipped_conversation_ids == []


@pytest.mark.parametrize("older_replace", [False, True])
def test_disjoint_newer_append_preserves_older_publication(db, older_replace):
    from app.models.upload import UploadConversation
    from app.models.weekly_upload_receipt import WeeklyUploadReceipt
    older = body(ids=("older",)); older.replace = older_replace
    jid = jobs.enqueue_upload(db, "a", "older-upload", older).id
    db.commit()
    lease = jobs.claim(db, "a", "old-worker"); db.commit()
    jobs.fail(db, lease, "timeout"); db.commit()
    newer = jobs.enqueue_upload(db, "a", "newer-upload", body(ids=("newer",)))
    newer_id = newer.id
    db.get(Job, ("a", jid)).run_after = datetime.now(timezone.utc) + timedelta(hours=1)
    db.get(Upload, ("a", "older-upload")).imported_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()
    worker = Worker(sessionmaker(bind=db.get_bind()))
    assert worker.run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", newer_id)).status == "succeeded"
    db.get(Job, ("a", jid)).run_after = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert worker.run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    for uid, cid in [("older-upload", "older"), ("newer-upload", "newer")]:
        assert db.get(Upload, ("a", uid)).active
        assert db.get(UploadConversation, ("a", uid, cid)) is not None
        assert db.get(WeeklyUploadReceipt, ("a", uid)) is not None


def test_newer_completed_replace_supersedes_older_retry(db):
    from app.models.weekly_upload_receipt import WeeklyUploadReceipt
    older = body(ids=("older",))
    jid = jobs.enqueue_upload(db, "a", "older-upload", older).id
    db.commit()
    lease = jobs.claim(db, "a", "old-worker")
    db.commit()
    jobs.fail(db, lease, "timeout")
    db.commit()
    replacement = body(ids=("newer",))
    replacement.replace = True
    newer_id = jobs.enqueue_upload(db, "a", "newer-upload", replacement).id
    db.get(Job, ("a", jid)).run_after = datetime.now(timezone.utc) + timedelta(hours=1)
    db.get(Upload, ("a", "older-upload")).imported_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()
    worker = Worker(sessionmaker(bind=db.get_bind()))
    assert worker.run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", newer_id)).status == "succeeded"
    db.get(Job, ("a", jid)).run_after = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert worker.run_once("a")
    db.expire_all()
    older_job = db.get(Job, ("a", jid))
    assert older_job.status == "failed"
    assert older_job.last_error_category == "upload_superseded"
    assert db.get(WeeklyUploadReceipt, ("a", "older-upload")) is None
    assert db.get(Upload, ("a", "newer-upload")).active
    assert db.get(WeeklyUploadReceipt, ("a", "newer-upload")) is not None


def test_rejected_classification_falls_back_and_continues(db, monkeypatch):
    import json
    from pathlib import Path
    from app.ai.gateway import parse_classification
    from app.models.signal_prediction import SignalPrediction as Prediction
    row = next(r for r in json.loads((Path(__file__).parent / "fixtures/cb11-gateway-parity.json").read_text()) if r["id"] == "val-upsell-15")
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    monkeypatch.setattr("app.worker.time.sleep", lambda _: None)
    get_settings.cache_clear()
    configure(db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
    configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL); db.commit()
    b = body(ids=("fixture", "after"))
    b.conversations[0].messages = [type(b.conversations[0].messages[0])(
        message_id=f"fixture-{i}", role=m["role"], content=m["content"], timestamp="2026-10-14T00:00:00Z"
    ) for i, m in enumerate(row["messages"])]
    jid = jobs.enqueue_upload(db, "a", "u1", b).id; db.commit()
    calls = []
    def call(*_):
        calls.append(1)
        return parse_classification(row["replay"]), {"status": "succeeded", "usage": {}}
    assert Worker(sessionmaker(bind=db.get_bind()), call=call).run_once("a")
    db.expire_all()
    assert db.get(Job, ("a", jid)).status == "succeeded"
    assert len(calls) == 2
    assert db.get(DetectionRun, ("a", jid, "after")) is not None
    prediction = db.scalar(select(Prediction).where(Prediction.conversation_id == "fixture"))
    assert prediction.signal_type == row["heuristic"][0]["signal_type"]
    assert len(db.scalars(select(InferenceAttempt)).all()) == 2


def test_completed_job_reports_only_its_persisted_signal_count(api):
    client, factory = api
    a = add_member(factory, "count-a@example.test", "a", "reviewer")
    b = add_member(factory, "count-b@example.test", "b", "reviewer")
    response = client.put("/v1/tenants/a/jobs/uploads/count-a", json=body().model_dump(mode="json"), headers=actor_headers(a, "a"))
    assert response.status_code == 202
    jid = response.json()["job_id"]
    path = f"/v1/tenants/a/jobs/{jid}"
    assert client.get(path, headers=actor_headers(a, "a")).json()["signal_count"] is None
    assert Worker(factory).run_once("a")
    done = client.get(path, headers=actor_headers(a, "a"))
    assert done.status_code == 200
    assert done.json()["signal_count"] == 1
    assert client.get(path, headers=actor_headers(b, "b")).status_code == 404
