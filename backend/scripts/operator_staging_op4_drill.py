"""Human-run OP-4 HTTP admission drill; no provider dispatch or database credentials.

Requires an exclusive staging window, DETECT_LLM=0, deployed providers disabled,
admin@staging.test membership and SIOONA_GLOBAL_CONTROL_TENANT=tenant_staging_a.
Consumes 500 synthetic admissions; preserves ledger/budgets and leaves AI paused.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
import signal
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit
import uuid
from zoneinfo import ZoneInfo

import httpx

from scripts.run_shadow_observation import sign_actor_token

RECEIPT = Path(__file__).resolve().parents[2] / 'docs/development/evidence/staging-op4-drill-receipt.json'
TENANT = 'tenant_staging_a'
DAILY, RUN, CONTENDERS = 500, 120, 8


class DrillError(RuntimeError):
    """Bounded diagnostic; never attach response bodies or driver exceptions."""


class Drill:
    def __init__(self, base_url, token, key, receipt=RECEIPT, *, request=None):
        parsed = urlsplit(base_url)
        loopback = parsed.hostname in ('localhost', '127.0.0.1', '::1')
        if (parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ('', '/')
                or not ((parsed.scheme == 'https' and parsed.hostname == 'sioona-api-staging.onrender.com' and parsed.port in (None, 443))
                        or (loopback and parsed.scheme == 'http'))):
            raise DrillError('invalid_staging_origin')
        if not token.strip() or len(key.strip()) < 32:
            raise DrillError('missing_or_invalid_credentials')
        self.url, self.token, self.key = base_url.rstrip('/'), token, key
        self.path, self.request = Path(receipt), request or httpx.request
        self.prefix = 'op4_' + uuid.uuid4().hex
        self.lock = threading.Lock()
        self.accepted = 0
        self.day = self.budget_day()
        self.report = {
            'receipt_version': 1, 'started_at_utc': datetime.now(timezone.utc).isoformat(),
            'status': 'failed', 'budget_timezone': 'Asia/Kolkata',
            'daily_attempt_limit': DAILY, 'run_attempt_limit': RUN,
            'budget_day': self.day.isoformat(),
            'admissions_authorized': 0, 'checks': {}, 'cleanup_paused': False,
            'provider_dispatch_paths_invoked': 0,
            'acceptance_pending': ['operator deployed configuration and target evidence',
                'application cache/worker propagation, outage recovery and alert delivery',
                'provider/ledger reconciliation and operator sign-off'],
        }

    @staticmethod
    def budget_day():
        return datetime.now(ZoneInfo('Asia/Kolkata')).date()

    def call(self, method, suffix, body=None):
        if method == 'POST' and self.budget_day() != self.day:
            raise DrillError('budget_day_changed')
        headers = {'Authorization': 'Bearer ' + self.token, 'X-Tenant-Id': TENANT,
                   'X-Sioona-Role': 'admin',  # Legacy shadow guard; handlers still verify membership.
                   'X-Sioona-Actor': sign_actor_token('admin@staging.test', TENANT, self.key)}
        try:
            return self.request(method, self.url + '/v1/tenants/' + TENANT + suffix,
                                headers=headers, json=body, timeout=10, follow_redirects=False)
        except Exception:
            raise DrillError('transport_failed') from None

    def control(self, enabled, *, global_scope=False):
        res = self.call('PUT', '/inference-controls' + ('/global' if global_scope else ''), {
            'enabled': enabled, 'daily_attempt_limit': DAILY, 'run_attempt_limit': RUN,
            'reason': 'operator_staging_op4_drill',
        })
        if res.status_code != 200 or res.json().get('ok') is not True:
            raise DrillError('control_write_failed')

    def admit(self, run):
        uid = 'op4_' + uuid.uuid4().hex
        res = self.call('POST', '/inference-reservations', {
            'attempt_id': uid, 'run_id': run, 'provider': 'groq', 'model': 'op4-no-dispatch',
            'logical_operation_id': uid, 'attempt_ordinal': 1,
            'route_version': 'op4-admission-only', 'prompt_version': 'op4-no-prompt',
        })
        try:
            body = res.json()
            if res.status_code == 200 and body.get('authorized') is True and body.get('attempt_id') == uid:
                with self.lock:
                    self.accepted += 1
                return 'authorized'
            if res.status_code == 409 and body.get('detail') in ('paused', 'daily_limit', 'run_limit'):
                return body['detail']
        except (ValueError, AttributeError):
            pass
        raise DrillError('unexpected_admission_response')

    def expect(self, run, expected):
        if self.admit(run) != expected:
            raise DrillError('unexpected_admission_outcome')

    def pause(self, global_scope):
        # Establish admission immediately before committing each pause.
        self.expect(self.prefix + '_baseline', 'authorized')
        started = time.monotonic()
        self.control(False, global_scope=global_scope)
        while True:
            result = self.admit(self.prefix + '_pause')
            elapsed = time.monotonic() - started
            if elapsed > 60:
                raise DrillError('pause_deadline_exceeded')
            if result == 'paused':
                return round(elapsed, 3)
            if result != 'authorized':
                raise DrillError('pause_not_verified')
            time.sleep(1)

    def race(self, run, denial):
        barrier = threading.Barrier(CONTENDERS)
        def contender(_):
            barrier.wait(timeout=15)
            return self.admit(run)
        with ThreadPoolExecutor(max_workers=CONTENDERS) as pool:
            results = list(pool.map(contender, range(CONTENDERS)))
        if results.count('authorized') != 1 or results.count(denial) != CONTENDERS - 1:
            raise DrillError('concurrent_admission_mismatch')
        return {'contenders': CONTENDERS, 'authorized': 1, 'denied': CONTENDERS - 1}

    def execute(self):
        # Existing evidence must never masquerade as the result of this invocation.
        if self.path.exists():
            raise DrillError('receipt_exists_choose_new_path')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.control(True, global_scope=True)
            self.control(True)
            self.report['checks']['tenant_pause_seconds'] = self.pause(False)
            self.control(True)
            self.report['checks']['global_pause_seconds'] = self.pause(True)
            self.control(True, global_scope=True)
            run = self.prefix + '_run_race'
            for _ in range(RUN - 1):
                self.expect(run, 'authorized')
            self.report['checks']['run_last_slot'] = self.race(run, 'run_limit')
            self.expect(run, 'run_limit')
            while self.accepted < DAILY - 1:
                self.expect('op4_' + uuid.uuid4().hex, 'authorized')
            self.report['checks']['daily_last_slot'] = self.race(self.prefix + '_daily_race', 'daily_limit')
            self.expect(self.prefix + '_exhausted', 'daily_limit')
            if self.accepted != DAILY:
                raise DrillError('daily_count_mismatch')
            self.report['status'] = 'pending_operator_verification'
        finally:
            # Try both independently, including after failed or ambiguous requests.
            paused = []
            for global_scope in (True, False):
                try:
                    self.control(False, global_scope=global_scope)
                    paused.append(True)
                except Exception:
                    paused.append(False)
            self.report['cleanup_paused'] = all(paused)
            if not all(paused):
                self.report['status'] = 'failed'
            self.report['admissions_authorized'] = self.accepted
            self.report['ended_at_utc'] = datetime.now(timezone.utc).isoformat()
            # Exclusive creation prevents overwriting an earlier operator receipt.
            with self.path.open('x') as output:
                output.write(json.dumps(self.report, indent=2) + '\n')
        if self.report['status'] == 'failed':
            raise DrillError('cleanup_failed_verify_pauses_manually')
        return self.report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://sioona-api-staging.onrender.com')
    parser.add_argument('--receipt', type=Path, default=RECEIPT)
    parser.add_argument('--approved-staging-drill', action='store_true')
    parser.add_argument('--confirmed-provider-disabled', action='store_true')
    args = parser.parse_args(argv)
    try:
        if not args.approved_staging_drill or not args.confirmed_provider_disabled or os.getenv('DETECT_LLM') != '0':
            raise DrillError('operator_approval_and_provider_disabled_required')
        drill = Drill(args.base_url, os.getenv('SIOONA_SERVICE_TOKEN', ''), os.getenv('SIOONA_ACTOR_KEY', ''), args.receipt)
        drill.execute()
    except Exception:
        print('OP-4 drill failed; inspect counts-only receipt and verify global/tenant pauses. No exception details emitted.')
        return 1
    print('OP-4 admission checks completed; operator reconciliation and sign-off remain required.')
    return 0


def _terminate(_signum, _frame):
    raise DrillError('operator_terminated')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, _terminate)
    raise SystemExit(main())
