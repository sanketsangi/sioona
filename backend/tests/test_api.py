"""API smoke tests for Signal Score routes."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.exc import SQLAlchemyError
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


def test_signal_score_scopes_to_conversation_id_query_params(
    client: TestClient,
) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    keep = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "pack_1",
            "signal_type": "lead",
            "confidence": 0.9,
            "summary": "Keep",
        },
    )
    orphan = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "orphan_demo",
            "signal_type": "lead",
            "confidence": 0.9,
            "summary": "Orphan",
        },
    )
    assert keep.status_code == 201
    assert orphan.status_code == 201
    client.post(
        f"/v1/signals/{keep.json()['id']}/feedback",
        headers=headers,
        json={"feedback": "correct", "reviewed_by": "r1"},
    )
    client.post(
        f"/v1/signals/{orphan.json()['id']}/feedback",
        headers=headers,
        json={"feedback": "incorrect", "reviewed_by": "r1"},
    )

    scoped = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers=headers,
        params=[("conversation_id", "pack_1")],
    )
    assert scoped.status_code == 200
    body = scoped.json()
    assert body["reviewed_count"] == 1
    assert body["correct_count"] == 1
    assert body["signal_score"] == 1.0

    empty = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers=headers,
        params=[("conversation_id", "")],
    )
    assert empty.status_code == 200
    empty_body = empty.json()
    assert empty_body["reviewed_count"] == 0
    assert empty_body["signal_score"] is None


def test_signal_score_post_keep_set_body_matches_get(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    keep = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "pack_1",
            "signal_type": "lead",
            "confidence": 0.9,
            "summary": "Keep",
        },
    )
    orphan = client.post(
        "/v1/predictions",
        headers=headers,
        json={
            "conversation_id": "orphan_demo",
            "signal_type": "retention",
            "confidence": 0.9,
            "summary": "Orphan",
        },
    )
    assert keep.status_code == 201
    assert orphan.status_code == 201
    client.post(
        f"/v1/signals/{keep.json()['id']}/feedback",
        headers=headers,
        json={"feedback": "correct", "reviewed_by": "r1"},
    )
    client.post(
        f"/v1/signals/{orphan.json()['id']}/feedback",
        headers=headers,
        json={"feedback": "incorrect", "reviewed_by": "r1"},
    )

    posted = client.post(
        "/v1/tenants/tenant_demo/signal-score",
        headers=headers,
        json={"conversation_ids": ["pack_1"]},
    )
    assert posted.status_code == 200
    body = posted.json()
    assert body["reviewed_count"] == 1
    assert body["correct_count"] == 1
    assert body["signal_score"] == 1.0
    assert body["by_signal_type"][0]["signal_type"] == "lead"

    empty = client.post(
        "/v1/tenants/tenant_demo/signal-score",
        headers=headers,
        json={"conversation_ids": []},
    )
    assert empty.status_code == 200
    assert empty.json()["reviewed_count"] == 0
    assert empty.json()["signal_score"] is None


def test_create_prediction_rejects_non_canonical_signal_type(
    client: TestClient,
) -> None:
    response = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_demo"},
        json={
            "conversation_id": "conv_junk",
            "signal_type": "retention_risk",
            "confidence": 0.9,
            "summary": "Legacy name",
        },
    )
    assert response.status_code == 422


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


def test_conversation_bulk_upsert_drops_leftover_messages(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_a"}
    long_thread = client.post(
        "/v1/conversations/bulk",
        headers=headers,
        json={
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
                        },
                        {
                            "message_id": "msg_conv_priya_1",
                            "role": "agent",
                            "content": "I can help with that",
                            "timestamp": "2026-08-01T10:01:00+00:00",
                        },
                        {
                            "message_id": "msg_conv_priya_2",
                            "role": "customer",
                            "content": "Stale turn from last week's longer export",
                            "timestamp": "2026-08-01T10:02:00+00:00",
                        },
                    ],
                }
            ]
        },
    )
    assert long_thread.status_code == 201
    assert long_thread.json()["messages_created"] == 3

    shorter = client.post(
        "/v1/conversations/bulk",
        headers=headers,
        json={
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
                            "content": "Still closing — shorter export",
                            "timestamp": "2026-08-01T10:00:00+00:00",
                        },
                        {
                            "message_id": "msg_conv_priya_1",
                            "role": "agent",
                            "content": "Updated reply",
                            "timestamp": "2026-08-01T10:01:00+00:00",
                        },
                    ],
                }
            ]
        },
    )
    assert shorter.status_code == 201
    assert shorter.json()["updated"] == 1

    listed = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=headers,
        params=[("conversation_id", "conv_priya")],
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    ids = [m["message_id"] for m in listed.json()[0]["messages"]]
    contents = [m["content"] for m in listed.json()[0]["messages"]]
    assert ids == ["msg_conv_priya_0", "msg_conv_priya_1"]
    assert "Stale turn from last week's longer export" not in contents


def test_list_conversations_query_filters_ids(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_a"}
    created = client.post(
        "/v1/conversations/bulk",
        headers=headers,
        json={
            "conversations": [
                {
                    "conversation_id": "conv_keep",
                    "channel": "whatsapp",
                    "customer_name": "Asha",
                    "started_at": "2026-08-01T10:00:00Z",
                    "messages": [
                        {
                            "message_id": "msg_keep",
                            "role": "customer",
                            "content": "Need a callback",
                            "timestamp": "2026-08-01T10:00:00Z",
                        }
                    ],
                },
                {
                    "conversation_id": "conv_other",
                    "channel": "whatsapp",
                    "customer_name": "Ravi",
                    "started_at": "2026-08-01T11:00:00Z",
                    "messages": [
                        {
                            "message_id": "msg_other",
                            "role": "customer",
                            "content": "Thanks",
                            "timestamp": "2026-08-01T11:00:00Z",
                        }
                    ],
                },
            ]
        },
    )
    assert created.status_code == 201

    filtered = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=headers,
        params=[("conversation_id", "conv_keep"), ("conversation_id", "conv_missing")],
    )
    assert filtered.status_code == 200
    body = filtered.json()
    assert [row["conversation_id"] for row in body] == ["conv_keep"]
    assert body[0]["messages"][0]["content"] == "Need a callback"

    empty = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=headers,
        params=[("conversation_id", "")],
    )
    assert empty.status_code == 200
    assert empty.json() == []


def test_conversation_prune_is_tenant_safe(client: TestClient) -> None:
    keep_payload = {
        "conversations": [
            {
                "conversation_id": "conv_keep",
                "channel": "whatsapp",
                "customer_name": "Asha",
                "started_at": "2026-08-01T10:00:00+00:00",
                "external_id": "asha_1",
                "messages": [
                    {
                        "message_id": "msg_keep_0",
                        "role": "customer",
                        "content": "I want to open a demat account",
                        "timestamp": "2026-08-01T10:00:00+00:00",
                    }
                ],
            },
            {
                "conversation_id": "conv_priya_showcase",
                "channel": "whatsapp",
                "customer_name": "Priya",
                "started_at": "2026-08-01T11:00:00+00:00",
                "external_id": "priya_sharma_22",
                "messages": [
                    {
                        "message_id": "msg_priya_0",
                        "role": "customer",
                        "content": "I want to close my account",
                        "timestamp": "2026-08-01T11:00:00+00:00",
                    }
                ],
            },
        ]
    }
    created_a = client.post(
        "/v1/conversations/bulk",
        headers={"X-Tenant-Id": "tenant_a"},
        json=keep_payload,
    )
    assert created_a.status_code == 201

    created_b = client.post(
        "/v1/conversations/bulk",
        headers={"X-Tenant-Id": "tenant_b"},
        json={
            "conversations": [
                {
                    "conversation_id": "conv_priya_showcase",
                    "channel": "whatsapp",
                    "customer_name": "Priya B",
                    "started_at": "2026-08-01T11:00:00+00:00",
                    "external_id": "priya_b",
                    "messages": [
                        {
                            "message_id": "msg_b_0",
                            "role": "customer",
                            "content": "Other tenant showcase",
                            "timestamp": "2026-08-01T11:00:00+00:00",
                        }
                    ],
                }
            ]
        },
    )
    assert created_b.status_code == 201

    pred_a = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_a"},
        json={
            "conversation_id": "conv_priya_showcase",
            "signal_type": "retention",
            "confidence": 0.9,
            "summary": "Showcase churn",
        },
    )
    assert pred_a.status_code == 201
    pred_b = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_b"},
        json={
            "conversation_id": "conv_priya_showcase",
            "signal_type": "retention",
            "confidence": 0.8,
            "summary": "Other tenant churn",
        },
    )
    assert pred_b.status_code == 201

    leaked = client.post(
        "/v1/tenants/tenant_a/conversations/prune",
        headers={"X-Tenant-Id": "tenant_b"},
        json={"keep_conversation_ids": ["conv_keep"]},
    )
    assert leaked.status_code == 403

    pruned = client.post(
        "/v1/tenants/tenant_a/conversations/prune",
        headers={"X-Tenant-Id": "tenant_a"},
        json={"keep_conversation_ids": ["conv_keep"]},
    )
    assert pruned.status_code == 200
    assert pruned.json() == {"deleted": 1, "kept": 1}

    listed_a = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers={"X-Tenant-Id": "tenant_a"},
    )
    assert listed_a.status_code == 200
    assert [row["conversation_id"] for row in listed_a.json()] == ["conv_keep"]

    listed_b = client.get(
        "/v1/tenants/tenant_b/conversations",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert listed_b.status_code == 200
    assert len(listed_b.json()) == 1
    assert listed_b.json()[0]["conversation_id"] == "conv_priya_showcase"
    assert listed_b.json()[0]["messages"][0]["content"] == "Other tenant showcase"

    signals_a = client.get(
        "/v1/tenants/tenant_a/signals",
        headers={"X-Tenant-Id": "tenant_a"},
    )
    assert signals_a.status_code == 200
    assert signals_a.json() == []

    signals_b = client.get(
        "/v1/tenants/tenant_b/signals",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert signals_b.status_code == 200
    assert len(signals_b.json()) == 1
    assert signals_b.json()[0]["conversation_id"] == "conv_priya_showcase"

    missing = client.delete(
        "/v1/tenants/tenant_a/conversations/conv_priya_showcase",
        headers={"X-Tenant-Id": "tenant_a"},
    )
    assert missing.status_code == 404

    deleted = client.delete(
        "/v1/tenants/tenant_b/conversations/conv_priya_showcase",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}

    empty_b = client.get(
        "/v1/tenants/tenant_b/conversations",
        headers={"X-Tenant-Id": "tenant_b"},
    )
    assert empty_b.status_code == 200
    assert empty_b.json() == []


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


def test_needs_review_and_signals_honor_keep_set_and_offset(
    client: TestClient,
) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    for conversation_id in ("keep_a", "keep_b", "other_pack"):
        created = client.post(
            "/v1/predictions",
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "signal_type": "lead",
                "confidence": 0.8,
                "summary": conversation_id,
            },
        )
        assert created.status_code == 201

    keep = [("conversation_id", "keep_a"), ("conversation_id", "keep_b")]
    first = client.get(
        "/v1/tenants/tenant_demo/signals/needs-review",
        headers=headers,
        params=[("limit", "1"), ("offset", "0"), *keep],
    )
    second = client.get(
        "/v1/tenants/tenant_demo/signals/needs-review",
        headers=headers,
        params=[("limit", "1"), ("offset", "1"), *keep],
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert len(first.json()) == 1
    assert len(second.json()) == 1
    assert {
        first.json()[0]["conversation_id"],
        second.json()[0]["conversation_id"],
    } == {"keep_a", "keep_b"}

    listed = client.get(
        "/v1/tenants/tenant_demo/signals",
        headers=headers,
        params=[("conversation_id", "keep_a")],
    )
    assert listed.status_code == 200
    assert [row["conversation_id"] for row in listed.json()] == ["keep_a"]


def test_prediction_bulk_upsert_and_tenant_isolation(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_bulk"}
    first = client.post(
        "/v1/predictions/bulk",
        headers=headers,
        json={
            "predictions": [
                {
                    "conversation_id": "conv_bulk_1",
                    "signal_type": "lead",
                    "confidence": 0.7,
                    "summary": "First lead",
                },
                {
                    "conversation_id": "conv_bulk_2",
                    "signal_type": "retention",
                    "confidence": 0.8,
                    "summary": "First retention",
                },
            ]
        },
    )
    assert first.status_code == 201
    body = first.json()
    assert body["created"] == 2
    assert body["updated"] == 0
    assert len(body["predictions"]) == 2
    ids = {row["conversation_id"]: row["id"] for row in body["predictions"]}

    second = client.post(
        "/v1/predictions/bulk",
        headers=headers,
        json={
            "predictions": [
                {
                    "conversation_id": "conv_bulk_1",
                    "signal_type": "lead",
                    "confidence": 0.91,
                    "summary": "Updated lead",
                },
                {
                    "conversation_id": "conv_bulk_3",
                    "signal_type": "upsell",
                    "confidence": 0.6,
                    "summary": "New upsell",
                },
            ]
        },
    )
    assert second.status_code == 201
    body2 = second.json()
    assert body2["created"] == 1
    assert body2["updated"] == 1
    by_conv = {row["conversation_id"]: row for row in body2["predictions"]}
    assert by_conv["conv_bulk_1"]["id"] == ids["conv_bulk_1"]
    assert by_conv["conv_bulk_1"]["confidence"] == 0.91
    assert by_conv["conv_bulk_1"]["summary"] == "Updated lead"
    assert by_conv["conv_bulk_3"]["signal_type"] == "upsell"

    other = client.get(
        "/v1/tenants/other_tenant/signals/needs-review",
        headers={"X-Tenant-Id": "other_tenant"},
        params={"limit": 100},
    )
    assert other.status_code == 200
    assert all(row["tenant_id"] != "tenant_bulk" for row in other.json())


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

    partial = client.post(
        f"/v1/signals/{signal_id}/feedback",
        headers=headers,
        json={"feedback": "partially_correct", "reviewed_by": "reviewer_1"},
    )
    assert partial.status_code == 200

    partial_acted = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers=headers,
        json={"acted": True},
    )
    assert partial_acted.status_code == 400
    assert "must be reviewed" in partial_acted.json()["detail"].lower()

    incorrect = client.post(
        f"/v1/signals/{signal_id}/feedback",
        headers=headers,
        json={"feedback": "incorrect", "reviewed_by": "reviewer_1"},
    )
    assert incorrect.status_code == 200
    incorrect_acted = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers=headers,
        json={"acted": True},
    )
    assert incorrect_acted.status_code == 400

    feedback = client.post(
        f"/v1/signals/{signal_id}/feedback",
        headers=headers,
        json={"feedback": "correct", "reviewed_by": "reviewer_1"},
    )
    assert feedback.status_code == 200

    acted = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers=headers,
        json={"acted": True},
    )
    assert acted.status_code == 200
    assert acted.json()["acted"] is True
    assert acted.json()["feedback"]["feedback"] == "correct"

    listed = client.get(
        "/v1/tenants/tenant_demo/signals",
        headers=headers,
    )
    assert listed.status_code == 200
    match = next(row for row in listed.json() if row["id"] == signal_id)
    assert match["acted"] is True
    assert match["feedback"]["feedback"] == "correct"

    changed = client.post(
        f"/v1/signals/{signal_id}/feedback",
        headers=headers,
        json={"feedback": "incorrect", "reviewed_by": "reviewer_1"},
    )
    assert changed.status_code == 200
    undone = client.post(
        f"/v1/signals/{signal_id}/acted",
        headers=headers,
        json={"acted": False},
    )
    assert undone.status_code == 200
    assert undone.json()["acted"] is False
    assert undone.json()["feedback"]["feedback"] == "incorrect"

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


def test_conversation_ground_truth_upsert_list_and_patch(client: TestClient) -> None:
    headers_a = {"X-Tenant-Id": "tenant_a"}
    headers_b = {"X-Tenant-Id": "tenant_b"}
    payload = {
        "conversation_id": "conv_gt",
        "channel": "whatsapp",
        "customer_name": "Priya",
        "started_at": "2026-08-01T10:00:00+00:00",
        "external_id": "priya_gt",
        "ground_truth": "retention",
        "messages": [
            {
                "message_id": "msg_gt_0",
                "role": "customer",
                "content": "I want to close my account",
                "timestamp": "2026-08-01T10:00:00+00:00",
            }
        ],
    }

    created = client.post("/v1/conversations", headers=headers_a, json=payload)
    assert created.status_code == 201
    assert created.json()["ground_truth"] == "retention"

    omitted = client.post(
        "/v1/conversations",
        headers=headers_a,
        json={k: v for k, v in payload.items() if k != "ground_truth"},
    )
    assert omitted.status_code == 201
    assert omitted.json()["ground_truth"] == "retention"

    explicit_null = client.post(
        "/v1/conversations",
        headers=headers_a,
        json={**{k: v for k, v in payload.items() if k != "ground_truth"}, "ground_truth": None},
    )
    assert explicit_null.status_code == 201
    assert explicit_null.json()["ground_truth"] == "retention"

    none_label = client.post(
        "/v1/conversations",
        headers=headers_a,
        json={**payload, "ground_truth": "none"},
    )
    assert none_label.status_code == 201
    assert none_label.json()["ground_truth"] == "none"

    listed = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=headers_a,
    )
    assert listed.status_code == 200
    assert listed.json()[0]["ground_truth"] == "none"

    invalid = client.post(
        "/v1/conversations",
        headers=headers_a,
        json={**payload, "ground_truth": "churn"},
    )
    assert invalid.status_code == 400

    other = client.post(
        "/v1/conversations",
        headers=headers_b,
        json={k: v for k, v in payload.items() if k != "ground_truth"},
    )
    assert other.status_code == 201
    assert other.json()["ground_truth"] is None

    leaked_patch = client.patch(
        "/v1/tenants/tenant_a/conversations/conv_gt",
        headers=headers_b,
        json={"ground_truth": "lead"},
    )
    assert leaked_patch.status_code == 403

    patched = client.patch(
        "/v1/tenants/tenant_a/conversations/conv_gt",
        headers=headers_a,
        json={"ground_truth": "lead"},
    )
    assert patched.status_code == 200
    assert patched.json()["ground_truth"] == "lead"

    cleared = client.patch(
        "/v1/tenants/tenant_a/conversations/conv_gt",
        headers=headers_a,
        json={"ground_truth": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["ground_truth"] is None

    missing = client.patch(
        "/v1/tenants/tenant_a/conversations/conv_missing",
        headers=headers_a,
        json={"ground_truth": "lead"},
    )
    assert missing.status_code == 404

    listed_b = client.get(
        "/v1/tenants/tenant_b/conversations",
        headers=headers_b,
    )
    assert listed_b.status_code == 200
    assert listed_b.json()[0]["ground_truth"] is None

    replace_clear = client.post(
        "/v1/conversations",
        headers=headers_b,
        json={
            **{k: v for k, v in payload.items() if k != "ground_truth"},
            "ground_truth": "upsell",
        },
    )
    assert replace_clear.json()["ground_truth"] == "upsell"
    cleared_flag = client.post(
        "/v1/conversations",
        headers=headers_b,
        json={
            **{k: v for k, v in payload.items() if k != "ground_truth"},
            "clear_ground_truth": True,
        },
    )
    assert cleared_flag.status_code == 201
    assert cleared_flag.json()["ground_truth"] is None


def test_tenant_data_wipe_is_tenant_safe(client: TestClient) -> None:
    headers_a = {"X-Tenant-Id": "tenant_a"}
    headers_b = {"X-Tenant-Id": "tenant_b"}

    for tenant, headers, conv_id in (
        ("tenant_a", headers_a, "conv_a"),
        ("tenant_b", headers_b, "conv_b"),
    ):
        created = client.post(
            "/v1/conversations",
            headers=headers,
            json={
                "conversation_id": conv_id,
                "channel": "whatsapp",
                "customer_name": "Priya",
                "started_at": "2026-08-01T10:00:00+00:00",
                "messages": [
                    {
                        "message_id": f"msg_{conv_id}_0",
                        "role": "customer",
                        "content": "Close my account",
                        "timestamp": "2026-08-01T10:00:00+00:00",
                    }
                ],
            },
        )
        assert created.status_code == 201
        pred = client.post(
            "/v1/predictions",
            headers=headers,
            json={
                "conversation_id": conv_id,
                "signal_type": "retention",
                "confidence": 0.9,
                "summary": "Close account",
            },
        )
        assert pred.status_code == 201
        signal_id = pred.json()["id"]
        feedback = client.post(
            f"/v1/signals/{signal_id}/feedback",
            headers=headers,
            json={"feedback": "correct", "reviewed_by": "reviewer_1"},
        )
        assert feedback.status_code == 200
        pilot = client.put(
            f"/v1/tenants/{tenant}/pilot",
            headers=headers,
            json={
                "baseline_opportunities": 4,
                "baseline_note": "demo",
                "weekly_export_count": 1,
            },
        )
        assert pilot.status_code == 200

    mismatch = client.delete(
        "/v1/tenants/tenant_a/data",
        headers=headers_b,
    )
    assert mismatch.status_code == 403

    missing_header = client.delete("/v1/tenants/tenant_a/data")
    assert missing_header.status_code == 400

    wiped = client.delete(
        "/v1/tenants/tenant_a/data",
        headers=headers_a,
    )
    assert wiped.status_code == 200
    assert wiped.json() == {
        "conversations": 1,
        "messages": 1,
        "predictions": 1,
        "feedback": 1,
        "supervised_actions": 0,
        "pilot_settings": 1,
    }

    listed_a = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=headers_a,
    )
    assert listed_a.status_code == 200
    assert listed_a.json() == []

    pilot_a = client.get(
        "/v1/tenants/tenant_a/pilot",
        headers=headers_a,
    )
    assert pilot_a.status_code == 404

    listed_b = client.get(
        "/v1/tenants/tenant_b/conversations",
        headers=headers_b,
    )
    assert listed_b.status_code == 200
    assert len(listed_b.json()) == 1
    assert listed_b.json()[0]["conversation_id"] == "conv_b"

    pilot_b = client.get(
        "/v1/tenants/tenant_b/pilot",
        headers=headers_b,
    )
    assert pilot_b.status_code == 200
    assert pilot_b.json()["baseline_opportunities"] == 4

    empty = client.delete(
        "/v1/tenants/tenant_a/data",
        headers=headers_a,
    )
    assert empty.status_code == 200
    assert empty.json() == {
        "conversations": 0,
        "messages": 0,
        "predictions": 0,
        "feedback": 0,
        "supervised_actions": 0,
        "pilot_settings": 0,
    }


def test_needs_review_returns_database_unavailable_on_sqlalchemy_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(*_args: object, **_kwargs: object) -> None:
        raise SQLAlchemyError("pool timeout")

    monkeypatch.setattr(
        "app.api.routes.review.list_signals_needing_review",
        _boom,
    )
    response = client.get(
        "/v1/tenants/tenant_demo/signals/needs-review",
        headers={"X-Tenant-Id": "tenant_demo"},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "database_unavailable"}


def test_signal_score_returns_database_unavailable_on_sqlalchemy_error(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(*_args: object, **_kwargs: object) -> None:
        raise SQLAlchemyError("pool timeout")

    monkeypatch.setattr(
        "app.api.routes.scores.calculate_signal_score",
        _boom,
    )
    response = client.get(
        "/v1/tenants/tenant_demo/signal-score",
        headers={"X-Tenant-Id": "tenant_demo"},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "database_unavailable"}


def test_supervised_action_decision_round_trip(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    created = client.post(
        "/v1/supervised-actions",
        headers=headers,
        json={
            "conversation_id": "conv_email",
            "action_type": "retention_email_draft",
            "status": "edited",
            "subject": "Edited subject",
            "body": "Edited body",
            "evidence_quote": "fees are high",
        },
    )
    assert created.status_code == 200
    payload = created.json()
    assert payload["status"] == "edited"
    assert payload["subject"] == "Edited subject"
    assert payload["body"] == "Edited body"
    assert "sent" not in payload

    listed = client.get(
        "/v1/tenants/tenant_demo/supervised-actions",
        headers=headers,
        params=[("conversation_id", "conv_email")],
    )
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["action_type"] == "retention_email_draft"
    assert rows[0]["body"] == "Edited body"

    other = client.get(
        "/v1/tenants/tenant_demo/supervised-actions",
        headers=headers,
        params=[("conversation_id", "conv_missing")],
    )
    assert other.status_code == 200
    assert other.json() == []
