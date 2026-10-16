"""Tests for run_shadow_observation runner script."""

import json
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit
from unittest.mock import MagicMock, patch

import pytest
import jwt

from scripts import run_shadow_observation as runner
from app.models.user import actor_user_id


def test_sign_actor_token():
    key = "test-key-" * 5
    token = runner.sign_actor_token("reviewer@staging.test", "tenant_staging_a", key, ttl_seconds=60)
    claims = jwt.decode(token, key, algorithms=["HS256"], audience="sioona-api", issuer="sioona-web")

    assert claims["sub"] == str(actor_user_id("reviewer@staging.test"))
    assert claims["tid"] == "tenant_staging_a"
    assert claims["iss"] == "sioona-web"
    assert claims["aud"] == "sioona-api"
    assert 0 < claims["exp"] - claims["iat"] <= 60


@pytest.mark.parametrize("dry_run", [True, False])
def test_harness_routes_match_registered_api(tmp_path, monkeypatch, dry_run):
    receipt_file = tmp_path / "receipt.json"

    harness = runner.ShadowObservationHarness(
        base_url="https://fake.staging.local",
        service_token="fake-service-token",
        actor_key="fake-actor-key-at-least-32-bytes-long",
        receipt_path=receipt_file,
        duration_minutes=2,
        dry_run=dry_run,
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": "sig_test_123"}
    reset_resp = MagicMock(status_code=409)
    reset_resp.json.return_value = {"detail": "use_lifecycle_deletion_confirmation"}
    mock_resp.text = "ok"

    from starlette.routing import Match
    from app.api.routes import conversations, predictions, feedback, supervised_actions, pilot, tenant_data
    routes = [route for module in (conversations, predictions, feedback, supervised_actions, pilot, tenant_data)
              for route in module.router.routes]
    clock = [0.0]
    real_time = runner.time.time
    monkeypatch.setattr(runner, "time", SimpleNamespace(
        time=real_time, monotonic=lambda: clock[0],
        sleep=lambda seconds: clock.__setitem__(0, clock[0] + seconds),
    ))

    def request(method, url, **kwargs):
        path = urlsplit(url).path
        scope = {"type": "http", "path": path, "method": method, "root_path": ""}
        assert any(route.matches(scope)[0] == Match.FULL for route in routes), (method, path)
        return reset_resp if method == "DELETE" else mock_resp

    with patch("httpx.request", side_effect=request), patch("httpx.get", return_value=mock_resp):
        receipt = harness.execute()

    assert receipt["status"] == "pending_operator_verification"
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


def test_journey_uses_live_api_contracts(tmp_path, monkeypatch):
    from app.schemas.supervised_action import SupervisedActionDecisionUpsert
    harness = runner.ShadowObservationHarness('https://staging.test', 'token', 'key', tmp_path / 'receipt.json')
    paths = []
    def request(method, path, tenant_id, actor_email=None, json_body=None, **kwargs):
        paths.append((method, path))
        if path == '/v1/supervised-actions':
            SupervisedActionDecisionUpsert.model_validate(json_body)
        return MagicMock(status_code=200, json=lambda: {'id': 'signal-id'})
    monkeypatch.setattr(harness, '_request', request)
    harness.run_journey(1, 'tenant_staging_a')
    assert ('POST', '/v1/signals/signal-id/feedback') in paths
    assert ('GET', '/v1/tenants/tenant_staging_a/conversations') in paths
    assert ('GET', '/v1/conversations') not in paths


@pytest.mark.parametrize('step', ['run_control', 'run_demo_step'])
def test_failed_checks_cannot_pass(tmp_path, monkeypatch, step):
    harness = runner.ShadowObservationHarness('https://staging.test', 'token', 'key', tmp_path / 'receipt.json')
    monkeypatch.setattr(harness, '_request', lambda *a, **k: MagicMock(status_code=500, text='SECRET_BODY'))
    with pytest.raises(RuntimeError) as exc:
        getattr(harness, step)(*(['Start'] if step == 'run_control' else []))
    assert 'SECRET_BODY' not in str(exc.value)


@pytest.mark.parametrize('duration', [0, -1, float('nan'), float('inf')])
def test_invalid_duration_rejected(tmp_path, duration):
    with pytest.raises(ValueError, match='duration'):
        runner.ShadowObservationHarness('https://staging.test', 'token', 'key', tmp_path / 'receipt', duration)


def test_credential_url_rejected(tmp_path):
    with pytest.raises(ValueError, match='URL'):
        runner.ShadowObservationHarness('https://user:secret@staging.test', 'token', 'key', tmp_path / 'receipt')


def test_journey_error_does_not_expose_response(tmp_path, monkeypatch):
    harness = runner.ShadowObservationHarness('https://staging.test', 'token', 'key', tmp_path / 'receipt')
    monkeypatch.setattr(harness, '_request', lambda *a, **k: MagicMock(status_code=500, text='SECRET_TRANSCRIPT'))
    with pytest.raises(RuntimeError) as exc:
        harness.run_journey(1, 'tenant_staging_a')
    assert 'SECRET_TRANSCRIPT' not in str(exc.value)


def test_default_receipt_is_anchored_to_repository(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert Path(runner.DEFAULT_RECEIPT_PATH).is_absolute()
    assert Path(runner.DEFAULT_RECEIPT_PATH) == runner.BACKEND_DIR.parent / "docs/development/evidence/staging-shadow-observation-receipt.json"
