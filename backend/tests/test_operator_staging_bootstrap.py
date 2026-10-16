"""Regression coverage for role SQL and secret-free operator failures."""
import os
from unittest.mock import MagicMock

import pytest
from psycopg import sql
from sqlalchemy.exc import ProgrammingError

from scripts import operator_staging_bootstrap as bootstrap


@pytest.fixture(autouse=True)
def _restore_bootstrap_process_state():
    # run_bootstrap assigns these directly, so register their original values
    # with a separate patch context and clear settings only after restoration.
    with pytest.MonkeyPatch.context() as patch:
        for name in ('DATABASE_URL', 'MIGRATION_DATABASE_URL'):
            if name in os.environ:
                patch.setenv(name, os.environ[name])
            else:
                patch.setenv(name, '')
                patch.delenv(name)
        patch.setattr(bootstrap, '_current_step', '')
        bootstrap.get_settings.cache_clear()
        try:
            yield
        finally:
            patch.undo()
            bootstrap.get_settings.cache_clear()


@pytest.mark.parametrize("exists", [False, True])
def test_role_password_is_a_quoted_literal_not_a_statement_bind(exists):
    conn = MagicMock()
    conn.execute.return_value.scalar.return_value = exists
    cursor = conn.connection.driver_connection.cursor.return_value.__enter__.return_value
    password = "quote' backslash\\ :password %s $$"

    bootstrap._provision_runtime_role(conn, password)

    statement = cursor.execute.call_args.args[0]
    assert isinstance(statement, sql.Composed)
    rendered = statement.as_string()
    assert rendered.startswith('ALTER ROLE' if exists else 'CREATE ROLE')
    assert sql.Literal(password).as_string() in rendered
    assert 'DO $$' not in rendered
    assert len(cursor.execute.call_args.args) == 1


def test_failure_output_omits_driver_exception_secrets(monkeypatch, capsys):
    secret = 'synthetic-runtime-password-do-not-print'
    error = ProgrammingError('ALTER ROLE', {'password': secret}, Exception(secret))
    assert secret in str(error)

    def fail():
        raise error

    monkeypatch.setattr(bootstrap, 'run_bootstrap', fail)
    assert bootstrap.main() == 1
    captured = capsys.readouterr()
    assert secret not in captured.out + captured.err
    assert 'BOOTSTRAP FAILED' in captured.err


def test_receipt_is_relative_to_repository(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    assert bootstrap._receipt_file('docs/receipt.json') == bootstrap.BACKEND_DIR.parent / 'docs/receipt.json'
    assert bootstrap._receipt_file(str(tmp_path / 'receipt.json')) == tmp_path / 'receipt.json'


@pytest.mark.parametrize('privileges', [(True, False), (False, True), (None, False)])
def test_audit_mutation_privileges_fail_closed(privileges):
    conn = MagicMock()
    conn.execute.return_value.one.return_value = privileges
    with pytest.raises(RuntimeError):
        bootstrap._verify_audit_append_only(conn)


def test_audit_effective_privileges_are_checked():
    conn = MagicMock()
    conn.execute.return_value.one.return_value = (False, False)
    bootstrap._verify_audit_append_only(conn)
    statement = str(conn.execute.call_args.args[0])
    assert "has_table_privilege" in statement
    assert "UPDATE" in statement and "DELETE" in statement


@pytest.mark.parametrize('exists', [True, False])
def test_ensure_target_creates_only_missing_database(monkeypatch, exists):
    engine = MagicMock()
    conn = engine.connect.return_value.__enter__.return_value
    conn.execute.return_value.scalar.return_value = exists
    factory = MagicMock(return_value=engine)
    monkeypatch.setattr(bootstrap, 'create_engine', factory)
    bootstrap._ensure_empty_target_database('postgresql+psycopg://owner:secret@host/sioona_staging_clean')
    url = factory.call_args.args[0]
    assert url.database == 'neondb'
    assert url.host == 'host'
    assert factory.call_args.kwargs['isolation_level'] == 'AUTOCOMMIT'
    cursor = conn.connection.driver_connection.cursor.return_value.__enter__.return_value
    if exists:
        cursor.execute.assert_not_called()
    else:
        assert cursor.execute.call_args.args[0].as_string() == 'CREATE DATABASE "sioona_staging_clean"'
    engine.dispose.assert_called_once()


def test_test_database_is_never_touched(monkeypatch):
    factory = MagicMock()
    monkeypatch.setattr(bootstrap, 'create_engine', factory)
    with pytest.raises(ValueError):
        bootstrap._ensure_empty_target_database('postgresql+psycopg://owner@host/sioona_migration_test')
    factory.assert_not_called()


def test_maintenance_falls_back_to_postgres(monkeypatch):
    from sqlalchemy.exc import OperationalError
    first, second = MagicMock(), MagicMock()
    first.connect.side_effect = OperationalError('secret', {}, Exception('secret'))
    second.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = True
    factory = MagicMock(side_effect=[first, second])
    monkeypatch.setattr(bootstrap, 'create_engine', factory)
    bootstrap._ensure_empty_target_database('postgresql+psycopg://owner@host/sioona_staging_clean')
    assert [call.args[0].database for call in factory.call_args_list] == ['neondb', 'postgres']
    first.dispose.assert_called_once()
    second.dispose.assert_called_once()


def test_failure_reports_step_and_type_only(monkeypatch, capsys):
    def fail():
        bootstrap._set_step('3. Provision runtime role')
        raise RuntimeError('secret-password')
    monkeypatch.setattr(bootstrap, 'run_bootstrap', fail)
    assert bootstrap.main() == 1
    captured = capsys.readouterr()
    assert '3. Provision runtime role' in captured.err
    assert 'RuntimeError' in captured.err
    assert 'secret-password' not in captured.err


@pytest.mark.parametrize('sqlstate, diagnostic', [
    ('42501', 'new row violates row-level security policy'),
    ('42601', 'syntax error'),
    ('42501', 'permission denied for table messages'),
])
@pytest.mark.parametrize('role_mode', ['isolated', 'explicit_shared_opt_in', 'blocked'])
def test_bootstrap_preserves_migration_grants_and_records_audit_proof(
    monkeypatch, tmp_path, sqlstate, diagnostic, role_mode
):
    monkeypatch.setenv('HOSTED_MIGRATION_DATABASE_URL', 'postgresql://owner@host/sioona_staging_clean')
    monkeypatch.setenv('SIOONA_RUNTIME_PASSWORD', 'synthetic-test-password')
    monkeypatch.setenv('RECEIPT_PATH', str(tmp_path / 'receipt.json'))
    isolation = MagicMock(return_value=role_mode)
    if role_mode == 'blocked':
        isolation.side_effect = RuntimeError('shared role')
    monkeypatch.setattr(bootstrap, '_verify_role_isolation', isolation, raising=False)
    driver_error = Exception(diagnostic)
    driver_error.sqlstate = sqlstate
    insert_error = ProgrammingError('INSERT', {}, driver_error)
    ensure = MagicMock()
    monkeypatch.setattr(bootstrap, '_ensure_empty_target_database', ensure)
    engine = MagicMock()
    conn = engine.connect.return_value.__enter__.return_value
    engine.begin.return_value.__enter__.return_value = conn
    statements = []

    def execute(statement, params=None):
        query = str(statement)
        statements.append(query)
        result = MagicMock()
        result.scalar.return_value = 0
        result.rowcount = 0
        if 'version_num' in query:
            result.scalar.return_value = bootstrap.EXPECTED_HEAD
        if 'rolsuper' in query:
            result.one.return_value = (False, False, False, False, True)
        if 'has_table_privilege' in query:
            result.one.return_value = (False, False)
        if 'SELECT DISTINCT c.table_name' in query:
            result.scalars.return_value.all.return_value = ['messages']
        if 'relrowsecurity' in query:
            result.one.return_value = (True, True)
        if 'SELECT tenant_id FROM workspaces' in query:
            tenant = 'tenant_staging_b' if any('tenant_staging_b' in q for q in statements[-2:]) else 'tenant_staging_a'
            result.scalars.return_value.all.return_value = [tenant]
        if 'SELECT id, content' in query:
            result.one_or_none.return_value = ('id', 'staging payload a')
        if "VALUES ('00000000-0000-4000-8000-0000000000b1'" in query:
            raise insert_error
        if query.startswith('DELETE FROM messages') and "tenant_staging_a" in statements[-2]:
            result.rowcount = 1
        if 'SELECT COUNT(*) FROM workspaces' in query and "tenant_staging_a" in statements[-2]:
            result.scalar.return_value = 1
        return result

    conn.execute.side_effect = execute

    def factory(*args, **kwargs):
        ensure.assert_called_once()
        return engine

    monkeypatch.setattr(bootstrap, 'create_engine', factory)
    upgrade = MagicMock()
    monkeypatch.setattr(bootstrap.command, 'upgrade', upgrade)
    monkeypatch.setattr(bootstrap.check_schema, 'main', MagicMock())
    monkeypatch.setattr(bootstrap, 'Session', MagicMock())
    monkeypatch.setattr(bootstrap, 'seed_memberships', MagicMock(return_value={'upserted': len(bootstrap.SYNTHETIC_SEED_PAYLOAD)}))
    monkeypatch.setattr(bootstrap, '_provision_runtime_role', MagicMock())
    if role_mode == 'blocked':
        with pytest.raises(RuntimeError, match='shared role'):
            bootstrap.run_bootstrap()
        upgrade.assert_not_called()
        return
    if sqlstate != '42501' or 'row-level security' not in diagnostic:
        with pytest.raises(ProgrammingError) as caught:
            bootstrap.run_bootstrap()
        assert caught.value is insert_error
        assert not (tmp_path / 'receipt.json').exists()
        return
    receipt = bootstrap.run_bootstrap()
    assert receipt['preflight']['role_isolation_mode'] == role_mode
    assert receipt['verification']['audit_append_only_verified'] is True
    import json
    assert json.loads((tmp_path / 'receipt.json').read_text()) == receipt
    assert not any('ALL TABLES' in query or 'GRANT SELECT' in query for query in statements)


def test_postgres_live_bootstrap_verifies_all_fixes(tmp_path, monkeypatch):
    import os
    from sqlalchemy import create_engine, make_url, text

    pg_url = os.getenv("PG_TEST_DATABASE_URL")
    if not pg_url:
        pytest.skip("Dedicated PostgreSQL test database required (PG_TEST_DATABASE_URL)")

    target = make_url(pg_url)
    if (
        target.drivername not in ('postgresql', 'postgresql+psycopg')
        or target.host not in ('localhost', '127.0.0.1', '::1')
        or target.database != 'sioona_migration_test'
        or set(target.query) - {'sslmode', 'connect_timeout'}
        or any(os.environ.get(name) for name in ('PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE'))
    ):
        raise ValueError('Bootstrap test requires a dedicated disposable local database.')
    # Other migration tests retain this cluster-wide role after dropping schemas.
    # This opt-in applies only after validating the disposable local test target.
    monkeypatch.setenv('ALLOW_SHARED_RUNTIME_ROLE', '1')
    engine = create_engine(pg_url)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()

    receipt_file = tmp_path / "staging-receipt.json"
    monkeypatch.setenv("HOSTED_MIGRATION_DATABASE_URL", pg_url)
    monkeypatch.setenv("SIOONA_RUNTIME_PASSWORD", "test-live-runtime-pw-456")
    monkeypatch.setenv("RECEIPT_PATH", str(receipt_file))

    receipt = bootstrap.run_bootstrap()
    assert receipt["status"] == "success"
    assert receipt["migrations"]["head_applied"] == bootstrap.EXPECTED_HEAD
    assert receipt["verification"]["schema_startup_check"] == "passed"
    assert receipt["verification"]["forced_rls_verified"] is True
    assert receipt["verification"]["audit_append_only_verified"] is True
    assert receipt["verification"]["tenant_ab_isolation_verified"] is True
    assert receipt["verification"]["connection_reuse_safety_verified"] is True



@pytest.mark.parametrize('role_exists,siblings,host,opt_in,expected', [
    (False, [], 'staging.neon.tech', None, 'isolated'),
    (True, [], 'staging.neon.tech', None, None),
    (True, [], 'localhost', None, None),
    (False, ['sioona_migration_test'], 'staging.neon.tech', None, None),
    (False, ['sioona_migration_test'], '127.0.0.1', None, 'isolated'),
    (True, ['sioona_migration_test'], 'staging.neon.tech', '1', 'explicit_shared_opt_in'),
    (True, [], 'staging.neon.tech', 'true', None),
])
def test_role_isolation_preflight(monkeypatch, role_exists, siblings, host, opt_in, expected):
    from sqlalchemy import make_url
    if opt_in is None:
        monkeypatch.delenv('ALLOW_SHARED_RUNTIME_ROLE', raising=False)
    else:
        monkeypatch.setenv('ALLOW_SHARED_RUNTIME_ROLE', opt_in)
    conn = MagicMock()
    conn.engine.url = make_url(f'postgresql://owner@{host}/sioona_staging_clean')
    result_role, result_databases = MagicMock(), MagicMock()
    result_role.scalar.return_value = role_exists
    result_databases.scalars.return_value.all.return_value = siblings
    conn.execute.side_effect = [result_role, result_databases]
    if expected is None:
        with pytest.raises(RuntimeError, match='ALLOW_SHARED_RUNTIME_ROLE=1'):
            bootstrap._verify_role_isolation(conn)
    else:
        assert bootstrap._verify_role_isolation(conn) == expected


@pytest.mark.parametrize('state,message,expected', [
    ('42501', 'new row violates ROW-LEVEL SECURITY policy', True),
    ('42601', 'row-level security syntax error', False),
    ('42501', 'permission denied', False),
    (None, 'row-level security', False),
])
def test_rls_violation_requires_state_and_diagnostic(state, message, expected):
    original = Exception(message)
    original.sqlstate = state
    assert bootstrap._is_rls_violation(ProgrammingError('INSERT', {}, original)) is expected


@pytest.mark.parametrize('url', [
    'postgresql+psycopg://owner@remote.example/sioona_migration_test',
    'postgresql+psycopg://owner@127.0.0.1/production',
    'postgresql+psycopg://owner@localhost/sioona_migration_test?host=remote.example',
    'postgresql+psycopg://owner@localhost/sioona_migration_test?service=production',
])
def test_live_bootstrap_rejects_unsafe_target_before_connect(monkeypatch, tmp_path, url):
    import sqlalchemy
    monkeypatch.setenv('PG_TEST_DATABASE_URL', url)
    factory = MagicMock(side_effect=AssertionError('connection attempted'))
    monkeypatch.setattr(sqlalchemy, 'create_engine', factory)
    with pytest.raises(ValueError, match='disposable local'):
        test_postgres_live_bootstrap_verifies_all_fixes(tmp_path, monkeypatch)
    factory.assert_not_called()


def test_disposable_ipv6_loopback_target_is_supported(monkeypatch):
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = True
    monkeypatch.setattr(bootstrap, 'create_engine', MagicMock(return_value=engine))
    bootstrap._ensure_empty_target_database('postgresql+psycopg://owner@[::1]/sioona_migration_test')
