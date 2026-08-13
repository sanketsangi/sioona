"""API smoke tests for Signal Score routes."""

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


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_prediction_feedback_and_score_flow(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}

    created = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "conv_1",
            "signal_type": "lead",
            "confidence": 0.91,
            "summary": "Clear buying intent",
        },
    )
    assert created.status_code == 201
    signal_id = created.json()["id"]

    needs = client.get(
        "/v1/tenants/tenant_demo/signals/needs-review",
        headers=headers,
    )
    assert needs.status_code == 200
    assert len(needs.json()) == 1

    feedback = client.post(
        f"/v1/signals/{signal_id}/feedback",
        headers=headers,
        json={"feedback": "correct", "reviewed_by": "reviewer_1"},
    )
    assert feedback.status_code == 200
    assert feedback.json()["feedback"] == "correct"

    score = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers=headers,
    )
    assert score.status_code == 200
    body = score.json()
    assert body["reviewed_count"] == 1
    assert body["correct_count"] == 1
    assert body["signal_score"] == 1.0
    assert body["by_signal_type"][0]["signal_type"] == "lead"
    assert body["by_signal_type"][0]["signal_score"] == 1.0

    # Second prediction marked incorrect → overall score moves to 0.5
    created2 = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "conv_2",
            "signal_type": "upsell",
            "confidence": 0.7,
            "summary": "Weak upsell guess",
        },
    )
    assert created2.status_code == 201
    signal_id_2 = created2.json()["id"]

    feedback2 = client.post(
        f"/v1/signals/{signal_id_2}/feedback",
        headers=headers,
        json={"feedback": "incorrect", "reviewed_by": "reviewer_1"},
    )
    assert feedback2.status_code == 200

    score2 = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers=headers,
    )
    assert score2.status_code == 200
    body2 = score2.json()
    assert body2["reviewed_count"] == 2
    assert body2["correct_count"] == 1
    assert body2["incorrect_count"] == 1
    assert body2["signal_score"] == 0.5
    by_type = {row["signal_type"]: row for row in body2["by_signal_type"]}
    assert by_type["lead"]["signal_score"] == 1.0
    assert by_type["lead"]["reviewed_count"] == 1
    assert by_type["upsell"]["signal_score"] == 0.0
    assert by_type["upsell"]["incorrect_count"] == 1


def test_missing_tenant_header(client: TestClient) -> None:
    response = client.get("/v1/tenants/tenant_demo/signal-score")
    assert response.status_code == 400


def test_tenant_mismatch_forbidden(client: TestClient) -> None:
    response = client.get(
        "/v1/tenants/tenant_a/signal-score",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert response.status_code == 403


def test_prediction_upsert_same_conversation_and_type(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    first = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "conv_upsert",
            "signal_type": "retention",
            "confidence": 0.4,
            "summary": "Maybe leaving",
        },
    )
    assert first.status_code == 201
    signal_id = first.json()["id"]

    second = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "conv_upsert",
            "signal_type": "retention",
            "confidence": 0.81,
            "summary": "High churn risk — closing account",
        },
    )
    assert second.status_code == 201
    assert second.json()["id"] == signal_id
    assert second.json()["confidence"] == 0.81
    assert second.json()["summary"] == "High churn risk — closing account"

    needs = client.get(
        "/v1/tenants/tenant_demo/signals/needs-review",
        headers=headers,
        params={"limit": 100},
    )
    assert needs.status_code == 200
    matches = [
        row
        for row in needs.json()
        if row["conversation_id"] == "conv_upsert" and row["signal_type"] == "retention"
    ]
    assert len(matches) == 1
    assert matches[0]["id"] == signal_id
