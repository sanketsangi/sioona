"""Verify CB-10 cutover guarantees in an owned disposable PostgreSQL 17 cluster.

Run from the repository root:
  backend/.venv/bin/python backend/scripts/rehearse_cb10_cutover.py --report /tmp/cb10.json

The runner never accepts a database URL and removes inherited database/provider
credentials before invoking the selected upgrade, RLS, writer and restart tests.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default=os.getenv(
        'CB10_PG_BIN',
        '/opt/homebrew/opt/postgresql@17/bin' if sys.platform == 'darwin'
        else '/usr/lib/postgresql/17/bin',
    ))
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    backend = Path(__file__).resolve().parents[1]
    binaries = Path(args.pg_bin)
    version = subprocess.check_output([str(binaries / 'postgres'), '--version'], text=True)
    if ' 17.' not in version:
        raise SystemExit('PostgreSQL 17 required')

    env = {key: value for key, value in os.environ.items()
           if key in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT')}
    env.update(
        DATABASE_URL='sqlite+pysqlite:///:memory:', MIGRATION_DATABASE_URL='',
        DETECT_LLM='0', SIOONA_ENV='development', SIOONA_ACTOR_AUTH='off',
    )
    selections = [
        ('populated_upgrade', ['tests/test_operator_production_upgrade.py']),
        ('postgres_cutover', [
            'tests/test_postgres_migrations.py', '-k',
            'cb10_concurrent_canonical_writes or '
            'concurrent_weekly_receipts_count_each_publication_once or '
            'concurrent_baseline_save_preserves_weekly_receipt or '
            'runtime_role_rls_scopes_and_forgets_context or '
            'cb11_expired_reclaim_fences_publication_completion_and_heartbeat or '
            'cb11_crash_publication_boundary_retries_only_unpublished',
        ]),
        ('restart_receipts', [
            'tests/test_weekly_upload_receipt.py', '-k',
            'restart_after_a_failed_publication_counts_once or '
            'restart_of_a_staged_publication_counts_once',
        ]),
    ]

    with tempfile.TemporaryDirectory(prefix='sioona-cb10-') as directory:
        root = Path(directory)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]

        def run(*command: object) -> None:
            subprocess.run([str(part) for part in command], check=True, env=env, cwd=backend)

        run(binaries / 'initdb', '-D', root / 'data', '-A', 'trust', '-U', 'owner',
            '--no-locale', '-E', 'UTF8')
        started = False
        cases: list[dict[str, object]] = []
        began = time.monotonic()
        passed = True
        try:
            run(binaries / 'pg_ctl', '-D', root / 'data', '-l', root / 'postgres.log',
                '-o', f'-h 127.0.0.1 -p {port} -k {root}', '-w', 'start')
            started = True
            run(binaries / 'createdb', '-h', '127.0.0.1', '-p', port, '-U', 'owner',
                'sioona_migration_test')
            env['PG_TEST_DATABASE_URL'] = (
                f'postgresql+psycopg://owner@127.0.0.1:{port}/sioona_migration_test'
            )
            for name, selection in selections:
                xml = root / f'{name}.xml'
                result = subprocess.run(
                    [sys.executable, '-m', 'pytest', *selection, '-q', f'--junitxml={xml}'],
                    env=env, cwd=backend,
                )
                group = ET.parse(xml).findall('.//testcase')
                group_passed = result.returncode == 0 and bool(group)
                passed = passed and group_passed
                cases.append({
                    'name': name,
                    'passed': group_passed,
                    'tests': len(group),
                    'failed': sum(any(case.find(tag) is not None for tag in ('failure', 'error'))
                                  for case in group),
                    'skipped': sum(case.find('skipped') is not None for case in group),
                    'seconds': sum(float(case.attrib.get('time', 0)) for case in group),
                })
                if not group_passed:
                    break
        finally:
            if started:
                run(binaries / 'pg_ctl', '-D', root / 'data', '-m', 'immediate', '-w', 'stop')

        report = {
            'scope': 'owned disposable PostgreSQL 17; no hosted target',
            'passed': passed,
            'seconds': time.monotonic() - began,
            'groups': cases,
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
        return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
