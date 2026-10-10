"""Enforce, shadow, and off behavior for the actor gate."""

import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from uuid import UUID

from fastapi.routing import APIRoute

from app.api.actor import ROUTE_GUARDS
from app.config import get_settings
from app.main import app
from app.models.membership import Membership
from tests.actor_support import KEY, MARKER, actor_headers, add_member, api

pytest_plugins = ["tests.actor_support"]
from tests.test_actor_token import sign_like_web


def test_route_guard_covers_every_mounted_route() -> None:
    missing = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            if (method, route.path) == ("GET", "/health"):
                continue
            if (method, route.path) not in ROUTE_GUARDS:
                missing.append((method, route.path))
    assert not missing, missing


def test_off_does_not_require_an_actor_or_log(api, monkeypatch, caplog) -> None:
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "off")
    get_settings.cache_clear()
    client, _factory = api
    with caplog.at_level(logging.INFO, logger="sioona.actor"):
        response = client.get(
            "/v1/tenants/tenant_a/signal-score",
            headers={"X-Tenant-Id": "tenant_a"},
        )
    assert response.status_code == 200
    assert "actor_auth_mismatch" not in caplog.text


def test_shadow_logs_tenant_route_and_reason_without_pii(api, monkeypatch, caplog) -> None:
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "shadow")
    get_settings.cache_clear()
    client, _factory = api
    planted = "TRANSCRIPT-SECRET-do-not-log planted@example.test"
    with caplog.at_level(logging.INFO, logger="sioona.actor"):
        response = client.get(
            "/v1/tenants/tenant_a/signal-score",
            headers={"X-Tenant-Id": "tenant_a", "X-Note": planted},
            params={"q": planted},
        )
    assert response.status_code == 200
    assert "actor_auth_mismatch" in caplog.text
    assert "tenant=tenant_a" in caplog.text
    assert "route=/v1/tenants/{tenant_id}/signal-score" in caplog.text
    assert "reason=missing_actor" in caplog.text
    assert planted not in caplog.text
    assert "X-Sioona-Actor" not in caplog.text


def test_shadow_mismatch_is_visible_with_default_uvicorn_logging() -> None:
    # A fresh interpreter avoids pytest's logging capture/level overrides.
    result = subprocess.run(
        [sys.executable, "-c", """
import uvicorn
from types import SimpleNamespace
from app.api.actor import _observe
uvicorn.Config('app.main:app')
request = SimpleNamespace(scope={'route': SimpleNamespace(path='/v1/tenants/{tenant_id}/signal-score')})
_observe(request, 'tenant_shadow_test', None, None, 'read', None)
"""],
        env={**os.environ, "DATABASE_URL": "sqlite+pysqlite:///:memory:",
             "SIOONA_ACTOR_AUTH": "shadow", "SIOONA_ACTOR_KEY": "synthetic-test-key"},
        capture_output=True, text=True, check=True, timeout=15,
    )
    assert result.stdout == ""
    assert result.stderr.strip() == (
        "actor_auth_mismatch tenant=tenant_shadow_test "
        "route=/v1/tenants/{tenant_id}/signal-score reason=missing_actor"
    )


def test_shadow_admin_retains_legacy_gate_with_production_settings(api, monkeypatch) -> None:
    monkeypatch.setenv("SIOONA_ENV", "production")
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "synthetic-service-token")
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "shadow")
    get_settings.cache_clear()
    client, factory = api
    sub = add_member(factory, "admin@example.test", "tenant_a", "admin")
    headers = {**actor_headers(sub, "tenant_a"), "Authorization": "Bearer synthetic-service-token"}
    denied = client.delete("/v1/tenants/tenant_a/data", headers=headers)
    assert denied.status_code == 403
    assert denied.json()["detail"] == "admin_role_required"
    allowed = client.delete(
        "/v1/tenants/tenant_a/data", headers={**headers, "X-Sioona-Role": "admin"},
    )
    assert allowed.status_code == 200


def test_enforce_rejects_missing_expired_and_wrong_token(api) -> None:
    client, factory = api
    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    path = "/v1/tenants/tenant_a/signal-score"
    missing = client.get(path, headers={"X-Tenant-Id": "tenant_a"})
    assert missing.status_code == 401
    assert missing.json()["detail"] == "actor_required"
    now = int(time.time())
    expired = client.get(
        path,
        headers=actor_headers(sub, "tenant_a", iat=now - 120, exp=now - 30),
    )
    assert expired.status_code == 401
    wrong_aud = client.get(path, headers=actor_headers(sub, "tenant_a", aud="other"))
    wrong_iss = client.get(path, headers=actor_headers(sub, "tenant_a", iss="other"))
    assert wrong_aud.status_code == 401
    assert wrong_iss.status_code == 401
    assert "reviewer@example.test" not in expired.text


def test_forged_header_does_not_select_the_tenant(api) -> None:
    client, factory = api
    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    response = client.get(
        "/v1/tenants/tenant_a/signal-score",
        headers=actor_headers(sub, "tenant_a", header_tenant="tenant_b"),
    )
    assert response.status_code == 200
    assert response.json()["tenant_id"] == "tenant_a"


def test_other_tenant_assertion_is_hidden(api) -> None:
    client, factory = api
    add_member(factory, "a@example.test", "tenant_a", "admin")
    sub_b = add_member(factory, "b@example.test", "tenant_b", "admin")
    created = client.post(
        "/v1/tenants/tenant_a/conversations",
        headers=actor_headers(add_member(factory, "a@example.test", "tenant_a", "admin"), "tenant_a"),
        json={
            "conversation_id": "shared",
            "channel": "upload",
            "started_at": "2026-10-01T00:00:00Z",
            "external_id": "ext-shared",
            "messages": [{
                "message_id": "m1",
                "role": "customer",
                "content": MARKER,
                "timestamp": "2026-10-01T00:00:00Z",
            }],
        },
    )
    assert created.status_code == 201
    denied = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=actor_headers(sub_b, "tenant_b"),
    )
    assert denied.status_code == 404
    assert MARKER not in denied.text


def test_demo_can_read_and_cannot_mutate(api) -> None:
    client, factory = api
    sub = add_member(factory, "demo@sioona.ai", "tenant_demo", "demo")
    read = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers=actor_headers(sub, "tenant_demo"),
    )
    assert read.status_code == 200
    denied = client.post(
        "/v1/tenants/tenant_demo/predictions",
        headers=actor_headers(sub, "tenant_demo"),
        json={
            "conversation_id": "c1",
            "signal_type": "lead",
            "confidence": 0.5,
            "summary": "demo must not write",
        },
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "forbidden"


def test_live_ingest_principal_can_write_conversations_not_wipe(api) -> None:
    client, _factory = api
    headers = actor_headers("principal:live-ingest", "tenant_a")
    created = client.post(
        "/v1/tenants/tenant_a/conversations",
        headers=headers,
        json={
            "conversation_id": "c1",
            "channel": "webhook",
            "started_at": "2026-10-01T00:00:00Z",
            "external_id": "ext-shared",
        },
    )
    assert created.status_code == 201
    wipe = client.delete("/v1/tenants/tenant_a/data", headers=headers)
    assert wipe.status_code == 403
    review = client.post(
        "/v1/tenants/tenant_a/signals/00000000-0000-4000-8000-000000000001/feedback",
        headers=headers,
        json={"feedback": "correct", "reviewed_by": "principal"},
    )
    assert review.status_code == 403


def test_recovery_principal_may_read_ingestion(api) -> None:
    client, _factory = api
    response = client.get(
        "/v1/tenants/tenant_a/ingestions/missing",
        headers=actor_headers("principal:ingestion-recovery", "tenant_a"),
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "ingestion_not_found"


def test_revoked_membership_blocks_the_next_request(api) -> None:
    client, factory = api
    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")
    headers = actor_headers(sub, "tenant_a")
    assert client.get("/v1/tenants/tenant_a/signal-score", headers=headers).status_code == 200
    db = factory()
    row = db.get(Membership, ("tenant_a", UUID(sub)))
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    db.close()
    denied = client.get("/v1/tenants/tenant_a/signal-score", headers=headers)
    assert denied.status_code == 404
    assert denied.json()["detail"] == "not_found"


def test_header_alias_is_hidden_in_enforce(api) -> None:
    client, factory = api
    sub = add_member(factory, "reviewer@example.test", "tenant_a", "admin")
    response = client.post(
        "/v1/predictions",
        headers=actor_headers(sub, "tenant_a"),
        json={
            "conversation_id": "c1",
            "signal_type": "lead",
            "confidence": 0.4,
            "summary": MARKER,
        },
    )
    assert response.status_code == 404
    assert MARKER not in response.text


def test_enforce_wipe_requires_admin_membership_on_path_tenant(api) -> None:
    client, factory = api
    user_id = add_member(factory, "admin@partner.example", "tenant_partner", "admin")
    denied = client.delete(
        "/v1/tenants/tenant_demo/data",
        headers={
            "X-Tenant-Id": "tenant_demo",
            "X-Sioona-Actor": sign_like_web(user_id, "tenant_demo"),
        },
    )
    assert denied.status_code == 404
    assert denied.json()["detail"] == "not_found"
    add_member(factory, "admin@partner.example", "tenant_demo", "admin")
    allowed = client.delete(
        "/v1/tenants/tenant_demo/data",
        headers={
            "X-Tenant-Id": "tenant_demo",
            "X-Sioona-Actor": sign_like_web(user_id, "tenant_demo"),
        },
    )
    assert allowed.status_code == 200


def test_shadow_logs_membership_db_error(api, monkeypatch, caplog) -> None:
    from sqlalchemy.exc import SQLAlchemyError

    import app.api.actor as actor_module

    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "shadow")
    get_settings.cache_clear()
    client, factory = api
    sub = add_member(factory, "reviewer@example.test", "tenant_a", "reviewer")

    def boom(*_args, **_kwargs):
        raise SQLAlchemyError("membership lookup failed")

    monkeypatch.setattr(actor_module, "_membership", boom)
    with caplog.at_level(logging.INFO, logger="sioona.actor"):
        response = client.get(
            "/v1/tenants/tenant_a/signal-score",
            headers=actor_headers(sub, "tenant_a"),
        )
    assert response.status_code == 200
    assert "reason=membership_unavailable" in caplog.text
    assert "membership lookup failed" not in caplog.text


def test_production_empty_actor_key_fails_closed(api, monkeypatch) -> None:
    monkeypatch.setenv("SIOONA_ENV", "production")
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "shared-secret")
    monkeypatch.setenv("SIOONA_ACTOR_KEY", "")
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "enforce")
    get_settings.cache_clear()
    client, _factory = api
    response = client.get(
        "/v1/tenants/tenant_a/signal-score",
        headers={
            "X-Tenant-Id": "tenant_a",
            "Authorization": "Bearer shared-secret",
            "X-Sioona-Actor": sign_like_web("user", "tenant_a"),
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "actor_key_unconfigured"


def test_live_ingest_principal_scoped_ledger_access(api):
    client, _ = api
    headers = actor_headers("principal:live-ingest", "tenant_a")
    assert client.get("/v1/tenants/tenant_a/inference-attempts/preflight", headers=headers).status_code == 200
    # Empty validated batch reaches the write handler, not the actor rejection.
    assert client.post("/v1/tenants/tenant_a/inference-attempts", headers=headers, json={"attempts": []}).status_code != 403
    assert client.get("/v1/tenants/tenant_b/inference-attempts/preflight", headers=headers).status_code == 404
    assert client.get("/v1/tenants/tenant_a/inference-usage", headers=headers).status_code == 403
