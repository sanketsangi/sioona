"""CB-06 inference attempt ledger: idempotency, privacy, and aggregates."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import inspect

from app.models.inference_attempt import InferenceAttempt

pytest_plugins = ["tests.actor_support"]


def _attempt(
    *,
    attempt_id: str,
    tenant_id: str = "tenant_a",
    status: str = "succeeded",
    usage_status: str = "reported",
    input_tokens: int | None = 10,
    output_tokens: int | None = 4,
    detection_run_id: str | None = "run_abc",
    ordinal: int = 1,
    started_at: str = "2026-10-08T10:00:00Z",
    finished_at: str | None = "2026-10-08T10:00:01Z",
) -> dict:
    body = {
        "attempt_id": attempt_id,
        "logical_operation_id": "op_1",
        "attempt_ordinal": ordinal,
        "tenant_id": tenant_id,
        "conversation_id": "conv_1",
        "detection_run_id": detection_run_id,
        "stage": "detect",
        "route_version": "detect:primary:qwen|off",
        "provider": "groq",
        "model": "qwen/qwen3.8-27b",
        "prompt_version": "final-intent-v2",
        "status": status,
        "usage_status": usage_status,
        "started_at": started_at,
        "latency_ms": 1000,
    }
    if finished_at is not None:
        body["finished_at"] = finished_at
    if usage_status == "reported":
        body["input_tokens"] = input_tokens
        body["cached_input_tokens"] = 0
        body["output_tokens"] = output_tokens
        body["reasoning_tokens"] = 0
    elif usage_status == "unknown":
        pass
    return body


def test_batch_is_idempotent_and_rejects_finalized_to_pending(api) -> None:
    client, factory = api
    from tests.actor_support import actor_headers, add_member

    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    headers = actor_headers(sub, "tenant_a")
    path = "/v1/tenants/tenant_a/inference-attempts"
    first = client.post(path, headers=headers, json={"attempts": [_attempt(attempt_id="att_1")]})
    assert first.status_code == 200, first.text
    assert first.json()["inserted"] == 1
    assert first.json()["unchanged"] == 0

    replay = client.post(path, headers=headers, json={"attempts": [_attempt(attempt_id="att_1")]})
    assert replay.status_code == 200, replay.text
    assert replay.json()["inserted"] == 0
    assert replay.json()["unchanged"] == 1

    pending = client.post(
        path,
        headers=headers,
        json={
            "attempts": [
                _attempt(
                    attempt_id="att_1",
                    status="pending",
                    usage_status="unknown",
                    finished_at=None,
                )
            ]
        },
    )
    assert pending.status_code == 409
    assert pending.json()["detail"] == "finalized_cannot_revert_to_pending"


def test_three_billable_attempts_persist_and_aggregate(api) -> None:
    client, factory = api
    from tests.actor_support import actor_headers, add_member

    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    headers = actor_headers(sub, "tenant_a")
    attempts = [
        _attempt(attempt_id="att_a", ordinal=1, input_tokens=10, output_tokens=2),
        _attempt(attempt_id="att_b", ordinal=2, input_tokens=20, output_tokens=3),
        _attempt(
            attempt_id="att_c",
            ordinal=3,
            status="timeout",
            usage_status="unknown",
            finished_at="2026-10-08T10:00:05Z",
        ),
    ]
    posted = client.post(
        "/v1/tenants/tenant_a/inference-attempts",
        headers=headers,
        json={"attempts": attempts},
    )
    assert posted.status_code == 200, posted.text
    assert posted.json()["accepted"] == 3
    assert posted.json()["inserted"] == 3

    usage = client.get(
        "/v1/tenants/tenant_a/inference-usage",
        headers=headers,
        params={
            "from": "2026-10-08T00:00:00Z",
            "to": "2026-10-09T00:00:00Z",
            "group_by": "run",
        },
    )
    assert usage.status_code == 200, usage.text
    buckets = usage.json()["buckets"]
    assert len(buckets) == 1
    bucket = buckets[0]
    assert bucket["key"] == "run_abc"
    assert bucket["attempts"] == 3
    assert bucket["succeeded"] == 2
    assert bucket["timeout"] == 1
    assert bucket["reported_input_tokens"] == 30
    assert bucket["reported_output_tokens"] == 5
    assert bucket["unknown_usage_count"] == 1
    # Empty RATES table → every cost unknown, never zero-filled.
    assert bucket["estimated_cost_usd"] is None
    assert bucket["unknown_cost_count"] == 3

    run = client.get(
        "/v1/tenants/tenant_a/detection-runs/run_abc/inference",
        headers=headers,
    )
    assert run.status_code == 200, run.text
    body = run.json()
    assert body["attempts"] == 3
    assert body["reported_input_tokens"] == 30
    assert {row["attempt_id"] for row in body["rows"]} == {"att_a", "att_b", "att_c"}
    # Privacy: response never includes prompt/transcript fields.
    for row in body["rows"]:
        assert "prompt" not in row
        assert "transcript" not in row
        assert "content" not in row
        assert "quote" not in row


def test_cross_tenant_row_rejects_whole_batch(api) -> None:
    client, factory = api
    from tests.actor_support import actor_headers, add_member

    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    headers = actor_headers(sub, "tenant_a")
    response = client.post(
        "/v1/tenants/tenant_a/inference-attempts",
        headers=headers,
        json={
            "attempts": [
                _attempt(attempt_id="att_ok"),
                _attempt(attempt_id="att_bad", tenant_id="tenant_b"),
            ]
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "cross_tenant_attempt"

    usage = client.get(
        "/v1/tenants/tenant_a/inference-usage",
        headers=headers,
        params={
            "from": "2026-10-08T00:00:00Z",
            "to": "2026-10-09T00:00:00Z",
            "group_by": "day",
        },
    )
    assert usage.status_code == 200
    assert usage.json()["buckets"] == []


def test_preflight_ok_and_wipe_clears_ledger(api) -> None:
    client, factory = api
    from tests.actor_support import actor_headers, add_member

    sub = add_member(factory, "admin@example.test", "tenant_a", "admin")
    headers = {**actor_headers(sub, "tenant_a"), "X-Sioona-Role": "admin"}
    ready = client.get(
        "/v1/tenants/tenant_a/inference-attempts/preflight",
        headers=headers,
    )
    assert ready.status_code == 200
    assert ready.json() == {"ok": True}

    posted = client.post(
        "/v1/tenants/tenant_a/inference-attempts",
        headers=headers,
        json={"attempts": [_attempt(attempt_id="att_wipe")]},
    )
    assert posted.status_code == 200

    wiped = client.delete("/v1/tenants/tenant_a/data", headers=headers)
    assert wiped.status_code == 200
    assert wiped.json()["inference_attempts"] == 1

    usage = client.get(
        "/v1/tenants/tenant_a/inference-usage",
        headers=headers,
        params={
            "from": "2026-10-08T00:00:00Z",
            "to": "2026-10-09T00:00:00Z",
            "group_by": "day",
        },
    )
    assert usage.status_code == 200
    assert usage.json()["buckets"] == []


def test_ledger_model_has_no_text_columns() -> None:
    columns = {column.name for column in inspect(InferenceAttempt).columns}
    forbidden = {
        "prompt",
        "transcript",
        "content",
        "quote",
        "message",
        "body",
        "evidence",
        "summary",
    }
    assert columns.isdisjoint(forbidden)
    assert "attempt_id" in columns
    assert "usage_status" in columns
    assert "cost_status" in columns
