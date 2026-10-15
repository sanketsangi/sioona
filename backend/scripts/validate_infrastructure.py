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


def main():
    import jsonschema

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--schema', required=True, type=Path)
    args = parser.parse_args()
    blueprint = yaml.safe_load((Path(__file__).resolve().parents[2] / 'render.yaml').read_text())
    jsonschema.Draft202012Validator(json.loads(args.schema.read_text())).validate(blueprint)
    validate_service_invariants(blueprint)
    print('Render schema and local launch invariants valid')


if __name__ == '__main__':
    main()
