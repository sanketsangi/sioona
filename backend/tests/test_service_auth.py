"""Service token and production docs lockdown."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import Base


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db() -> Generator[Session, None, None]:
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


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
    assert denied.status_code == 403
    allowed = client.delete(
        "/v1/tenants/tenant_demo/data",
        headers={**headers, "X-Sioona-Role": "admin"},
    )
    assert allowed.status_code == 200
    get_settings.cache_clear()
