from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import uuid
import pytest

from app.models.conversation import Conversation
from app.models.detection_run import DetectionRun
from app.models.inference_attempt import InferenceAttempt
from app.models.job import Job
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.models.upload import Upload
from app.services.economics_dashboard import build_economics_dashboard
from tests.actor_support import actor_headers, add_member

pytest_plugins = ["tests.actor_support"]

NOW = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def _attempt(tenant: str, key: str, *, ordinal: int, latency: int, cost: str | None, usage: str = "reported", status: str = "succeeded", http_status: int | None = None, started_at: datetime | None = None) -> InferenceAttempt:
    return InferenceAttempt(
        tenant_id=tenant, attempt_id=key, logical_operation_id=f"op-{key}",
        attempt_ordinal=ordinal, conversation_id=f"chat-{key}", detection_run_id=f"run-{key}",
        stage="detect", route_version="route-v1", provider="fixture", model="fixture-model",
        prompt_version="fixture-prompt", status=status, http_status=http_status,
        usage_status=usage, input_tokens=None if usage == "unknown" else 100,
        cached_input_tokens=None if usage == "unknown" else 20,
        output_tokens=None if usage == "unknown" else 10, latency_ms=latency,
        started_at=started_at or NOW - timedelta(hours=1),
        estimated_cost_usd=Decimal(cost) if cost is not None else None,
        cost_status="estimated" if cost is not None else "unknown",
    )


def _seed(db, tenant: str, *, multiplier: int = 1) -> None:
    upload_id = f"upload-{tenant}"
    db.add(Upload(tenant_id=tenant, upload_id=upload_id, source="fixture.csv", content_sha256="a" * 64, status="completed", imported_at=NOW - timedelta(hours=3)))
    db.flush()
    db.add(Job(tenant_id=tenant, id=f"job-{tenant}", job_type="upload", upload_id=upload_id, conversation_ids_sha256="b" * 64, conversation_count=2 * multiplier, config_sha256="c" * 64, status="succeeded", attempt_count=2, max_attempts=3, cursor=2 * multiplier, created_at=NOW - timedelta(hours=3), updated_at=NOW - timedelta(hours=2)))
    for index in range(2 * multiplier):
        db.add(Conversation(tenant_id=tenant, conversation_id=f"chat-{tenant}-{index}", channel="upload", started_at=NOW - timedelta(hours=3)))
    db.flush()
    for index in range(2 * multiplier):
        db.add(DetectionRun(tenant_id=tenant, run_id=f"run-{tenant}-{index}", conversation_id=f"chat-{tenant}-{index}", content_hash="d" * 64, model_version="m", prompt_version="p", status="complete", output=[], created_at=NOW - timedelta(hours=2)))
    prediction = SignalPrediction(id=uuid.uuid4(), tenant_id=tenant, conversation_id=f"chat-{tenant}-0", detection_run_id=f"run-{tenant}-0", signal_type="lead", confidence=.8, summary="fixture only", evidence_status="valid", acted=True, outcome="converted", outcome_value_inr=500 * multiplier, outcome_recorded_at=NOW - timedelta(minutes=10), created_at=NOW - timedelta(hours=1))
    db.add(prediction)
    db.flush()
    db.add(SignalFeedback(tenant_id=tenant, signal_id=prediction.id, feedback="correct", reviewed_by="fixture", reviewed_at=NOW - timedelta(minutes=30)))
    db.add_all([
        _attempt(tenant, f"{tenant}-1", ordinal=1, latency=100, cost=str(Decimal("0.02") * multiplier)),
        _attempt(tenant, f"{tenant}-2", ordinal=2, latency=300, cost=None, usage="unknown", status="timeout", http_status=429),
    ])
    db.flush()
    for attempt in db.query(InferenceAttempt).filter_by(tenant_id=tenant):
        attempt.detection_run_id = f"run-{tenant}-0"
    db.commit()


def test_dashboard_reconciles_counts_percentiles_unknowns_and_projections(db) -> None:
    _seed(db, "tenant_a")
    result = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW - timedelta(days=1), to_ts=NOW + timedelta(minutes=1), now=NOW)
    assert result.funnel.model_dump(exclude={"definitions", "denominators"}) == {
        "ingested": 2, "processed": 2, "surfaced": 1, "reviewed": 1,
        "correct": 1, "acted": 1, "positive_outcomes": 1,
        "influenced_value_inr": Decimal("500"),
    }
    assert result.funnel.denominators == {
        "ingested": None, "processed": 2, "surfaced": 2, "reviewed": 1,
        "correct": 1, "acted": 1, "positive_outcomes": 1,
        "influenced_value_inr": 1,
    }
    assert result.quality.signal_score == 1
    assert result.quality.abstained == 1
    assert result.reliability.p50_latency_ms == 200
    assert result.reliability.p95_latency_ms == 290
    assert result.reliability.retry_or_fallback_attempts == 1
    assert result.economics.input_tokens == 100
    assert result.economics.unknown_usage_rate == .5
    assert result.economics.known_cost_coverage == .5
    assert result.economics.cost_per_processed_conversation_usd == Decimal("0.01000000")
    assert result.economics.projections[0].estimated_cost_usd == Decimal("100.00000000")
    assert result.economics.projections[0].incomplete is True
    serialized = json.dumps(result.model_dump(mode="json")).lower()
    assert "fixture only" not in serialized
    assert all(token not in serialized for token in ("summary", "transcript", "source_text", "quote"))


def test_dashboard_is_tenant_scoped_and_zero_denominators_are_unavailable(db) -> None:
    _seed(db, "tenant_a")
    _seed(db, "tenant_b", multiplier=3)
    a = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW - timedelta(days=1), to_ts=NOW + timedelta(minutes=1), now=NOW)
    empty = build_economics_dashboard(db, tenant_id="missing", from_ts=NOW - timedelta(days=1), to_ts=NOW, now=NOW)
    assert a.funnel.ingested == 2
    assert a.funnel.influenced_value_inr == 500
    assert empty.quality.signal_score is None
    assert empty.economics.cost_per_processed_conversation_usd is None
    assert all(item.status == "unavailable" for item in empty.economics.projections)


def test_economics_route_requires_admin_membership(api) -> None:
    client, factory = api
    reviewer = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    denied = client.get("/v1/tenants/tenant_a/economics-dashboard", headers=actor_headers(reviewer, "tenant_a"))
    assert denied.status_code == 403
    admin = add_member(factory, "admin@example.test", "tenant_a", "admin")
    allowed = client.get("/v1/tenants/tenant_a/economics-dashboard", headers=actor_headers(admin, "tenant_a"))
    assert allowed.status_code == 200
    assert allowed.json()["tenant_id"] == "tenant_a"


def test_economics_route_rejects_cross_tenant_actor(api) -> None:
    client, factory = api
    admin_b = add_member(factory, "b@example.test", "tenant_b", "admin")
    response = client.get("/v1/tenants/tenant_a/economics-dashboard", headers=actor_headers(admin_b, "tenant_b"))
    assert response.status_code in {403, 404}


def test_superseded_prediction_is_not_abstention(db):
    _seed(db, "tenant_a")
    prediction = db.query(SignalPrediction).one()
    prediction.active = False
    db.commit()
    result = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW - timedelta(days=1), to_ts=NOW, now=NOW)
    assert result.funnel.surfaced == 0
    assert result.quality.abstained == 1


def test_all_unknown_costs_do_not_project_zero(db):
    _seed(db, "tenant_a")
    for attempt in db.query(InferenceAttempt).all():
        attempt.estimated_cost_usd = None
        attempt.cost_status = "unknown"
    db.commit()
    result = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW - timedelta(days=1), to_ts=NOW, now=NOW)
    assert result.economics.unknown_cost_rate == 1
    assert result.economics.cost_per_processed_conversation_usd is None
    assert all(p.status == "unavailable" and p.estimated_cost_usd is None and p.incomplete for p in result.economics.projections)


def test_dashboard_selects_only_text_free_columns_and_half_open_window(db):
    from sqlalchemy import event
    _seed(db, "tenant_a")
    statements = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lower())
    event.listen(db.get_bind(), "before_cursor_execute", capture)
    try:
        result = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW - timedelta(hours=1), to_ts=NOW, now=NOW)
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", capture)
    assert result.economics.attempts == 2  # Inclusive lower boundary.
    assert result.funnel.processed == 0
    excluded = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW - timedelta(hours=2), to_ts=NOW - timedelta(hours=1), now=NOW)
    assert excluded.economics.attempts == 0  # Exclusive upper boundary.
    assert statements and all("tenant_id" in sql for sql in statements)
    for sql in statements:
        for field in ("summary", "evidence_quote", "output_json", "notes", "last_error_message", "messages", "transcript"):
            assert field not in sql


@pytest.mark.parametrize("mode", ["off", "shadow", "enforce"])
def test_dashboard_always_requires_verified_admin(api, monkeypatch, mode):
    from app.config import get_settings
    client, factory = api
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", mode)
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "test-service-token")
    get_settings.cache_clear()
    headers = {"Authorization": "Bearer test-service-token", "X-Tenant-Id": "tenant_a", "X-Sioona-Role": "admin"}
    url = "/v1/tenants/tenant_a/economics-dashboard"
    for actor in [None, "invalid", *[
        actor_headers(add_member(factory, email, "tenant_a", role, revoked=revoked), "tenant_a")["X-Sioona-Actor"]
        for email, role, revoked in [("review@test.example", "reviewer", False), ("revoked@test.example", "admin", True)]
    ]]:
        response = client.get(url, headers={**headers, **({"X-Sioona-Actor": actor} if actor else {})})
        assert response.status_code in {401, 403, 404}
        assert "economics" not in response.json()
    admin = add_member(factory, "valid@test.example", "tenant_a", "admin")
    assert client.get(url, headers={**headers, **actor_headers(admin, "tenant_a")}).status_code == 200


def test_review_window_includes_old_and_superseded_predictions(db):
    _seed(db, "tenant_a")
    prediction = db.query(SignalPrediction).one()
    prediction.created_at = NOW - timedelta(days=10)
    prediction.active = False
    db.commit()
    result = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW)
    assert result.quality.reviewed == result.quality.correct == 1
    assert result.quality.by_signal_type[0].acceptance_rate == 1


def test_cohort_costs_exclude_unrelated_spend_and_preserve_reconciled(db):
    _seed(db, "tenant_a")
    good = _attempt("tenant_a", "reconciled", ordinal=1, latency=20, cost="0.03")
    good.cost_status = "reconciled"
    good.detection_run_id = "run-tenant_a-0"
    # Receipt outside the attempt window still belongs to the completed run cohort.
    good.started_at = NOW - timedelta(days=2)
    db.add(good)
    for key, stage, run in [("report", "report", "run-tenant_a-0"), ("draft", "action_draft", "run-tenant_a-0"), ("unfinished", "detect", "uncompleted"), ("old", "verify", "old-run")]:
        a = _attempt("tenant_a", key, ordinal=1, latency=20, cost="10")
        a.stage, a.detection_run_id = stage, run
        db.add(a)
    db.add(DetectionRun(tenant_id="tenant_a", run_id="old-run", conversation_id="chat-tenant_a-0", content_hash="e"*64, model_version="m", prompt_version="p", status="complete", output=[], created_at=NOW-timedelta(days=2)))
    db.commit()
    r = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW)
    assert r.economics.known_cost_usd == Decimal("40.02")
    assert r.economics.cost_per_processed_conversation_usd == Decimal("0.025")
    assert r.economics.cost_per_correct_signal_usd == Decimal("0.05")
    assert [p.estimated_cost_usd for p in r.economics.projections] == [Decimal("250"), Decimal("1250"), Decimal("2500")]


def test_all_unknown_unit_costs(db):
    _seed(db, "tenant_a")
    for a in db.query(InferenceAttempt):
        a.cost_status, a.estimated_cost_usd = "unknown", None
    db.commit()
    e = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW).economics
    assert all(getattr(e, field) is None for field in ["cost_per_processed_conversation_usd", "cost_per_surfaced_signal_usd", "cost_per_correct_signal_usd", "cost_per_acted_signal_usd"])


def test_live_backlog_ignores_window(db):
    _seed(db, "tenant_a")
    j = db.query(Job).one()
    j.status, j.created_at = "queued", NOW-timedelta(days=40)
    a = db.query(InferenceAttempt).first()
    a.status, a.started_at = "pending", NOW-timedelta(days=40)
    db.commit()
    r = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW, now=NOW)
    assert r.reliability.queue_depth == r.reliability.unfinished_attempts == 1
    assert r.reliability.oldest_queue_age_seconds == 40*86400
    alerts = {a.key: a.status for a in r.alerts}
    assert alerts["queue_age"] == alerts["unfinished_attempts"] == "alert"


def test_job_processing_latency_uses_durable_completion(db):
    _seed(db, "tenant_a")
    j = db.query(Job).one()
    j.updated_at = j.created_at + timedelta(seconds=10)
    db.commit()
    r = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW)
    assert r.reliability.p50_processing_latency_ms == 10000
    assert r.reliability.p95_processing_latency_ms == 10000


def test_spend_anomaly_counts_distinct_daily_conversations(db):
    _seed(db, "tenant_a")
    for day in range(4):
        for repeat in range(3 if day == 3 else 1):
            run_key = f"daily-{day}-{repeat}"
            stamp = NOW-timedelta(days=4-day)
            db.add(DetectionRun(tenant_id="tenant_a", run_id=run_key, conversation_id="chat-tenant_a-0", content_hash="f"*64, model_version="m", prompt_version="p", status="complete", output=[], created_at=stamp))
            a = _attempt("tenant_a", run_key, ordinal=1, latency=10, cost="1", started_at=stamp)
            a.detection_run_id = run_key
            db.add(a)
    db.commit()
    r = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=5), to_ts=NOW-timedelta(hours=12))
    assert next(a for a in r.alerts if a.key == "spend_anomaly").status == "alert"


def test_canonical_telemetry_drift_and_window(db):
    from app.models.inference_budget import InferenceBudget, InferenceReservation
    from app.services.operational_telemetry import record_sample
    _seed(db, "tenant_a")
    day = NOW.date()
    for tenant, reserved in [("tenant_a", "3"), ("tenant_b", "900")]:
        db.add(InferenceBudget(tenant_id=tenant, budget_day=day, attempts=2, reserved_usd=Decimal(reserved), spent_usd=0))
        db.add(InferenceReservation(tenant_id=tenant, attempt_id="active", run_id="run", budget_day=day, status="authorized", reserved_usd=Decimal("1")))
        db.add(InferenceReservation(tenant_id=tenant, attempt_id="done", run_id="run", budget_day=day, status="settled", reserved_usd=Decimal("50")))
        record_sample(db, tenant, "ledger_flush_failure", sample_id="fail", observed_at=NOW-timedelta(minutes=1))
        record_sample(db, tenant, "database_query", sample_id="fast", duration_ms=10, observed_at=NOW-timedelta(minutes=1))
        record_sample(db, tenant, "database_query", sample_id="slow", duration_ms=110, observed_at=NOW-timedelta(minutes=1))
    # Replay cannot double count; upper boundary excluded.
    record_sample(db, "tenant_a", "ledger_flush_failure", sample_id="fail", observed_at=NOW-timedelta(minutes=1))
    record_sample(db, "tenant_a", "ledger_flush_failure", sample_id="end", observed_at=NOW)
    db.commit()
    r = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW, now=NOW)
    assert r.reliability.ledger_flush_failures.value == 1
    assert r.reliability.reservation_drift.value == Decimal("2")
    assert r.reliability.database_latency.value == 60
    assert r.reliability.database_latency.samples == 2
    assert all(a.owner == "Sanket" for a in r.alerts)
    assert next(a for a in r.alerts if a.key == "reservation_drift").status == "alert"
    empty = build_economics_dashboard(db, tenant_id="empty", from_ts=NOW-timedelta(days=1), to_ts=NOW)
    assert empty.reliability.database_latency.status == "unavailable"
    assert empty.reliability.ledger_flush_failures.value == 0


def test_admin_alert_delivery_tracks_queue_recovery(api):
    """The operator surface delivers an active alert and its cleared state."""
    client, factory = api
    admin = add_member(factory, "op4-alerts@example.test", "tenant_a", "admin")
    headers = actor_headers(admin, "tenant_a")
    with factory() as db:
        _seed(db, "tenant_a")
        job = db.get(Job, ("tenant_a", "job-tenant_a"))
        job.status = "queued"
        job.created_at = NOW - timedelta(minutes=16)
        job.updated_at = NOW - timedelta(minutes=16)
        db.commit()

    response = client.get("/v1/tenants/tenant_a/economics-dashboard", headers=headers)
    assert response.status_code == 200
    delivered = {item["key"]: item for item in response.json()["alerts"]}
    assert delivered["queue_age"]["status"] == "alert"
    assert delivered["queue_age"]["owner"] == "Sanket"
    assert delivered["queue_age"]["runbook"]

    with factory() as db:
        job = db.get(Job, ("tenant_a", "job-tenant_a"))
        job.status = "succeeded"
        job.updated_at = NOW
        db.commit()

    response = client.get("/v1/tenants/tenant_a/economics-dashboard", headers=headers)
    assert response.status_code == 200
    cleared = {item["key"]: item for item in response.json()["alerts"]}
    assert cleared["queue_age"]["status"] == "ok"
    assert cleared["queue_age"]["owner"] == "Sanket"


@pytest.mark.parametrize("mode", ["off", "shadow", "enforce"])
def test_flush_failure_telemetry_is_verified_and_idempotent(api, monkeypatch, mode):
    from app.config import get_settings
    client, factory = api
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", mode)
    get_settings.cache_clear()
    path = "/v1/tenants/tenant_a/inference-attempts/flush-failure"
    payload = {"sample_id": "failure-1"}
    assert client.post(path, headers={"X-Tenant-Id":"tenant_a", "X-Sioona-Role":"admin"}, json=payload).status_code in {401,403}
    user = add_member(factory, "metrics@example.test", "tenant_a", "reviewer")
    headers = actor_headers(user, "tenant_a")
    assert client.post(path, headers=headers, json=payload).status_code == 200
    assert client.post(path, headers=headers, json=payload).status_code == 200
    assert client.post(path.replace("tenant_a", "tenant_b"), headers=headers, json=payload).status_code in {403,404}
    with factory() as db:
        from app.models.operational_telemetry import OperationalSample
        assert db.query(OperationalSample).filter_by(kind="ledger_flush_failure").count() == 1


def test_connector_state_counts_without_payload_text(db):
    from app.models.live_ingest import LiveInstallation, LiveEvent
    from app.models.supervised_action import SupervisedActionDecision, ActionProposal, ActionExecution
    for tenant in ("tenant_a", "tenant_b"):
        db.add(LiveInstallation(tenant_id=tenant, id="i", workspace_id=tenant, consent_reference="fixture", monitoring_reference="fixture"))
        decision = SupervisedActionDecision(tenant_id=tenant, conversation_id="c", action_type="retention_email_draft", status="approved", subject="private", body="private")
        db.add(decision); db.flush()
        for n, state in enumerate(("failed", "unknown", "succeeded")):
            proposal = ActionProposal(tenant_id=tenant, decision_id=decision.id, action_version=n+1, target="123", payload_json={"body":"private"}, payload_sha256="a"*64, state="proposed", created_at=NOW-timedelta(minutes=1))
            db.add(proposal); db.flush()
            db.add(ActionExecution(tenant_id=tenant, proposal_id=proposal.id, payload_sha256="a"*64, target="123", actor_id=str(uuid.uuid4()), action_version=n+1, expires_at=NOW, state=state, created_at=NOW-timedelta(minutes=1)))
        for n, (state, stamp) in enumerate((("dead_lettered",NOW-timedelta(minutes=1)), ("succeeded",NOW-timedelta(minutes=1)), ("dead_lettered",NOW))):
            db.add(LiveEvent(tenant_id=tenant, installation_id="i", event_id=str(n), source_id="s", source_version=n, occurred_at=stamp, payload_sha256="a"*64, kind="unresolved", state=state, payload={"private":"secret"}, received_at=stamp))
    db.commit()
    r = build_economics_dashboard(db, tenant_id="tenant_a", from_ts=NOW-timedelta(days=1), to_ts=NOW)
    assert r.reliability.connector_errors.value == 3
    assert "private" not in r.model_dump_json()


def test_preflight_persists_real_query_timing(db):
    from app.services.inference_ledger import ledger_is_reachable
    from app.models.operational_telemetry import OperationalSample
    assert ledger_is_reachable(db, 'tenant_a')
    sample = db.query(OperationalSample).one()
    assert sample.tenant_id == 'tenant_a' and sample.kind == 'database_query'
    assert sample.duration_ms >= 0


def test_drift_does_not_cancel_between_days_or_hide_missing_budget(db):
    from app.models.inference_budget import InferenceBudget, InferenceReservation
    db.add(InferenceBudget(tenant_id='a', budget_day=NOW.date(), attempts=1, reserved_usd=2, spent_usd=0))
    db.add(InferenceReservation(tenant_id='a', attempt_id='r', run_id='r', budget_day=(NOW-timedelta(days=1)).date(), status='authorized', reserved_usd=2))
    db.commit()
    r = build_economics_dashboard(db, tenant_id='a', from_ts=NOW-timedelta(days=1), to_ts=NOW)
    assert r.reliability.reservation_drift.value == 4


@pytest.mark.parametrize("mode", ["off", "shadow", "enforce"])
def test_instrumented_preflight_requires_verified_actor(api, monkeypatch, mode):
    from app.config import get_settings
    client, factory = api
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", mode)
    get_settings.cache_clear()
    url = "/v1/tenants/tenant_a/inference-attempts/preflight"
    assert client.get(url, headers={"X-Tenant-Id":"tenant_a"}).status_code in {401,403}
    sub = add_member(factory, "probe@example.test", "tenant_a", "reviewer")
    assert client.get(url, headers=actor_headers(sub, "tenant_a")).status_code == 200
    with factory() as db:
        from app.models.operational_telemetry import OperationalSample
        assert db.query(OperationalSample).count() == 1
