from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import uuid

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
