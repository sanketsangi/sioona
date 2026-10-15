from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from scripts.validate_infrastructure import validate_service_invariants


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
