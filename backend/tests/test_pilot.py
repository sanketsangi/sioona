"""API tests for tenant pilot settings."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

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


def test_get_pilot_requires_header(client: TestClient) -> None:
    response = client.get("/v1/tenants/tenant_demo/pilot")
    assert response.status_code == 400


def test_get_pilot_mismatch_forbidden(client: TestClient) -> None:
    response = client.get(
        "/v1/tenants/tenant_a/pilot",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert response.status_code == 403


def test_get_pilot_not_found(client: TestClient) -> None:
    response = client.get(
        "/v1/tenants/tenant_demo/pilot",
        headers={"X-Tenant-Id": "tenant_demo"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "pilot_settings_not_found"


def test_put_get_upsert_stable_id(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    created = client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers=headers,
        json={
            "baseline_opportunities": 12,
            "baseline_note": "partner agreed",
            "weekly_export_count": 1,
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["tenant_id"] == "tenant_demo"
    assert body["baseline_opportunities"] == 12
    assert body["baseline_note"] == "partner agreed"
    assert body["weekly_export_count"] == 1
    pilot_id = body["id"]

    fetched = client.get("/v1/tenants/tenant_demo/pilot", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == pilot_id
    assert fetched.json()["weekly_export_count"] == 1

    updated = client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers=headers,
        json={
            "baseline_opportunities": 12,
            "baseline_note": "partner agreed",
            "weekly_export_count": 2,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["id"] == pilot_id
    assert updated.json()["weekly_export_count"] == 2


def test_put_clears_note_and_trims(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers=headers,
        json={
            "baseline_opportunities": 4,
            "baseline_note": "  keep me  ",
            "weekly_export_count": 1,
        },
    )
    cleared = client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers=headers,
        json={
            "baseline_opportunities": 4,
            "baseline_note": None,
            "weekly_export_count": 1,
        },
    )
    assert cleared.status_code == 200
    assert cleared.json()["baseline_note"] is None


def test_pilot_tenant_isolation(client: TestClient) -> None:
    client.put(
        "/v1/tenants/tenant_a/pilot",
        headers={"X-Tenant-Id": "tenant_a"},
        json={
            "baseline_opportunities": 10,
            "weekly_export_count": 3,
        },
    )
    client.put(
        "/v1/tenants/tenant_b/pilot",
        headers={"X-Tenant-Id": "tenant_b"},
        json={
            "baseline_opportunities": 1,
            "weekly_export_count": 0,
        },
    )

    a = client.get(
        "/v1/tenants/tenant_a/pilot",
        headers={"X-Tenant-Id": "tenant_a"},
    )
    b = client.get(
        "/v1/tenants/tenant_b/pilot",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert a.json()["weekly_export_count"] == 3
    assert b.json()["weekly_export_count"] == 0
    assert a.json()["baseline_opportunities"] == 10
    assert b.json()["baseline_opportunities"] == 1


def test_put_rejects_negative_baseline(client: TestClient) -> None:
    response = client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers={"X-Tenant-Id": "tenant_demo"},
        json={"baseline_opportunities": -1},
    )
    assert response.status_code == 422
