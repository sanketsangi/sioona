"""Service token and production docs lockdown."""

from fastapi.testclient import TestClient

from app.config import get_settings


def test_health_stays_open_when_token_is_set(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "shared-secret")
    monkeypatch.setenv("SIOONA_ENV", "development")
    get_settings.cache_clear()
    assert client.get("/health").status_code == 200
    denied = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers={"X-Tenant-Id": "tenant_demo"},
    )
    assert denied.status_code == 401
    allowed = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers={
            "X-Tenant-Id": "tenant_demo",
            "Authorization": "Bearer shared-secret",
        },
    )
    assert allowed.status_code == 200
    get_settings.cache_clear()


def test_docs_hidden_in_production(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("SIOONA_ENV", "production")
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "shared-secret")
    get_settings.cache_clear()
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    get_settings.cache_clear()


def test_production_without_token_fails_closed(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("SIOONA_ENV", "production")
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "")
    get_settings.cache_clear()
    response = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers={"X-Tenant-Id": "tenant_demo"},
    )
    assert response.status_code == 503
    get_settings.cache_clear()


def test_wipe_requires_admin_role_when_token_is_set(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setenv("SIOONA_SERVICE_TOKEN", "shared-secret")
    monkeypatch.setenv("SIOONA_ENV", "development")
    get_settings.cache_clear()
    headers = {
        "X-Tenant-Id": "tenant_demo",
        "Authorization": "Bearer shared-secret",
    }
    denied = client.delete("/v1/tenants/tenant_demo/data", headers=headers)
    assert denied.status_code in {401, 503}
    allowed = client.delete(
        "/v1/tenants/tenant_demo/data",
        headers={**headers, "X-Sioona-Role": "admin"},
    )
    assert allowed.status_code in {401, 503}
    get_settings.cache_clear()
