"""Signal outcome persistence and revenue totals."""

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


def _predict(client: TestClient, conversation_id: str, signal_type: str) -> str:
    created = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_revenue"},
        json={
            "conversation_id": conversation_id,
            "signal_type": signal_type,
            "confidence": 0.8,
            "summary": signal_type,
        },
    )
    assert created.status_code == 201
    return created.json()["id"]


def test_outcome_round_trip_and_revenue(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_revenue"}
    retained = _predict(client, "conv_ret", "retention")
    saved = client.post(
        f"/v1/signals/{retained}/outcome",
        headers=headers,
        json={"outcome": "retained", "value_inr": 12000, "recorded_on": "2026-09-01"},
    )
    assert saved.status_code == 200
    assert saved.json()["outcome"] == "retained"
    assert saved.json()["outcome_value_inr"] == 12000

    converted = _predict(client, "conv_lead", "lead")
    churned = _predict(client, "conv_gone", "retention")
    quiet = _predict(client, "conv_same", "upsell")
    assert (
        client.post(
            f"/v1/signals/{converted}/outcome",
            headers=headers,
            json={"outcome": "converted", "value_inr": 5000},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/v1/signals/{churned}/outcome",
            headers=headers,
            json={"outcome": "churned", "value_inr": 8000},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/v1/signals/{quiet}/outcome",
            headers=headers,
            json={"outcome": "no_change", "value_inr": 999},
        ).status_code
        == 200
    )

    api = client.get("/v1/tenants/tenant_revenue/signal-score", headers=headers)
    assert api.status_code == 200
    payload = api.json()
    assert payload["revenue_at_risk_found_inr"] == 20000
    assert payload["revenue_saved_inr"] == 17000


def test_outcome_rejects_unknown_label(client: TestClient) -> None:
    signal_id = _predict(client, "conv_bad", "lead")
    response = client.post(
        f"/v1/signals/{signal_id}/outcome",
        headers={"X-Tenant-Id": "tenant_revenue"},
        json={"outcome": "won"},
    )
    assert response.status_code == 422
