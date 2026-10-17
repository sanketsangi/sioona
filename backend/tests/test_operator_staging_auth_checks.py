"""Tests for backend/scripts/operator_staging_auth_checks.py."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch
import uuid

import httpx
import pytest

from scripts.operator_staging_auth_checks import (
    StagingAuthChecksRunner,
    main,
    sign_test_actor_token,
    validate_target_url,
)


def test_origin_validation() -> None:
    # Allowed staging and loopback origins
    assert validate_target_url("https://sioona-api-staging.onrender.com") == "https://sioona-api-staging.onrender.com"
    assert validate_target_url("https://sioona-web-staging.onrender.com/") == "https://sioona-web-staging.onrender.com"
    assert validate_target_url("http://127.0.0.1:8000") == "http://127.0.0.1:8000"
    assert validate_target_url("http://localhost:3000") == "http://localhost:3000"

    # Insecure hosted staging rejected
    with pytest.raises(ValueError, match="must use HTTPS"):
        validate_target_url("http://sioona-api-staging.onrender.com")

    # Non-staging origin rejected
    with pytest.raises(ValueError, match="not in allowed staging hosts"):
        validate_target_url("https://production.sioona.ai")
    with pytest.raises(ValueError, match="not in allowed staging hosts"):
        validate_target_url("https://sioona-api.onrender.com")

    # Credentials or query parameters rejected
    with pytest.raises(ValueError, match="must not contain credentials"):
        validate_target_url("https://user:pass@sioona-api-staging.onrender.com")
    with pytest.raises(ValueError, match="must not contain credentials"):
        validate_target_url("https://sioona-api-staging.onrender.com?foo=bar")


def test_token_minting() -> None:
    uid = uuid.uuid4()
    token = sign_test_actor_token(uid, "tenant_staging_a", "test-key-00000000000000000000000000000000", ttl_seconds=60)
    import jwt
    decoded = jwt.decode(token, "test-key-00000000000000000000000000000000", algorithms=["HS256"], audience="sioona-api")
    assert decoded["iss"] == "sioona-web"
    assert decoded["sub"] == str(uid)
    assert decoded["tid"] == "tenant_staging_a"
    assert decoded["exp"] - decoded["iat"] == 60


def test_main_missing_env_vars(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("SIOONA_SERVICE_TOKEN", raising=False)
    monkeypatch.delenv("SIOONA_ACTOR_KEY", raising=False)
    exit_code = main(["--receipt", str(tmp_path / "receipt.json")])
    assert exit_code == 1


def test_db_migration_target_safety() -> None:
    runner = StagingAuthChecksRunner(
        api_base_url="https://sioona-api-staging.onrender.com",
        service_token="test-token",
        actor_key="test-key",
        receipt_path=Path("/tmp/receipt.json"),
        db_migration_url="postgresql+psycopg://owner:secret@remote.postgres.com:5432/production_db",
    )
    with pytest.raises(ValueError, match="production database"):
        runner._run_live_db_revocation_drill()


def test_full_auth_checks_with_mocked_http(tmp_path) -> None:
    receipt_file = tmp_path / "auth-receipt.json"
    mock_key = "mock-key-00000000000000000000000000000000"

    def mock_handler(request: httpx.Request) -> httpx.Response:
        url_str = str(request.url)
        method = request.method

        if url_str.endswith("/health"):
            return httpx.Response(200, json={"status": "healthy"})

        if "/economics-dashboard" in url_str:
            actor = request.headers.get("X-Sioona-Actor", "")
            import jwt
            try:
                claims = jwt.decode(
                    actor,
                    mock_key,
                    algorithms=["HS256"],
                    options={"verify_signature": False, "verify_exp": False},
                )
            except Exception:
                return httpx.Response(401, json={"detail": "invalid_actor"})

            import time
            # Expired token simulation
            if claims.get("exp", 0) < time.time():
                return httpx.Response(401, json={"detail": "invalid_actor"})
            # Tenant mismatch
            if claims.get("tid") not in url_str:
                return httpx.Response(404, json={"detail": "not_found"})
            # Unseeded actor
            sub = str(claims.get("sub", ""))
            if sub == "00000000-0000-4000-8000-000000000099":
                return httpx.Response(404, json={"detail": "not_found"})
            # Role checks
            if "tenant_demo" in url_str:
                return httpx.Response(403, json={"detail": "forbidden"})
            from app.models.user import actor_user_id
            if sub == str(actor_user_id("reviewer@staging.test")):
                return httpx.Response(403, json={"detail": "forbidden"})
            return httpx.Response(200, json={"tenant_id": claims.get("tid")})

        if "/lifecycle" in url_str:
            actor = request.headers.get("X-Sioona-Actor", "")
            import jwt
            try:
                claims = jwt.decode(actor, mock_key, algorithms=["HS256"], options={"verify_signature": False, "verify_exp": False})
                from app.models.user import actor_user_id
                if claims.get("sub") == str(actor_user_id("reviewer@staging.test")) or "tenant_demo" in url_str:
                    return httpx.Response(403, json={"detail": "forbidden"})
                return httpx.Response(200, json={"status": "ok"})
            except Exception:
                return httpx.Response(401, json={"detail": "invalid_actor"})

        if "/api/backend-health" in url_str:
            return httpx.Response(200, json={"status": "ok"})

        if "/api/conversations" in url_str:
            cookie = request.headers.get("Cookie", "")
            if not cookie:
                return httpx.Response(401, json={"error": "Sign in required."})
            return httpx.Response(401, json={"error": "Sign in required.", "loginPath": "/login"})

        if "/conversations" in url_str:
            if method == "POST":
                return httpx.Response(201, json={"id": "conv_mock_123"})
            # Header tampering test
            if request.headers.get("X-Tenant-Id") == "tenant_staging_b" and "tenant_staging_a" in url_str:
                return httpx.Response(403, json={"detail": "X-Tenant-Id does not match path tenant_id"})
            return httpx.Response(200, json=[{"id": "conv_mock_123"}])

        if "/predictions" in url_str:
            return httpx.Response(201, json={"id": "sig_mock_456"})

        if "/feedback" in url_str:
            return httpx.Response(200, json={"status": "persisted"})

        if "/supervised-actions" in url_str:
            if method == "POST":
                return httpx.Response(201, json={"id": "act_mock_789", "status": "approved"})
            query_str = request.url.query.decode("utf-8")
            conv_val = query_str.split("=")[-1] if "=" in query_str else "conv_mock"
            return httpx.Response(200, json=[{
                "id": "act_mock_789",
                "conversation_id": conv_val,
                "status": "approved",
                "action_type": "upsell_note_draft",
            }])

        if url_str.rstrip("/") == "https://sioona-web-staging.onrender.com":
            return httpx.Response(307, headers={"Location": "/login"})

        return httpx.Response(404, json={"detail": "not_found"})

    transport = httpx.MockTransport(mock_handler)

    runner = StagingAuthChecksRunner(
        api_base_url="https://sioona-api-staging.onrender.com",
        service_token="test-service-token",
        actor_key=mock_key,
        receipt_path=receipt_file,
        web_base_url="https://sioona-web-staging.onrender.com",
    )

    with patch.object(httpx, "request", side_effect=lambda method, url, **kwargs: httpx.Client(transport=transport).request(method, url, **kwargs)), \
         patch.object(httpx, "get", side_effect=lambda url, **kwargs: httpx.Client(transport=transport).get(url, **kwargs)):
        receipt = runner.run_all()

    assert receipt["status"] == "pending_operator_verification"
    assert receipt["permissions"]["admin_economics_dashboard_allowed"] is True
    assert receipt["permissions"]["reviewer_economics_dashboard_denied"] is True
    assert receipt["tenant_isolation"]["tenant_a_assertion_on_tenant_b_denied"] is True
    assert receipt["tenant_isolation"]["header_tampering_denied"] is True
    assert receipt["revocation"]["unseeded_actor_denied"] is True
    assert receipt["revocation"]["expired_actor_assertion_denied"] is True
    assert receipt["persisted_review"]["feedback_persisted"] is True
    assert receipt["persisted_review"]["draft_approval_persisted"] is True
    assert receipt["browser_session"]["unauthenticated_api_denied"] is True
    assert receipt["browser_session"]["expired_session_login_path_verified"] is True
    assert receipt["browser_session"]["unauthenticated_document_redirect_verified"] is True
    assert receipt_file.is_file()
