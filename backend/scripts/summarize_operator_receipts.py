"""Read explicitly supplied JSON receipts; emit allowlisted aggregate evidence only.

No database, environment credentials, network, or drill execution is used.
Exit 0 means parsing succeeded, never hosted acceptance.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import re
import sys

MAX_BYTES = 1024 * 1024
# Keys are fixed in source: untrusted receipt keys and arbitrary strings never echo.
BOOL_FIELDS = (
    'preflight.zero_row_baseline_verified', 'migrations.target_head_verified',
    'runtime_role.configured', 'verification.forced_rls_verified',
    'verification.missing_context_denial_verified', 'verification.tenant_ab_isolation_verified',
    'verification.connection_reuse_safety_verified', 'verification.audit_append_only_verified',
    'primary_key_digests_match', 'audit_append_only_verified', 'runtime_login_verified',
    'cleanup_paused', 'controls.start_control_executed', 'controls.end_control_executed',
    'journeys.fresh_assertion_check_executed', 'journeys.browser_session_expiry_verified',
    'journeys.demo_reset_completed', 'revocation.live_db_membership_revocation_tested',
    'persisted_review.feedback_persisted', 'persisted_review.draft_approval_persisted',
    'browser_session.unauthenticated_api_denied',
)
COUNT_FIELDS = (
    'synthetic_seed.memberships_upserted', 'verification.forced_rls_tables_count',
    'existing_tables_checked', 'pre_upgrade_rows', 'post_upgrade_rows',
    'forced_rls_tables_checked', 'admissions_authorized', 'provider_dispatch_paths_invoked',
    'daily_attempt_limit', 'run_attempt_limit', 'duration_seconds',
    'checks.tenant_pause_seconds', 'checks.global_pause_seconds',
    'journeys.journeys_completed', 'safety.models_called', 'safety.external_messages_sent',
    'persisted_review.models_called', 'persisted_review.external_messages_sent', 'steps_executed',
)
STATUS_VALUES = {'success', 'succeeded', 'failed', 'pending_operator_verification'}
REVISION_VALUES = {'024_tenant_rls', '034_operational_telemetry'}


def get_path(receipt: dict, field: str):
    value = receipt
    for key in field.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def revision(value):
    if isinstance(value, str) and (re.fullmatch(r'[a-f0-9]{40}', value) or value in REVISION_VALUES):
        return value
    return 'unrecorded'


def summarize(receipt: dict) -> dict:
    checks = {field: get_path(receipt, field) for field in BOOL_FIELDS
              if type(get_path(receipt, field)) is bool}
    counts = {field: get_path(receipt, field) for field in COUNT_FIELDS
              if type(get_path(receipt, field)) in (int, float)
              and math.isfinite(get_path(receipt, field)) and 0 <= get_path(receipt, field) <= 10**15}
    # Lifecycle receipts contain table-keyed dictionaries: expose totals only.
    cleared = receipt.get('counts_cleared')
    if isinstance(cleared, dict) and all(type(v) is int and 0 <= v <= 10**12 for v in cleared.values()):
        counts['rows_cleared_total'] = sum(cleared.values())
    status = receipt.get('status')
    return {
        'status': status if isinstance(status, str) and status in STATUS_VALUES else 'unrecorded',
        'source_revision': revision(receipt.get('source_sha')),
        'schema_revision': revision(receipt.get('to_revision', get_path(receipt, 'migrations.head_applied'))),
        'checks': checks, 'counts': counts,
        'missing_evidence': [field for field in BOOL_FIELDS if get_path(receipt, field) is None],
        'operator_signoff': 'recorded_unverified' if receipt.get('operator_signed_off') is True else 'unrecorded',
        'hosted_acceptance': 'requires_independent_operator_review',
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', required=True, action='append', type=Path,
                        help='Explicit local receipt; repeat to summarize multiple receipts')
    args = parser.parse_args(argv)
    results = []
    for index, path in enumerate(args.receipt, 1):
        try:
            with path.open('rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('too_large')
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError('not_object')
            results.append({'receipt_index': index, **summarize(data)})
        except (OSError, ValueError, RecursionError, OverflowError):
            # File names and parsing diagnostics can contain secrets.
            print(json.dumps({'receipt_index': index, 'error': 'receipt_unreadable_or_invalid'}), file=sys.stderr)
            return 1
    print(json.dumps({'receipts': results, 'notice': 'Recorded evidence only; no hosted gate is automatically accepted.'}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
