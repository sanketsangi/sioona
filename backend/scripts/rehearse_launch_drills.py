"""Own a throwaway PG17 cluster; never accept a database URL or provider key.

Run from backend: .venv/bin/python scripts/rehearse_launch_drills.py
Requires initdb/pg_ctl/pg_dump/pg_restore on PATH (or --pg-bin).
"""
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default=os.getenv('CB19_PG_BIN', '/opt/homebrew/opt/postgresql@17/bin' if sys.platform == 'darwin' else '/usr/lib/postgresql/17/bin'))
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--all-postgres', action='store_true', help='Also run the complete migration/RLS suite')
    args = parser.parse_args()
    binaries = Path(args.pg_bin)
    version = subprocess.check_output([str(binaries / 'postgres'), '--version'], text=True)
    if ' 17.' not in version:
        raise SystemExit('PostgreSQL 17 required')
    # Child environment is deliberately independent of shell database/provider credentials.
    env = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT')}
    env.update(DETECT_LLM='0', DATABASE_URL='sqlite+pysqlite:///:memory:', MIGRATION_DATABASE_URL='', SIOONA_ENV='development', SIOONA_ACTOR_AUTH='off', CB19_PG_BIN=str(binaries))
    with tempfile.TemporaryDirectory(prefix='sioona-cb19-') as directory:
        root = Path(directory)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        def run(*command):
            subprocess.run(list(map(str, command)), check=True, env=env, cwd=Path(__file__).resolve().parents[1])
        run(binaries / 'initdb', '-D', root / 'data', '-A', 'trust', '-U', 'sioona')
        started = False
        try:
            run(binaries / 'pg_ctl', '-D', root / 'data', '-l', root / 'postgres.log', '-o', f'-h 127.0.0.1 -p {port} -k {root}', '-w', 'start')
            started = True
            run(binaries / 'createdb', '-h', '127.0.0.1', '-p', port, '-U', 'sioona', 'sioona_migration_test')
            env['PG_TEST_DATABASE_URL'] = f'postgresql+psycopg://sioona@127.0.0.1:{port}/sioona_migration_test'
            begin = time.monotonic()
            selection = [] if args.all_postgres else ['-k', 'cb19 or fresh_and_existing_schema_upgrade']
            result = subprocess.run([sys.executable, '-m', 'pytest', 'tests/test_postgres_migrations.py', *selection, '-q', '-s', f'--junitxml={root / "results.xml"}'], env=env, cwd=Path(__file__).resolve().parents[1])
            cases = ET.parse(root / 'results.xml').findall('.//testcase')
            report = {'scope': 'local disposable PostgreSQL 17; no hosted RTO/RPO approval', 'passed': result.returncode == 0 and bool(cases), 'seconds': time.monotonic() - begin, 'drills': [{'name': c.attrib['name'], 'seconds': float(c.attrib['time']), 'passed': not any(c.find(tag) is not None for tag in ('failure', 'error', 'skipped'))} for c in cases]}
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + '\n')
            return 0 if report['passed'] and all(c['passed'] for c in report['drills']) else 1
        finally:
            if started:
                run(binaries / 'pg_ctl', '-D', root / 'data', '-m', 'immediate', '-w', 'stop')


if __name__ == '__main__':
    sys.exit(main())
