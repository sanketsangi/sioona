from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import Base
from app.services.inference_budget import configure, reserve, settle, BudgetDenied, budget_day

@pytest.fixture
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_unconfigured_and_disabled_fail_closed(db):
    with pytest.raises(BudgetDenied, match="unconfigured"):
        reserve(db, "t", "a", "r", "groq", "model")
    configure(db, "t", 2, 1, False, "paused", "admin")
    with pytest.raises(BudgetDenied, match="paused"):
        reserve(db, "t", "a", "r", "groq", "model")


def test_retries_run_daily_limits_and_idempotent_settlement(db):
    configure(db, "t", 2, 1, True, "", "admin")
    reserve(db, "t", "a", "r", "groq", "model")
    with pytest.raises(BudgetDenied, match="already_authorized"):
        reserve(db, "t", "a", "r", "groq", "model")
    settle(db, "t", "a")
    settle(db, "t", "a")
    with pytest.raises(BudgetDenied, match="run_limit"):
        reserve(db, "t", "b", "r", "groq", "model")
    reserve(db, "t", "b", "r2", "groq", "fallback")
    with pytest.raises(BudgetDenied, match="daily_limit"):
        reserve(db, "t", "c", "r3", "groq", "model")


def test_ist_midnight():
    assert str(budget_day(datetime(2026, 10, 9, 18, 29, tzinfo=timezone.utc))) == "2026-10-09"
    assert str(budget_day(datetime(2026, 10, 9, 18, 30, tzinfo=timezone.utc))) == "2026-10-10"

pytest_plugins = ["tests.actor_support"]

def test_verified_admin_config_and_principal_pending_accounting(api):
    from tests.actor_support import actor_headers, add_member
    from app.models.inference_attempt import InferenceAttempt
    client, factory = api
    admin = actor_headers(add_member(factory, "admin@example.test", "tenant_a", "admin"), "tenant_a")
    reviewer = actor_headers(add_member(factory, "reviewer@example.test", "tenant_a", "reviewer"), "tenant_a")
    config = {"enabled": True, "daily_attempt_limit": 2, "run_attempt_limit": 1}
    path = "/v1/tenants/tenant_a/inference-controls"
    assert client.put(path, headers=reviewer, json=config).status_code == 403
    principal = actor_headers("principal:live-ingest", "tenant_a")
    assert client.put(path, headers=principal, json=config).status_code == 403
    assert client.put(path, headers=admin, json=config).status_code == 200
    payload = {"attempt_id": "a", "run_id": "r", "provider": "groq", "model": "qwen", "logical_operation_id": "op", "attempt_ordinal": 1, "route_version": "route", "prompt_version": "prompt"}
    reserve_path = "/v1/tenants/tenant_a/inference-reservations"
    assert client.post(reserve_path, headers=principal, json=payload).status_code == 200
    assert client.post(reserve_path, headers=principal, json=payload).status_code == 409
    with factory() as db:
        row = db.scalar(__import__('sqlalchemy').select(InferenceAttempt))
        assert row.status == "pending" and row.input_tokens is None and row.usage_status == "unknown"
    assert client.post(reserve_path.replace("tenant_a", "tenant_b"), headers=principal, json=payload).status_code == 404
    assert client.put(path, headers=admin, json={**config, "enabled": False}).status_code == 200
    assert client.post(reserve_path, headers=principal, json={**payload, "attempt_id": "b", "run_id": "r2"}).status_code == 409


def test_global_pause_and_usd_readiness(db):
    from app.services.inference_budget import estimate_reservation
    configure(db, "t", 2, 1, True, "", "admin")
    configure(db, "global", 1, 1, False, "paused", "admin")
    with pytest.raises(BudgetDenied, match="paused"):
        reserve(db, "t", "a", "r", "groq", "model")
    with pytest.raises(BudgetDenied, match="usd_not_ready"):
        estimate_reservation("groq", "unknown-model", 10, None, False)


def test_control_rows_keep_explicit_tenant_identity(db):
    row = configure(db, "t", 2, 1, True, "", "admin")
    assert row.tenant_id == "t"
    global_row = configure(db, "global", 1, 1, True, "", "admin")
    assert global_row.tenant_id is None
