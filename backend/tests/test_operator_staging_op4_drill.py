"""Provider-free operator CLI safety and real HTTP-to-Postgres admission proof."""
import json
import os
from unittest.mock import Mock

import httpx
import pytest

from scripts import operator_staging_op4_drill as op4

KEY = 'op4-test-' * 5
TOKEN = 'op4-' + 'synthetic-service-token'


@pytest.mark.parametrize('url', [
    'https://sioona-api.onrender.com', 'http://sioona-api-staging.onrender.com',
    'https://user:password@sioona-api-staging.onrender.com',
    'https://sioona-api-staging.onrender.com?token=private',
    'https://sioona-api-staging.onrender.com/path', 'https://example.test',
])
def test_rejects_non_staging_or_secret_bearing_origins(url, tmp_path):
    with pytest.raises(op4.DrillError, match='origin'):
        op4.Drill(url, TOKEN, KEY, tmp_path / 'receipt')


def test_cli_requires_explicit_provider_and_operator_confirmation(monkeypatch, capsys):
    monkeypatch.setenv('DETECT_LLM', '1')
    monkeypatch.setattr(httpx, 'request', Mock(side_effect=AssertionError('network attempted')))
    assert op4.main(['--approved-staging-drill', '--confirmed-provider-disabled']) == 1
    httpx.request.assert_not_called()
    assert 'network attempted' not in capsys.readouterr().out


def test_existing_receipt_is_not_overwritten_or_target_mutated(tmp_path):
    path = tmp_path / 'receipt'
    path.write_text('historical')
    request = Mock()
    with pytest.raises(op4.DrillError, match='receipt_exists'):
        op4.Drill('http://127.0.0.1', TOKEN, KEY, path, request=request).execute()
    request.assert_not_called()
    assert path.read_text() == 'historical'


def test_transport_failure_emits_no_secrets_and_attempts_both_pauses(tmp_path):
    path = tmp_path / 'receipt.json'
    request = Mock(side_effect=RuntimeError('SECRET_BODY ' + TOKEN + KEY))
    drill = op4.Drill('http://localhost', TOKEN, KEY, path, request=request)
    with pytest.raises(op4.DrillError, match='transport_failed') as error:
        drill.execute()
    assert TOKEN not in str(error.value) and KEY not in str(error.value)
    assert request.call_count == 3  # failed enable, then independent global/tenant cleanup
    receipt = json.loads(path.read_text())
    assert receipt['status'] == 'failed' and receipt['cleanup_paused'] is False
    assert TOKEN not in path.read_text() and KEY not in path.read_text()
    assert 'SECRET_BODY' not in path.read_text()


@pytest.mark.parametrize('outcome', ['daily_limit', 'run_limit', 'unexpected'])
def test_wrong_pause_outcome_cannot_pass(tmp_path, monkeypatch, outcome):
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt')
    monkeypatch.setattr(drill, 'expect', lambda *a: None)
    monkeypatch.setattr(drill, 'control', lambda *a, **k: None)
    monkeypatch.setattr(drill, 'admit', lambda *a: outcome)
    with pytest.raises(op4.DrillError, match='pause_not_verified'):
        drill.pause(False)


def test_late_pause_fails_bound(tmp_path, monkeypatch):
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt')
    monkeypatch.setattr(drill, 'expect', lambda *a: None)
    monkeypatch.setattr(drill, 'control', lambda *a, **k: None)
    monkeypatch.setattr(drill, 'admit', lambda *a: 'paused')
    times = iter([0, 61])
    monkeypatch.setattr(op4.time, 'monotonic', lambda: next(times))
    with pytest.raises(op4.DrillError, match='deadline'):
        drill.pause(True)


def test_budget_day_change_stops_requests(tmp_path, monkeypatch):
    request = Mock()
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt', request=request)
    monkeypatch.setattr(drill, 'budget_day', lambda: None)
    with pytest.raises(op4.DrillError, match='day_changed'):
        drill.call('POST', '/inference-reservations')
    request.assert_not_called()


def test_invalid_http_result_never_leaks_body(tmp_path):
    response = httpx.Response(503, text='SECRET_PROVIDER_BODY')
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt', request=lambda *a, **k: response)
    with pytest.raises(op4.DrillError, match='unexpected_admission') as error:
        drill.admit('run')
    assert 'SECRET_PROVIDER_BODY' not in str(error.value)


def test_postgres_op4_full_http_admission_drill(tmp_path, monkeypatch):
    """All 500 reservations through real handlers, independent runtime connections."""
    from alembic import command
    from alembic.config import Config
    from fastapi.testclient import TestClient
    from psycopg import sql
    from sqlalchemy import create_engine, make_url, text, select, func
    from sqlalchemy.orm import Session, sessionmaker
    from app.config import get_settings
    from app.db import get_db, clear_tenant
    from app.main import app
    from app.models.inference_budget import InferenceBudget, InferenceControl, InferenceReservation, InferenceRunBudget
    from app.models.inference_attempt import InferenceAttempt
    from app.models.lifecycle import AuditEvent
    from scripts.seed_memberships import seed_memberships

    url = os.getenv('PG_TEST_DATABASE_URL')
    if not url:
        pytest.skip('Dedicated disposable PostgreSQL required')
    target = make_url(url)
    if (target.drivername not in ('postgresql', 'postgresql+psycopg')
            or target.host not in ('localhost', '127.0.0.1', '::1')
            or target.database != 'sioona_migration_test'
            or set(target.query) - {'sslmode', 'connect_timeout'}
            or any(os.getenv(k) for k in ('PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE'))):
        raise ValueError('Dedicated disposable local database required')
    monkeypatch.setenv('DATABASE_URL', url)
    monkeypatch.setenv('MIGRATION_DATABASE_URL', '')
    monkeypatch.setenv('SIOONA_ENV', 'development')
    monkeypatch.setenv('SIOONA_ACTOR_AUTH', 'shadow')
    monkeypatch.setenv('SIOONA_ACTOR_KEY', KEY)
    monkeypatch.setenv('SIOONA_SERVICE_TOKEN', TOKEN)
    monkeypatch.setenv('SIOONA_GLOBAL_CONTROL_TENANT', op4.TENANT)
    monkeypatch.setenv('DETECT_LLM', '0')
    get_settings.cache_clear()
    owner = create_engine(url)
    runtime = None
    old_overrides = dict(app.dependency_overrides)
    try:
        with owner.begin() as conn:
            conn.execute(text('DROP SCHEMA public CASCADE'))
            conn.execute(text('CREATE SCHEMA public'))
        command.upgrade(Config('alembic.ini'), 'head')
        with Session(owner) as db:
            seed_memberships(db, [{'email': 'admin@staging.test', 'tenantId': op4.TENANT, 'role': 'admin'}])
        password = 'op4-' + 'local-runtime-only'
        with owner.begin() as conn:
            with conn.connection.driver_connection.cursor() as cursor:
                cursor.execute(sql.SQL('ALTER ROLE sioona_runtime LOGIN PASSWORD {}').format(sql.Literal(password)))
        runtime = create_engine(target.set(username='sioona_runtime', password=password), pool_size=10)
        factory = sessionmaker(runtime, autoflush=False)
        def database():
            clear_tenant()
            with factory() as db:
                try:
                    yield db
                finally:
                    clear_tenant()
        app.dependency_overrides[get_db] = database
        # No real network connection can occur, even if a dispatch path regresses.
        def blocked(*args, **kwargs):
            raise AssertionError('External HTTP forbidden')
        monkeypatch.setattr(httpx, 'request', blocked)
        monkeypatch.setattr(httpx.HTTPTransport, 'handle_request', blocked)
        monkeypatch.setattr(httpx.AsyncHTTPTransport, 'handle_async_request', blocked)
        with TestClient(app) as client:
            def request(method, url, **kwargs):
                assert '/inference-controls' in url or url.endswith('/inference-reservations')
                kwargs.pop('timeout', None)
                response = client.request(method, url, **kwargs)
                if response.status_code not in (200, 409):
                    pytest.fail(f'Local API contract: {response.status_code} {response.json()}')
                return response
            receipt_path = tmp_path / 'op4.json'
            receipt = op4.Drill('http://localhost', TOKEN, KEY, receipt_path, request=request).execute()
        assert receipt['status'] == 'pending_operator_verification'
        assert receipt['admissions_authorized'] == 500
        assert receipt['cleanup_paused'] is True
        assert receipt['checks']['global_pause_seconds'] <= 60
        assert receipt['checks']['tenant_pause_seconds'] <= 60
        for name in ('daily_last_slot', 'run_last_slot'):
            assert receipt['checks'][name] == {'contenders': 8, 'authorized': 1, 'denied': 7}
        with Session(owner) as db:
            assert db.scalar(select(func.count()).select_from(InferenceReservation)) == 500
            assert db.scalar(select(func.count()).select_from(InferenceAttempt)) == 500
            assert db.scalar(select(InferenceBudget.attempts)) == 500
            assert db.scalar(select(func.max(InferenceRunBudget.attempts))) == 120
            assert all(not row.enabled for row in db.scalars(select(InferenceControl)))
            rows = db.scalars(select(InferenceAttempt)).all()
            assert all(row.status == 'pending' and row.usage_status == 'unknown' and row.input_tokens is None for row in rows)
            assert db.scalar(select(func.count()).select_from(AuditEvent)) >= 8
        content = receipt_path.read_text()
        assert TOKEN not in content and KEY not in content
        assert 'localhost' not in content and 'admin@' not in content
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(old_overrides)
        if runtime is not None:
            runtime.dispose()
        with owner.begin() as conn:
            if conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname='sioona_runtime'")).scalar():
                conn.execute(text('ALTER ROLE sioona_runtime NOLOGIN'))
        owner.dispose()
        clear_tenant()
        get_settings.cache_clear()


@pytest.mark.parametrize('outcome', ['authorized', 'run_limit', 'daily_limit'])
def test_concurrent_wrong_counts_fail(tmp_path, monkeypatch, outcome):
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt')
    monkeypatch.setattr(drill, 'admit', lambda *a: outcome)
    with pytest.raises(op4.DrillError, match='concurrent_admission_mismatch'):
        drill.race('run', 'run_limit')


def test_rollover_does_not_prevent_safety_pause(tmp_path, monkeypatch):
    response = httpx.Response(200, json={'ok': True})
    request = Mock(return_value=response)
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt', request=request)
    monkeypatch.setattr(drill, 'budget_day', lambda: None)
    drill.control(False, global_scope=True)
    request.assert_called_once()


def test_cleanup_failure_cannot_produce_success_receipt(tmp_path, monkeypatch):
    drill = op4.Drill('http://localhost', TOKEN, KEY, tmp_path / 'receipt')
    def control(enabled, **kwargs):
        if not enabled:
            raise op4.DrillError('cleanup_unavailable')
    monkeypatch.setattr(drill, 'control', control)
    monkeypatch.setattr(drill, 'pause', lambda *a: 0)
    def expect(_run, expected):
        if expected == 'authorized':
            drill.accepted += 1
    monkeypatch.setattr(drill, 'expect', expect)
    def race(*args):
        drill.accepted += 1
        return {'contenders': 8, 'authorized': 1, 'denied': 7}
    monkeypatch.setattr(drill, 'race', race)
    # Bound the artificial fill loop without emulating backend accounting.
    monkeypatch.setattr(op4, 'DAILY', 122)
    with pytest.raises(op4.DrillError, match='cleanup_failed'):
        drill.execute()
    assert json.loads(drill.path.read_text())['status'] == 'failed'


@pytest.mark.parametrize('flags', [[], ['--approved-staging-drill'], ['--confirmed-provider-disabled']])
def test_cli_missing_confirmation_never_connects(monkeypatch, flags):
    monkeypatch.setenv('DETECT_LLM', '0')
    request = Mock()
    monkeypatch.setattr(httpx, 'request', request)
    assert op4.main(flags) == 1
    request.assert_not_called()
