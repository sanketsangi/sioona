"""Taxonomy override (Adapt) endpoints and service."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.taxonomy import list_taxonomy_overrides, replace_taxonomy_overrides

URL = "/v1/tenants/tenant_a/taxonomy-overrides"
HEADERS = {"X-Tenant-Id": "tenant_a"}


def test_get_is_empty_for_a_new_tenant(client: TestClient) -> None:
    response = client.get(URL, headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"tenant_id": "tenant_a", "overrides": {}}


def test_put_then_get_round_trips(client: TestClient) -> None:
    body = {
        "lead": {"phrases": ["book a demo"]},
        "retention": {
            "keywords": ["cancel"],
            "negative_phrases": ["cancel my order"],
        },
    }
    saved = client.put(URL, headers=HEADERS, json=body)
    assert saved.status_code == 200
    assert saved.json()["overrides"] == {
        "lead": {"phrases": ["book a demo"], "keywords": [], "negative_phrases": []},
        "retention": {
            "phrases": [],
            "keywords": ["cancel"],
            "negative_phrases": ["cancel my order"],
        },
    }
    assert client.get(URL, headers=HEADERS).json() == saved.json()


def test_put_replaces_the_previous_snapshot(client: TestClient) -> None:
    client.put(URL, headers=HEADERS, json={"lead": {"phrases": ["a"]}})
    client.put(URL, headers=HEADERS, json={"upsell": {"keywords": ["upgrade"]}})
    overrides = client.get(URL, headers=HEADERS).json()["overrides"]
    assert list(overrides) == ["upsell"]


def test_put_empty_body_clears_all_overrides(client: TestClient) -> None:
    client.put(URL, headers=HEADERS, json={"lead": {"phrases": ["a"]}})
    cleared = client.put(URL, headers=HEADERS, json={})
    assert cleared.status_code == 200
    assert cleared.json()["overrides"] == {}


def test_overrides_are_scoped_per_tenant(client: TestClient) -> None:
    client.put(URL, headers=HEADERS, json={"lead": {"phrases": ["a"]}})
    other = client.get(
        "/v1/tenants/tenant_b/taxonomy-overrides",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert other.json()["overrides"] == {}


def test_header_must_be_present_and_match_path(client: TestClient) -> None:
    assert client.get(URL).status_code == 400
    mismatch = client.get(URL, headers={"X-Tenant-Id": "tenant_b"})
    assert mismatch.status_code == 403
    put_mismatch = client.put(URL, headers={"X-Tenant-Id": "tenant_b"}, json={})
    assert put_mismatch.status_code == 403


def test_put_rejects_a_non_object_type_payload(client: TestClient) -> None:
    response = client.put(URL, headers=HEADERS, json={"lead": ["not", "an", "object"]})
    assert response.status_code == 422


def test_service_trims_dedupes_and_drops_blank_terms(db: Session) -> None:
    saved = replace_taxonomy_overrides(
        db,
        tenant_id="tenant_a",
        overrides={
            "lead": {"phrases": ["  hello ", "hello", "", "   ", 7, "world"]},
        },
    )
    assert saved["lead"]["phrases"] == ["hello", "world"]


def test_service_accepts_camel_case_negative_phrases(db: Session) -> None:
    saved = replace_taxonomy_overrides(
        db,
        tenant_id="tenant_a",
        overrides={"retention": {"negativePhrases": ["not leaving"]}},
    )
    assert saved["retention"]["negative_phrases"] == ["not leaving"]


def test_service_skips_unknown_types_and_all_empty_rows(db: Session) -> None:
    saved = replace_taxonomy_overrides(
        db,
        tenant_id="tenant_a",
        overrides={
            "support": {"phrases": ["x"]},
            "lead": {"phrases": [], "keywords": ["  "]},
            "upsell": "nope",
        },
    )
    assert saved == {}
    assert list_taxonomy_overrides(db, "tenant_a") == {}
