"""Ledger idempotency, fail-closed batches, and aggregate-only reads."""

from datetime import datetime, timezone

from app.models.inference_attempt import LEDGER_COLUMNS
from app.services.inference_ledger import RUN_ROLLUP_SQL, assert_no_text_columns

HEADERS = {"X-Tenant-Id": "tenant_a"}
STARTED = "2026-10-08T01:00:00Z"


def _attempt(attempt_id: str, **overrides):
    body = {
        "attempt_id": attempt_id,
        "logical_operation_id": "operation-1",
        "attempt_ordinal": 1,
        "conversation_id": "conv_1",
        "detection_run_id": "run-1",
        "stage": "detect",
        "route_version": "detect:primary:test|off",
        "provider": "groq",
        "model": "qwen/qwen3.8-27b",
        "prompt_version": "taxonomy-v1",
        "status": "succeeded",
        "usage_status": "reported",
        "input_tokens": 10,
        "output_tokens": 4,
        "latency_ms": 20,
        "started_at": STARTED,
        "finished_at": "2026-10-08T01:00:01Z",
    }
    body.update(overrides)
    return body


def _post(client, attempts, tenant="tenant_a"):
    return client.post(
        f"/v1/tenants/{tenant}/inference-attempts",
        headers={"X-Tenant-Id": tenant},
        json={"attempts": attempts},
    )


def test_ledger_columns_store_no_prompt_or_transcript() -> None:
    assert_no_text_columns()
    assert LEDGER_COLUMNS == {
        "id", "tenant_id", "attempt_id", "logical_operation_id", "attempt_ordinal",
        "conversation_id", "detection_run_id", "job_id", "stage", "route_version",
        "provider", "model", "prompt_version", "status", "error_category", "http_status",
        "provider_request_id", "usage_status", "input_tokens", "cached_input_tokens",
        "output_tokens", "reasoning_tokens", "latency_ms", "started_at", "finished_at",
        "rate_version", "estimated_cost_usd", "cost_status", "created_at",
    }
    assert "FILTER" in RUN_ROLLUP_SQL
    assert "detection_run_id = :run_id" in RUN_ROLLUP_SQL


def test_replay_is_idempotent_and_finalized_pending_is_rejected(client) -> None:
    first = _post(client, [_attempt("a1", input_tokens=10)])
    assert first.status_code == 200, first.text
    assert first.json() == {"inserted": 1, "replayed": 0}
    replay = _post(client, [_attempt("a1", input_tokens=99)])
    assert replay.status_code == 200, replay.text
    assert replay.json() == {"inserted": 0, "replayed": 1}
    listed = client.get(
        "/v1/tenants/tenant_a/detection-runs/run-1/inference",
        headers=HEADERS,
    )
    assert listed.status_code == 200, listed.text
    group = listed.json()["groups"][0]
    assert group["attempts"] == 1
    assert group["input_tokens"] == 10
    demote = _post(client, [_attempt("a1", status="pending", usage_status="unknown", input_tokens=None, output_tokens=None)])
    assert demote.status_code == 409
    assert demote.json()["detail"] == "finalized_pending_demotion"
    again = client.get("/v1/tenants/tenant_a/detection-runs/run-1/inference", headers=HEADERS)
    assert again.json()["groups"][0]["input_tokens"] == 10


def test_three_billable_attempts_stay_three_rows_and_unknown_is_not_zero(client) -> None:
    body = [
        _attempt("a1", attempt_ordinal=1),
        _attempt("a2", attempt_ordinal=2, input_tokens=5, output_tokens=1, latency_ms=30),
        _attempt("a3", attempt_ordinal=3, status="timeout", usage_status="unknown",
                 input_tokens=0, output_tokens=0, latency_ms=None, error_category="timeout"),
    ]
    created = _post(client, body)
    assert created.status_code == 200, created.text
    assert created.json() == {"inserted": 3, "replayed": 0}
    listed = client.get("/v1/tenants/tenant_a/detection-runs/run-1/inference", headers=HEADERS)
    assert listed.status_code == 200, listed.text
    payload = listed.json()
    assert payload["tenant_id"] == "tenant_a"
    assert "quote" not in listed.text
    assert "transcript" not in listed.text
    group = payload["groups"][0]
    assert group["attempts"] == 3
    assert group["retries_or_fallbacks"] == 2
    assert group["input_tokens"] == 15
    assert group["output_tokens"] == 5
    assert group["unknown_usage"] == 1
    assert group["unknown_cost"] == 3
    assert group["estimated_cost_usd"] is None
    assert group["total_latency_ms"] == 50
    usage = client.get(
        "/v1/tenants/tenant_a/inference-usage",
        headers=HEADERS,
        params={"group_by": "model", "from": "2026-10-08T00:00:00Z", "to": "2026-10-09T00:00:00Z"},
    )
    assert usage.status_code == 200, usage.text
    assert usage.json()["groups"][0]["attempts"] == 3
    assert usage.json()["groups"][0]["input_tokens"] == 15


def test_cross_tenant_row_rejects_the_whole_batch(client) -> None:
    mixed = _post(client, [
        _attempt("keep-me"),
        _attempt("other", tenant_id="tenant_b"),
    ])
    assert mixed.status_code == 403
    assert mixed.json()["detail"] == "cross_tenant"
    listed = client.get("/v1/tenants/tenant_a/detection-runs/run-1/inference", headers=HEADERS)
    assert listed.json()["groups"] == []
    assert _post(client, [_attempt("same")], tenant="tenant_b").status_code == 200
    hidden = client.get("/v1/tenants/tenant_a/detection-runs/run-1/inference", headers=HEADERS)
    assert hidden.json()["groups"] == []


def test_duplicate_attempt_ids_in_one_batch_do_not_insert(client) -> None:
    response = _post(client, [_attempt("dup"), _attempt("dup", attempt_ordinal=2)])
    assert response.status_code == 422
    assert response.json()["detail"] == "duplicate_attempt_ids"
    listed = client.get("/v1/tenants/tenant_a/inference-usage", headers=HEADERS, params={"group_by": "stage"})
    assert listed.json()["groups"] == []


def test_usage_bounds_are_half_open(client) -> None:
    assert _post(client, [_attempt("late", started_at="2026-10-08T12:00:00Z")]).status_code == 200
    inside = client.get(
        "/v1/tenants/tenant_a/inference-usage",
        headers=HEADERS,
        params={"group_by": "day", "from": "2026-10-08T00:00:00Z", "to": "2026-10-08T12:00:00Z"},
    )
    assert inside.json()["groups"] == []
    day = client.get(
        "/v1/tenants/tenant_a/inference-usage",
        headers=HEADERS,
        params={"group_by": "day", "from": "2026-10-08T00:00:00Z", "to": "2026-10-09T00:00:00Z"},
    )
    assert day.json()["groups"][0]["day"] == "2026-10-08"
    assert day.json()["groups"][0]["attempts"] == 1
    assert datetime.now(timezone.utc)
