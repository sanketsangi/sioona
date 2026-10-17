from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from scripts.validate_infrastructure import (
    validate_service_invariants,
    validate_staging_blueprint,
)


@pytest.mark.parametrize(
    "service_name",
    [
        "sioona-site",
        "sioona-web",
        "sioona-api",
        "sioona-detection-worker",
        "sioona-ingestion-recovery",
    ],
)
@pytest.mark.parametrize("replacement", ["on", None])
def test_every_service_requires_autodeploy_off(service_name, replacement):
    blueprint = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "render.yaml").read_text()
    )
    candidate = deepcopy(blueprint)
    service = next(item for item in candidate["services"] if item["name"] == service_name)
    if replacement is None:
        service.pop("autoDeployTrigger")
    else:
        service["autoDeployTrigger"] = replacement

    with pytest.raises(AssertionError):
        validate_service_invariants(candidate)


def test_staging_blueprint_invariants():
    staging_path = Path(__file__).resolve().parents[2] / "infra" / "staging" / "render.yaml"
    blueprint = yaml.safe_load(staging_path.read_text())

    assert not blueprint.get("databases")

    # Service inventory: web and api only; worker, cron, site omitted
    services = {service["name"]: service for service in blueprint["services"]}
    assert set(services) == {"sioona-web-staging", "sioona-api-staging"}

    validate_staging_blueprint(blueprint)


@pytest.mark.parametrize("service_name", ["sioona-web-staging", "sioona-api-staging"])
@pytest.mark.parametrize("replacement", ["on", None])
def test_staging_service_requires_autodeploy_off(service_name, replacement):
    staging_path = Path(__file__).resolve().parents[2] / "infra" / "staging" / "render.yaml"
    blueprint = yaml.safe_load(staging_path.read_text())
    candidate = deepcopy(blueprint)
    service = next(item for item in candidate["services"] if item["name"] == service_name)
    if replacement is None:
        service.pop("autoDeployTrigger", None)
    else:
        service["autoDeployTrigger"] = replacement

    with pytest.raises(AssertionError):
        validate_staging_blueprint(candidate)


@pytest.mark.parametrize(
    "bad_start_command",
    [
        "exec uvicorn app.main:app --host 0.0.0.0 --port $PORT",
        "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
        "python -m scripts.run && exec uvicorn app.main:app",
    ],
)
def test_staging_api_requires_check_schema(bad_start_command):
    staging_path = Path(__file__).resolve().parents[2] / "infra" / "staging" / "render.yaml"
    blueprint = yaml.safe_load(staging_path.read_text())
    candidate = deepcopy(blueprint)
    service = next(item for item in candidate["services"] if item["name"] == "sioona-api-staging")
    service["startCommand"] = bad_start_command

    with pytest.raises(AssertionError):
        validate_staging_blueprint(candidate)


@pytest.mark.parametrize(
    ("service_name", "secret_key", "mutation"),
    [
        ("sioona-web-staging", "AUTH_SECRET", {"value": "leaked_secret"}),
        ("sioona-web-staging", "AUTH_SECRET", {"sync": True}),
        ("sioona-web-staging", "SIOONA_SERVICE_TOKEN", {"value": "leaked_token"}),
        ("sioona-web-staging", "SIOONA_PILOT_USERS", {"value": "admin@example.com"}),
        ("sioona-web-staging", "SIOONA_IDENTITY_KEY", {"value": "leaked_key"}),
        ("sioona-web-staging", "SIOONA_ACTOR_KEY", {"value": "leaked_key"}),
        ("sioona-api-staging", "DATABASE_URL", {"value": "postgresql://leaked"}),
        ("sioona-api-staging", "MIGRATION_DATABASE_URL", {"value": "postgresql://leaked"}),
        ("sioona-api-staging", "MIGRATION_DATABASE_URL", {"sync": True}),
        ("sioona-api-staging", "SIOONA_SERVICE_TOKEN", {"value": "leaked_token"}),
        ("sioona-api-staging", "SIOONA_ACTOR_KEY", {"value": "leaked_key"}),
    ],
)
def test_staging_rejects_leaked_secret_values(service_name, secret_key, mutation):
    staging_path = Path(__file__).resolve().parents[2] / "infra" / "staging" / "render.yaml"
    blueprint = yaml.safe_load(staging_path.read_text())
    candidate = deepcopy(blueprint)
    service = next(item for item in candidate["services"] if item["name"] == service_name)
    var = next(item for item in service["envVars"] if item["key"] == secret_key)
    var.update(mutation)

    with pytest.raises(AssertionError):
        validate_staging_blueprint(candidate)


@pytest.mark.parametrize("mutation", ["database", "paid_api", "database_binding", "unsafe_control"])
def test_staging_preserves_operator_target_and_controls(mutation):
    blueprint = yaml.safe_load(
        (Path(__file__).resolve().parents[2] / "infra/staging/render.yaml").read_text()
    )
    api = next(s for s in blueprint["services"] if s["name"] == "sioona-api-staging")
    if mutation == "database":
        blueprint["databases"] = [{"name": "sioona-staging-db"}]
    elif mutation == "paid_api":
        api["plan"] = "0.5c-512mb"
    elif mutation == "database_binding":
        var = next(v for v in api["envVars"] if v["key"] == "DATABASE_URL")
        var["fromDatabase"] = {"name": "sioona-staging-db", "property": "connectionString"}
    else:
        var = next(v for v in api["envVars"] if v["key"] == "SIOONA_EXTERNAL_ACTIONS_ENABLED")
        var["value"] = "1"
    with pytest.raises(AssertionError):
        validate_staging_blueprint(blueprint)
