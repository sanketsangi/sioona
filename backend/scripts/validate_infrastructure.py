"""Local blueprint validation. Requires PyYAML + jsonschema in a tooling venv.

Download https://render.com/schema/render.yaml.json separately, then:
python backend/scripts/validate_infrastructure.py --schema /path/to/render.schema.json
This script does not contact providers or apply infrastructure.
"""
import argparse
import json
from pathlib import Path
import yaml


def validate_service_invariants(blueprint):
    services = {service['name']: service for service in blueprint['services']}
    assert set(services) == {'sioona-site', 'sioona-web', 'sioona-api', 'sioona-detection-worker', 'sioona-ingestion-recovery'}
    for service in services.values():
        assert 'alembic upgrade' not in service['startCommand']
        assert service.get('autoDeployTrigger') == 'off'
        if service['type'] != 'cron':
            assert service['maxShutdownDelaySeconds'] >= 120
        if service['type'] == 'web':
            assert service['healthCheckPath'].startswith('/')
        if service['runtime'] == 'python':
            assert service['startCommand'].startswith('python -m scripts.check_schema && exec ')
        for var in service.get('envVars', []):
            if any(word in var['key'] for word in ('SECRET', 'TOKEN', 'KEY', 'DATABASE_URL', 'USERS')):
                assert var.get('sync') is False and 'value' not in var, var['key']


def validate_staging_blueprint(blueprint):
    assert not blueprint.get('databases'), 'Staging uses operator-bootstrapped Neon'

    services = {service['name']: service for service in blueprint['services']}
    assert set(services) == {'sioona-web-staging', 'sioona-api-staging'}
    assert services['sioona-api-staging'].get('plan') == 'free'
    api_vars = {var['key']: var for var in services['sioona-api-staging'].get('envVars', [])}
    assert api_vars['DATABASE_URL'] == {'key': 'DATABASE_URL', 'sync': False}
    for service in services.values():
        env = {var['key']: var for var in service.get('envVars', [])}
        for key in ('DETECT_LLM', 'LIVE_INGEST', 'SIOONA_EXTERNAL_ACTIONS_ENABLED'):
            assert env[key].get('value') == '0', key
        assert 'alembic upgrade' not in service.get('startCommand', '')
        assert service.get('autoDeployTrigger') == 'off'
        assert service.get('maxShutdownDelaySeconds', 0) >= 120
        assert service.get('healthCheckPath', '').startswith('/')
        if service.get('runtime') == 'python':
            assert service.get('startCommand', '').startswith('python -m scripts.check_schema && exec ')
        for var in service.get('envVars', []):
            if any(word in var['key'] for word in ('SECRET', 'TOKEN', 'KEY', 'USERS', 'MIGRATION_DATABASE_URL')):
                assert var.get('sync') is False and 'value' not in var, var['key']
            if var['key'] == 'DATABASE_URL':
                assert ('fromDatabase' in var or var.get('sync') is False) and 'value' not in var, var['key']


def main():
    import jsonschema

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema', required=True, type=Path)
    args = parser.parse_args()
    schema = json.loads(args.schema.read_text())
    validator = jsonschema.Draft202012Validator(schema)

    repo_root = Path(__file__).resolve().parents[2]

    prod_blueprint = yaml.safe_load((repo_root / 'render.yaml').read_text())
    validator.validate(prod_blueprint)
    validate_service_invariants(prod_blueprint)

    staging_blueprint = yaml.safe_load((repo_root / 'infra' / 'staging' / 'render.yaml').read_text())
    validator.validate(staging_blueprint)
    validate_staging_blueprint(staging_blueprint)

    print('Render schema and local launch invariants valid')


if __name__ == '__main__':
    main()
