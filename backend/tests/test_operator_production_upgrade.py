"""OP-3 guards plus populated upgrades on a strictly disposable local target."""
import json
import os
from unittest.mock import MagicMock

import pytest
from alembic import command
from sqlalchemy import create_engine, make_url, text
from scripts import operator_production_upgrade as upgrade


@pytest.fixture
def approved(monkeypatch):
    for name in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
                 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('HOSTED_MIGRATION_DATABASE_URL', 'postgresql://owner:secret@localhost/sioona_migration_test')
    monkeypatch.setenv('SIOONA_RUNTIME_PASSWORD', "quote' : % \\ secret")
    monkeypatch.setenv('OP3_APPROVED_DATABASE', 'sioona_migration_test')
    for key in ('OP3_BACKUP_RESTORE_VERIFIED', 'OP3_WRITERS_STOPPED', 'ALLOW_SHARED_RUNTIME_ROLE'):
        monkeypatch.setenv(key, '1')


@pytest.mark.parametrize('key,value', [
    ('OP3_APPROVED_DATABASE', 'wrong'), ('OP3_BACKUP_RESTORE_VERIFIED', '0'),
    ('OP3_WRITERS_STOPPED', ''), ('ALLOW_SHARED_RUNTIME_ROLE', 'true'),
    ('SIOONA_RUNTIME_PASSWORD', ' '), ('PGHOSTADDR', 'remote'),
    ('HOSTED_MIGRATION_DATABASE_URL', 'postgresql://owner@host-pooler/db'),
    ('HOSTED_MIGRATION_DATABASE_URL', 'postgresql://owner@localhost/db?host=remote'),
    ('HOSTED_MIGRATION_DATABASE_URL', 'sqlite:///local.db'),
])
def test_guards_before_connection(approved, monkeypatch, key, value):
    monkeypatch.setenv(key, value)
    factory = MagicMock(side_effect=AssertionError('must not connect'))
    monkeypatch.setattr(upgrade, 'create_engine', factory)
    with pytest.raises(ValueError):
        upgrade.run_upgrade()
    factory.assert_not_called()


def test_password_preserved(approved):
    assert upgrade.validate_inputs()[1] == "quote' : % \\ secret"


@pytest.mark.parametrize('revision', ['023_inference_budgets', 'unknown', None])
def test_invalid_revisions(revision):
    conn = MagicMock()
    conn.scalars.return_value = [] if revision is None else [revision]
    with pytest.raises(RuntimeError, match='unsupported_current_revision'):
        upgrade.verify_revision(conn, upgrade._get_alembic_config(upgrade.BACKEND_DIR / 'alembic.ini'))


@pytest.mark.parametrize('revisions', [['024_tenant_rls'], ['027_complete_tenant_rls'], ['027_jobs'], ['034_operational_telemetry']])
def test_graph_revision_acceptance(revisions):
    conn = MagicMock()
    conn.scalars.return_value = revisions
    assert upgrade.verify_revision(conn, upgrade._get_alembic_config(upgrade.BACKEND_DIR / 'alembic.ini')) == revisions[0]


def test_multiple_heads_rejected():
    conn = MagicMock()
    conn.scalars.return_value = ['027_complete_tenant_rls', '027_jobs']
    with pytest.raises(RuntimeError):
        upgrade.verify_revision(conn, upgrade._get_alembic_config(upgrade.BACKEND_DIR / 'alembic.ini'))


def test_failure_output_secret_free(monkeypatch, capsys):
    monkeypatch.setattr(upgrade, 'run_upgrade', MagicMock(side_effect=RuntimeError('postgresql://owner:secret@host/db transcript')))
    assert upgrade.main() == 1
    output = capsys.readouterr()
    assert 'secret' not in output.err and 'transcript' not in output.err and 'postgresql' not in output.err


def disposable_url(raw):
    url = make_url(upgrade._normalize_pg_url(raw))
    if (url.host not in ('localhost', '127.0.0.1', '::1')
            or url.database != 'sioona_migration_test'
            or url.drivername != 'postgresql+psycopg'
            or set(url.query) - {'sslmode', 'connect_timeout'}
            or any(os.environ.get(k) for k in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'))):
        raise ValueError('disposable local target required')
    return url


@pytest.mark.parametrize('raw', [
    'postgresql://owner@remote/sioona_migration_test',
    'postgresql://owner@localhost/production',
    'postgresql://owner@localhost/sioona_migration_test?hostaddr=remote',
    'postgresql://owner@localhost/sioona_migration_test?service=prod',
])
def test_disposable_guard(raw):
    with pytest.raises(ValueError):
        disposable_url(raw)


@pytest.mark.parametrize('start,corrupt', [
    ('024_tenant_rls', False), ('027_complete_tenant_rls', False),
    ('027_jobs', False), ('034_operational_telemetry', False),
    ('024_tenant_rls', True),
    ('024_tenant_rls', 'replace_key'),
    ('024_tenant_rls', 'audit_grant'),
    ('024_tenant_rls', 'rls_disabled'),
    ('024_tenant_rls', 'unsafe_role'),
    ('024_tenant_rls', 'schema_failure'),
])
def test_populated_postgres_upgrade(approved, monkeypatch, tmp_path, start, corrupt):
    raw = os.environ.get('PG_TEST_DATABASE_URL')
    if not raw:
        pytest.skip('Dedicated PostgreSQL test database required')
    url = disposable_url(raw)  # Before any connection or DROP.
    engine = create_engine(url)
    receipt = tmp_path / 'receipt.json'
    monkeypatch.setenv('HOSTED_MIGRATION_DATABASE_URL', url.render_as_string(hide_password=False))
    monkeypatch.setenv('RECEIPT_PATH', str(receipt))
    cfg = upgrade._get_alembic_config(upgrade.BACKEND_DIR / 'alembic.ini')
    try:
        with engine.begin() as conn:
            conn.execute(text('DROP SCHEMA public CASCADE'))
            conn.execute(text('CREATE SCHEMA public'))
            cfg.attributes['connection'] = conn
            command.upgrade(cfg, start)
            conn.execute(text("INSERT INTO users (id,email) VALUES ('4f79ac56-3a83-5f2a-b143-dafc406b7c28','op3@example.test')"))
            for tenant in ('op3_a', 'op3_b'):
                conn.execute(text('INSERT INTO workspaces (tenant_id,name) VALUES (:t,:t)'), {'t': tenant})
                conn.execute(text("INSERT INTO memberships (tenant_id,user_id,role) VALUES (:t,'4f79ac56-3a83-5f2a-b143-dafc406b7c28','reviewer')"), {'t': tenant})
                conn.execute(text('''INSERT INTO messages
                    (id,tenant_id,conversation_id,message_id,role,content,timestamp)
                    VALUES (:id,:t,'conv','msg','customer','synthetic existing text',now())'''),
                    {'t': tenant, 'id': '00000000-0000-4000-8000-00000000000' + ('1' if tenant == 'op3_a' else '2')})
            before = upgrade.snapshot(conn, ['workspaces', 'messages', 'memberships', 'users'])
        saved_env = os.environ.get('DATABASE_URL')
        if corrupt == 'schema_failure':
            monkeypatch.setattr(upgrade.check_schema, 'main', MagicMock(side_effect=SystemExit('synthetic failure')))
            with pytest.raises(SystemExit):
                upgrade.run_upgrade()
            assert not receipt.exists()
            assert os.environ.get('DATABASE_URL') == saved_env
            with engine.connect() as conn:
                assert conn.scalar(text('SELECT version_num FROM alembic_version')) == upgrade.EXPECTED_HEAD
                assert upgrade.snapshot(conn, ['workspaces', 'messages', 'memberships', 'users']) == before
            return
        if corrupt:
            real_upgrade = upgrade.command.upgrade
            def corrupt_upgrade(config, revision):
                real_upgrade(config, revision)
                statements = {
                    True: "DELETE FROM messages WHERE tenant_id='op3_a'",
                    'replace_key': "UPDATE messages SET id='00000000-0000-4000-8000-000000000009' WHERE tenant_id='op3_a'",
                    'audit_grant': 'GRANT UPDATE ON audit_events TO sioona_runtime',
                    'rls_disabled': 'ALTER TABLE messages NO FORCE ROW LEVEL SECURITY',
                    'unsafe_role': 'ALTER ROLE sioona_runtime BYPASSRLS',
                }
                config.attributes['connection'].execute(text(statements[corrupt]))
            monkeypatch.setattr(upgrade.command, 'upgrade', corrupt_upgrade)
            with pytest.raises(RuntimeError, match={
                True: 'existing_row_identity_changed', 'replace_key': 'existing_row_identity_changed',
                'audit_grant': 'unsafe_audit_privileges', 'rls_disabled': 'forced_rls_required',
                'unsafe_role': 'unsafe_runtime_attributes',
            }[corrupt]):
                upgrade.run_upgrade()
            assert not receipt.exists()
            with engine.connect() as conn:
                assert conn.scalar(text('SELECT version_num FROM alembic_version')) == start
                assert upgrade.snapshot(conn, ['workspaces', 'messages', 'memberships', 'users']) == before
            return
        result = upgrade.run_upgrade()
        assert os.environ.get('DATABASE_URL') == saved_env
        assert json.loads(receipt.read_text()) == result
        assert result['from_revision'] == start
        assert result['to_revision'] == upgrade.EXPECTED_HEAD
        assert result['pre_upgrade_rows'] == result['post_upgrade_rows']
        assert result['pre_upgrade_rows'] >= 4
        assert result['primary_key_digests_match'] and result['runtime_login_verified']
        assert result['schema_startup_check'] == 'passed'
        assert result['forced_rls_tables_checked'] >= 20
        assert all(s not in receipt.read_text() for s in ('secret', 'op3_a', 'op3_b', 'synthetic existing text', 'postgresql', 'localhost'))
        with engine.connect() as conn:
            assert upgrade.snapshot(conn, ['workspaces', 'messages', 'memberships', 'users']) == before
        runtime = create_engine(upgrade._build_runtime_url(raw, os.environ['SIOONA_RUNTIME_PASSWORD']))
        try:
            with runtime.begin() as conn:
                for tenant in ('op3_a', 'op3_b'):
                    conn.execute(text("SELECT set_config('app.tenant_id',:t,true)"), {'t': tenant})
                    assert conn.execute(text('SELECT tenant_id,content FROM messages')).all() == [(tenant, 'synthetic existing text')]
        finally:
            runtime.dispose()
    finally:
        with engine.begin() as conn:
            conn.execute(text('ALTER ROLE sioona_runtime NOLOGIN'))
        engine.dispose()
