"""Tests for run_shadow_observation runner script."""

import json
from unittest.mock import MagicMock, patch

import pytest
import jwt

from scripts import run_shadow_observation as runner
from app.models.user import actor_user_id


def test_sign_actor_token():
    key = "test-secret-key-12345-with-32-bytes-len"
    token = runner.sign_actor_token("reviewer@staging.test", "tenant_staging_a", key, ttl_seconds=60)
    claims = jwt.decode(token, key, algorithms=["HS256"], audience="sioona-api", issuer="sioona-web")

    assert claims["sub"] == str(actor_user_id("reviewer@staging.test"))
    assert claims["tid"] == "tenant_staging_a"
    assert claims["iss"] == "sioona-web"
    assert claims["aud"] == "sioona-api"
    assert 0 < claims["exp"] - claims["iat"] <= 60


def test_harness_dry_run_execution(tmp_path):
    receipt_file = tmp_path / "receipt.json"

    harness = runner.ShadowObservationHarness(
        base_url="https://fake.staging.local",
        service_token="fake-service-token",
        actor_key="fake-actor-key-at-least-32-bytes-long",
        receipt_path=receipt_file,
        duration_minutes=0.01,
        dry_run=True,
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "sig_test_123"}
    mock_resp.text = "ok"

    with patch("httpx.request", return_value=mock_resp), patch("httpx.get", return_value=mock_resp):
        receipt = harness.execute()

    assert receipt["status"] == "completed"
    assert receipt["window_type"] == "CB-03_actor_auth_shadow_observation"
    assert receipt["controls"]["start_control_executed"] is True
    assert receipt["controls"]["end_control_executed"] is True
    assert receipt["controls"]["intentional_mismatch_controls_count"] == 2
    assert receipt["journeys"]["journeys_completed"] == 3
    assert receipt_file.exists()

    saved_data = json.loads(receipt_file.read_text())
    assert saved_data["target_base_url_redacted"] == "fake.staging.local"
    assert "fake-service-token" not in receipt_file.read_text()
    assert "fake-actor-key" not in receipt_file.read_text()


def test_main_missing_env_vars(monkeypatch, capsys):
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "")
    monkeypatch.setenv("SIOONA_ACTOR_KEY", "")
    assert runner.main([]) == 1
    captured = capsys.readouterr()
    assert "SIOONA_SERVICE_TOKEN" in captured.err
