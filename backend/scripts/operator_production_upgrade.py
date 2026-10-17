"""Human-run OP-3 populated database upgrade; never invoke against hosted DBs from an agent.

After recording approved target, restorable backup, restore rehearsal and rollback
owner per CB-10/CB-19, stop API/ingest/workers/recovery. Set:
  HOSTED_MIGRATION_DATABASE_URL (direct owner URL, never a pooler)
  SIOONA_RUNTIME_PASSWORD (preserved exactly)
  OP3_APPROVED_DATABASE (exact database name)
  OP3_BACKUP_RESTORE_VERIFIED=1 and OP3_WRITERS_STOPPED=1
  ALLOW_SHARED_RUNTIME_ROLE=1 (explicit cluster-wide password rotation approval)
Run: python backend/scripts/operator_production_upgrade.py
RECEIPT_PATH optionally overrides the repository-relative counts-only receipt.
No backups, deployment configuration, synthetic rows or runtime URL switch are
performed here. Counts/key digests prove identity preservation, not field equality.
Failures print fixed diagnostics only; check_schema failure after commit requires
operator recovery, never an automatic downgrade. A receipt failure also does not
undo a committed upgrade. No success receipt is written until every check passes.
"""
from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from app.config import get_settings
from scripts import check_schema
from scripts.operator_staging_bootstrap import (
    RUNTIME_ROLE, _normalize_pg_url, _get_alembic_config,
    _build_runtime_url, _provision_runtime_role, _receipt_file,
)

EXPECTED_HEAD = '034_operational_telemetry'
BASE_REVISION = '024_tenant_rls'
DEFAULT_RECEIPT = 'docs/development/evidence/production-upgrade-receipt.json'
_phase = 'preflight'


def validate_inputs():
    raw = os.environ.get('HOSTED_MIGRATION_DATABASE_URL', '')
    password = os.environ.get('SIOONA_RUNTIME_PASSWORD', '')
    url = make_url(_normalize_pg_url(raw))
    if (url.drivername != 'postgresql+psycopg' or not url.host or not url.database
            or not url.username or not password.strip() or url.username == RUNTIME_ROLE
            or 'pooler' in url.host.lower()
            or set(url.query) - {'sslmode', 'connect_timeout'}
            or any(os.environ.get(k) for k in ('PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'))):
        raise ValueError('invalid_owner_target_or_credentials')
    if (os.environ.get('OP3_APPROVED_DATABASE') != url.database
            or any(os.environ.get(k) != '1' for k in (
                'OP3_BACKUP_RESTORE_VERIFIED', 'OP3_WRITERS_STOPPED', 'ALLOW_SHARED_RUNTIME_ROLE'))):
        raise ValueError('operator_acknowledgments_required')
    return url, password


def verify_revision(conn, cfg):
    scripts = ScriptDirectory.from_config(cfg)
    if set(scripts.get_heads()) != {EXPECTED_HEAD}:
        raise RuntimeError('unexpected_repository_head')
    allowed = []
    for revision in scripts.iterate_revisions(EXPECTED_HEAD, 'base'):
        allowed.append(revision.revision)
        if revision.revision == BASE_REVISION:
            break
    if not allowed or allowed[-1] != BASE_REVISION:
        raise RuntimeError('invalid_migration_graph')
    versions = list(conn.scalars(text('SELECT version_num FROM public.alembic_version')))
    if len(versions) != 1 or versions[0] not in allowed:
        raise RuntimeError('unsupported_current_revision')
    return versions[0]


def snapshot(conn, tables):
    """Stream only ordered PK tuples; never read transcript or payload columns."""
    result = {}
    inspector = inspect(conn)
    quote = conn.dialect.identifier_preparer.quote_identifier
    for table in tables:
        keys = inspector.get_pk_constraint(table, schema='public')['constrained_columns']
        if not keys:
            raise RuntimeError('existing_table_without_primary_key')
        columns = ', '.join(quote(k) for k in keys)
        digest, count = hashlib.sha256(), 0
        query = f'SELECT {columns} FROM public.{quote(table)} ORDER BY {columns}'
        with conn.execution_options(stream_results=True).execute(text(query)) as rows:
            for row in rows:
                encoded = json.dumps(tuple(row), default=str, ensure_ascii=True, separators=(',', ':')).encode()
                digest.update(len(encoded).to_bytes(8, 'big'))
                digest.update(encoded)
                count += 1
        conn.execution_options(stream_results=False)
        result[table] = (count, digest.hexdigest())
    return result


def verify_runtime(conn):
    attrs = tuple(conn.execute(text('''SELECT rolsuper, rolcreaterole, rolcreatedb,
        rolbypassrls, rolcanlogin, rolreplication FROM pg_roles WHERE rolname=:role'''),
        {'role': RUNTIME_ROLE}).one())
    if attrs != (False, False, False, False, True, False):
        raise RuntimeError('unsafe_runtime_attributes')
    if conn.scalar(text('''SELECT EXISTS (SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=:role)'''), {'role': RUNTIME_ROLE}):
        raise RuntimeError('runtime_membership_requires_operator_repair')
    if conn.scalar(text('''SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
        WHERE r.rolname=:role AND c.relkind IN ('r','p','v','m','S','f'))'''), {'role': RUNTIME_ROLE}):
        raise RuntimeError('runtime_must_not_own_relations')
    privileges = conn.execute(text('''SELECT
        has_table_privilege(:role,'public.audit_events','SELECT'),
        has_table_privilege(:role,'public.audit_events','INSERT'),
        has_table_privilege(:role,'public.audit_events','UPDATE'),
        has_table_privilege(:role,'public.audit_events','DELETE'),
        has_table_privilege(:role,'public.audit_events','TRUNCATE'),
        has_any_column_privilege(:role,'public.audit_events','UPDATE')'''), {'role': RUNTIME_ROLE}).one()
    if tuple(privileges) != (True, True, False, False, False, False):
        raise RuntimeError('unsafe_audit_privileges')
    tables = list(conn.execute(text('''SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id'
        AND NOT a.attisdropped) ORDER BY c.relname''')))
    if not tables or any(not enabled or not forced for _, enabled, forced in tables):
        raise RuntimeError('forced_rls_required')
    conn.execute(text('SET LOCAL ROLE sioona_runtime'))
    conn.execute(text("SELECT set_config('app.tenant_id', '', true)"))
    for table, _, _ in tables:
        quoted = conn.dialect.identifier_preparer.quote_identifier(table)
        if conn.scalar(text(f'SELECT count(*) FROM public.{quoted}')) != 0:
            raise RuntimeError('missing_tenant_context_leak')
    conn.execute(text('RESET ROLE'))
    return len(tables)


def run_upgrade():
    global _phase
    _phase = 'preflight'
    url, password = validate_inputs()
    path = _receipt_file(os.environ.get('RECEIPT_PATH', DEFAULT_RECEIPT))
    # Refuse stale success receipts; a new invocation needs a fresh destination.
    if path.exists():
        raise RuntimeError('receipt_already_exists')
    cfg = _get_alembic_config(BACKEND_DIR / 'alembic.ini')
    engine = create_engine(url, hide_parameters=True)
    try:
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '10s'"))
            conn.execute(text("SET LOCAL statement_timeout = '15min'"))
            if not conn.scalar(text('''SELECT rolsuper OR rolbypassrls FROM pg_roles
                    WHERE rolname=current_user''')):
                raise RuntimeError('owner_must_bypass_forced_rls')
            if not conn.scalar(text('SELECT pg_try_advisory_xact_lock(703034)')):
                raise RuntimeError('upgrade_already_running')
            tables = sorted(inspect(conn).get_table_names(schema='public'))
            if 'alembic_version' not in tables:
                raise RuntimeError('existing_version_required')
            # Exclusive locks avoid lock-upgrade deadlocks and protect the snapshots.
            names = ', '.join('public.' + conn.dialect.identifier_preparer.quote_identifier(t) for t in tables)
            conn.execute(text(f'LOCK TABLE {names} IN ACCESS EXCLUSIVE MODE'))
            previous = verify_revision(conn, cfg)
            tables.remove('alembic_version')
            _phase = 'pre_upgrade_snapshot'
            before = snapshot(conn, tables)
            _phase = 'migrations'
            cfg.attributes['connection'] = conn
            # Suppress Alembic output: custom migration diagnostics can carry data.
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                command.upgrade(cfg, EXPECTED_HEAD)
            if verify_revision(conn, cfg) != EXPECTED_HEAD:
                raise RuntimeError('target_revision_not_applied')
            _phase = 'preservation_check'
            after = snapshot(conn, tables)
            if before != after:
                raise RuntimeError('existing_row_identity_changed')
            _phase = 'runtime_role_and_rls'
            _provision_runtime_role(conn, password)
            tenant_tables = verify_runtime(conn)
    finally:
        engine.dispose()
    _phase = 'runtime_schema_gate_after_commit'
    runtime = _build_runtime_url(url.render_as_string(hide_password=False), password)
    saved = os.environ.get('DATABASE_URL')
    cwd = Path.cwd()
    try:
        os.environ['DATABASE_URL'] = runtime
        get_settings.cache_clear()
        os.chdir(BACKEND_DIR)
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            check_schema.main()
    finally:
        os.chdir(cwd)
        if saved is None:
            os.environ.pop('DATABASE_URL', None)
        else:
            os.environ['DATABASE_URL'] = saved
        get_settings.cache_clear()
    receipt = {
        'status': 'success', 'completed_at_utc': datetime.now(timezone.utc).isoformat(),
        'from_revision': previous, 'to_revision': EXPECTED_HEAD,
        'existing_tables_checked': len(before),
        'pre_upgrade_rows': sum(v[0] for v in before.values()),
        'post_upgrade_rows': sum(v[0] for v in after.values()),
        'primary_key_digests_match': True, 'forced_rls_tables_checked': tenant_tables,
        'audit_append_only_verified': True, 'runtime_login_verified': True,
        'schema_startup_check': 'passed',
    }
    _phase = 'receipt_after_commit'
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.op3-')
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(receipt, output, indent=2)
            output.write('\n')
        # Atomic publish without clobbering another operator receipt.
        os.link(temporary, path)
    finally:
        os.unlink(temporary)
    return receipt


def main():
    try:
        run_upgrade()
    except (Exception, SystemExit):
        print(f'OP-3 FAILED at {_phase}: no success receipt; operator investigation required. '
              'Database may already be upgraded if runtime verification or receipt publication failed.', file=sys.stderr)
        return 1
    print('OP-3 verified; counts-only receipt written. Runtime deployment switch requires operator action.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
