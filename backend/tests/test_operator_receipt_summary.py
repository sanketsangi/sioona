import json

from scripts.summarize_operator_receipts import main, summarize


def test_summary_never_echoes_untrusted_keys_strings_paths_or_identifiers(tmp_path, capsys):
    secret = 'private-transcript-and-dsn'
    source = tmp_path / secret
    source.write_text(json.dumps({'status': secret, 'tenant_id': secret,
        'source_sha': secret, 'schema_revision': secret,
        'verification': {'forced_rls_verified': True, secret: secret},
        'counts_cleared': {secret: 3}, 'operator_signed_off': True}))
    before = source.read_bytes()
    assert main(['--receipt', str(source)]) == 0
    output = capsys.readouterr().out
    assert secret not in output
    report = json.loads(output)['receipts'][0]
    assert report['checks']['verification.forced_rls_verified'] is True
    assert report['counts']['rows_cleared_total'] == 3
    assert report['operator_signoff'] == 'recorded_unverified'
    assert report['hosted_acceptance'] == 'requires_independent_operator_review'
    assert source.read_bytes() == before


def test_invalid_receipt_is_bounded_and_does_not_echo_path(tmp_path, capsys):
    source = tmp_path / 'secret-name'
    source.write_text('invalid secret text')
    assert main(['--receipt', str(source)]) == 1
    output = capsys.readouterr()
    assert 'secret' not in output.err and not output.out


def test_wrong_types_and_nonfinite_counts_do_not_become_evidence():
    report = summarize({'status': ['success'], 'cleanup_paused': 'true',
        'admissions_authorized': float('inf'), 'pre_upgrade_rows': True,
        'post_upgrade_rows': -1, 'operator_signed_off': 'true'})
    assert report['status'] == 'unrecorded'
    assert report['counts'] == {} and report['checks'] == {}
    assert report['operator_signoff'] == 'unrecorded'


def test_bootstrap_success_does_not_close_hosted_acceptance():
    report = summarize({'status': 'success', 'migrations': {'head_applied': '034_operational_telemetry'},
                        'synthetic_seed': {'memberships_upserted': 6}})
    assert report['schema_revision'] == '034_operational_telemetry'
    assert report['source_revision'] == 'unrecorded'
    assert report['missing_evidence']
    assert report['operator_signoff'] == 'unrecorded'
