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


def test_conversation_bulk_upsert_and_tenant_isolation(client: TestClient) -> None:
    payload = {
        "conversations": [
            {
                "conversation_id": "conv_priya",
                "channel": "whatsapp",
                "customer_name": "Priya",
                "started_at": "2026-08-01T10:00:00+00:00",
                "external_id": "priya_sharma_22",
                "messages": [
                    {
                        "message_id": "msg_conv_priya_0",
                        "role": "customer",
                        "content": "I want to close my account",
                        "timestamp": "2026-08-01T10:00:00+00:00",
                    }
                ],
            }
        ]
    }

    created = client.post(
        "/v1/conversations/bulk",
        headers={"X-Tenant-Id": "tenant_a"},
        json=payload,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["created"] == 1
    assert body["updated"] == 0
    assert body["messages_created"] == 1
    conv_pk = body["conversations"][0]["id"]
    msg_pk = body["conversations"][0]["messages"][0]["id"]

    updated = client.post(
        "/v1/conversations/bulk",
        headers={"X-Tenant-Id": "tenant_a"},
        json={
            "conversations": [
                {
                    **payload["conversations"][0],
                    "channel": "intercom",
                    "messages": [
                        {
                            **payload["conversations"][0]["messages"][0],
                            "content": "Still closing — follow up",
                        }
                    ],
                }
            ]
        },
    )
    assert updated.status_code == 201
    again = updated.json()
    assert again["created"] == 0
    assert again["updated"] == 1
    assert again["messages_updated"] == 1
    assert again["conversations"][0]["id"] == conv_pk
    assert again["conversations"][0]["channel"] == "intercom"
    assert again["conversations"][0]["messages"][0]["id"] == msg_pk
    assert again["conversations"][0]["messages"][0]["content"] == "Still closing — follow up"

    other = client.post(
        "/v1/conversations/bulk",
        headers={"X-Tenant-Id": "tenant_b"},
        json=payload,
    )
    assert other.status_code == 201
    assert other.json()["created"] == 1
    assert other.json()["conversations"][0]["id"] != conv_pk

    listed_a = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers={"X-Tenant-Id": "tenant_a"},
    )
    assert listed_a.status_code == 200
    assert len(listed_a.json()) == 1
    assert listed_a.json()[0]["tenant_id"] == "tenant_a"
    assert listed_a.json()[0]["id"] == conv_pk

    listed_b = client.get(
        "/v1/tenants/tenant_b/conversations",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert listed_b.status_code == 200
    assert len(listed_b.json()) == 1
    assert listed_b.json()[0]["tenant_id"] == "tenant_b"

    leaked = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert leaked.status_code == 403


def test_conversation_upsert_requires_tenant_header(client: TestClient) -> None:
    response = client.post(
        "/v1/conversations",
        json={
            "conversation_id": "conv_1",
            "channel": "upload",
            "started_at": "2026-08-01T10:00:00+00:00",
            "messages": [],
        },
    )
    assert response.status_code == 400


def test_conversation_rejects_invalid_role(client: TestClient) -> None:
    response = client.post(
        "/v1/conversations",
        headers={"X-Tenant-Id": "tenant_demo"},
        json={
            "conversation_id": "conv_1",
            "channel": "upload",
            "started_at": "2026-08-01T10:00:00+00:00",
            "messages": [
                {
                    "message_id": "msg_1",
                    "role": "bot",
                    "content": "nope",
                    "timestamp": "2026-08-01T10:00:00+00:00",
                }
            ],
        },
    )
    assert response.status_code == 422


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


def test_tenant_signals_include_feedback_and_isolate_tenants(
    client: TestClient,
) -> None:
    created_a = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_a"},
        json={
            "conversation_id": "conv_a",
            "signal_type": "retention",
            "confidence": 0.8,
            "summary": "Churn risk",
        },
    )
    assert created_a.status_code == 201
    signal_a = created_a.json()["id"]
    assert created_a.json()["acted"] is False

    created_b = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_b"},
        json={
            "conversation_id": "conv_b",
            "signal_type": "lead",
            "confidence": 0.7,
            "summary": "Buying intent",
        },
    )
    assert created_b.status_code == 201
    signal_b = created_b.json()["id"]

    feedback_a = client.post(
        f"/v1/signals/{signal_a}/feedback",
        headers={"X-Tenant-Id": "tenant_a"},
        json={
            "feedback": "correct",
            "reviewed_by": "reviewer_1",
            "note": "clear churn",
        },
    )
    assert feedback_a.status_code == 200

    listed_a = client.get(
        "/v1/tenants/tenant_a/signals",
        headers={"X-Tenant-Id": "tenant_a"},
    )
    assert listed_a.status_code == 200
    rows_a = listed_a.json()
    assert len(rows_a) == 1
    assert rows_a[0]["id"] == signal_a
    assert rows_a[0]["tenant_id"] == "tenant_a"
    assert rows_a[0]["conversation_id"] == "conv_a"
    assert rows_a[0]["signal_type"] == "retention"
    assert rows_a[0]["feedback"]["feedback"] == "correct"
    assert rows_a[0]["feedback"]["note"] == "clear churn"
    assert rows_a[0]["acted"] is False

    listed_b = client.get(
        "/v1/tenants/tenant_b/signals",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert listed_b.status_code == 200
    rows_b = listed_b.json()
    assert len(rows_b) == 1
    assert rows_b[0]["id"] == signal_b
    assert rows_b[0]["tenant_id"] == "tenant_b"
    assert rows_b[0]["feedback"] is None

    leaked = client.get(
        "/v1/tenants/tenant_a/signals",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert leaked.status_code == 403

    missing = client.get("/v1/tenants/tenant_a/signals")
    assert missing.status_code == 400


def test_acted_requires_feedback_and_survives_list(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    created = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "conv_acted",
            "signal_type": "upsell",
            "confidence": 0.6,
            "summary": "Plan upgrade",
        },
    )
    assert created.status_code == 201
    signal_id = created.json()["id"]

    too_early = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers=headers,
        json={"acted": True},
    )
    assert too_early.status_code == 400

    feedback = client.post(
        f"/v1/signals/{signal_id}/feedback",
        headers=headers,
        json={"feedback": "partially_correct", "reviewed_by": "reviewer_1"},
    )
    assert feedback.status_code == 200

    acted = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers=headers,
        json={"acted": True},
    )
    assert acted.status_code == 200
    assert acted.json()["acted"] is True
    assert acted.json()["feedback"]["feedback"] == "partially_correct"

    listed = client.get(
        "/v1/tenants/tenant_demo/signals",
        headers=headers,
    )
    assert listed.status_code == 200
    match = next(row for row in listed.json() if row["id"] == signal_id)
    assert match["acted"] is True
    assert match["feedback"]["feedback"] == "partially_correct"

    other_tenant = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers={"X-Tenant-Id": "tenant_other"},
        json={"acted": False},
    )
    assert other_tenant.status_code == 404

    needs = client.get(
        "/v1/tenants/tenant_demo/signals/needs-review",
        headers=headers,
        params={"limit": 100},
    )
    assert needs.status_code == 200
    assert signal_id not in [row["id"] for row in needs.json()]
