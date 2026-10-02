"""ensure_conversation_stub and the updated_since route filter."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.services.predictions import ensure_conversation_stub


def _stub_rows(db: Session, tenant_id: str) -> list[Conversation]:
    return list(
        db.scalars(
            select(Conversation).where(Conversation.tenant_id == tenant_id)
        ).all()
    )


def test_ensure_conversation_stub_creates_a_placeholder(db: Session) -> None:
    ensure_conversation_stub(db, tenant_id="tenant_a", conversation_id="conv_orphan")

    rows = _stub_rows(db, "tenant_a")
    assert [row.conversation_id for row in rows] == ["conv_orphan"]
    assert rows[0].channel == "unknown"
    assert rows[0].customer_name is None


def test_ensure_conversation_stub_is_idempotent(db: Session) -> None:
    for _ in range(3):
        ensure_conversation_stub(
            db, tenant_id="tenant_a", conversation_id="conv_orphan"
        )
    assert len(_stub_rows(db, "tenant_a")) == 1


def test_conversation_upsert_keeps_the_real_channel(client: TestClient) -> None:
    created = client.post(
        "/v1/conversations",
        headers={"X-Tenant-Id": "tenant_a"},
        json={
            "conversation_id": "conv_real",
            "channel": "whatsapp",
            "customer_name": "Priya",
            "started_at": "2026-08-01T10:00:00+00:00",
            "messages": [
                {
                    "message_id": "msg_0",
                    "role": "customer",
                    "content": "Close my account",
                    "timestamp": "2026-08-01T10:00:00+00:00",
                }
            ],
        },
    )
    assert created.status_code == 201

    listed = client.get(
        "/v1/tenants/tenant_a/conversations", headers={"X-Tenant-Id": "tenant_a"}
    ).json()
    assert [row["channel"] for row in listed] == ["whatsapp"]


def test_ensure_conversation_stub_is_tenant_scoped(db: Session) -> None:
    ensure_conversation_stub(db, tenant_id="tenant_a", conversation_id="conv_x")
    ensure_conversation_stub(db, tenant_id="tenant_b", conversation_id="conv_x")

    assert len(_stub_rows(db, "tenant_a")) == 1
    assert len(_stub_rows(db, "tenant_b")) == 1


def test_conversations_route_filters_by_updated_since(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_a"}
    for conv_id in ("conv_1", "conv_2"):
        response = client.post(
            "/v1/conversations",
            headers=headers,
            json={
                "conversation_id": conv_id,
                "channel": "whatsapp",
                "started_at": "2026-08-01T10:00:00+00:00",
                "messages": [
                    {
                        "message_id": f"msg_{conv_id}",
                        "role": "customer",
                        "content": "hello",
                        "timestamp": "2026-08-01T10:00:00+00:00",
                    }
                ],
            },
        )
        assert response.status_code == 201

    url = "/v1/tenants/tenant_a/conversations"
    since_past = client.get(
        url, headers=headers, params={"updated_since": "2000-01-01T00:00:00+00:00"}
    )
    assert since_past.status_code == 200
    assert len(since_past.json()) == 2

    since_future = client.get(
        url, headers=headers, params={"updated_since": "2999-01-01T00:00:00+00:00"}
    )
    assert since_future.status_code == 200
    assert since_future.json() == []

    naive = client.get(
        url, headers=headers, params={"updated_since": "2000-01-01T00:00:00"}
    )
    assert naive.status_code == 200
    assert len(naive.json()) == 2

    invalid = client.get(url, headers=headers, params={"updated_since": "yesterday"})
    assert invalid.status_code == 422


def test_conversations_route_combines_updated_since_with_conversation_id(
    client: TestClient,
) -> None:
    headers = {"X-Tenant-Id": "tenant_a"}
    for conv_id in ("conv_1", "conv_2"):
        client.post(
            "/v1/conversations",
            headers=headers,
            json={
                "conversation_id": conv_id,
                "channel": "whatsapp",
                "started_at": "2026-08-01T10:00:00+00:00",
                "messages": [
                    {
                        "message_id": f"msg_{conv_id}",
                        "role": "customer",
                        "content": "hello",
                        "timestamp": "2026-08-01T10:00:00+00:00",
                    }
                ],
            },
        )

    listed = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=headers,
        params={
            "updated_since": "2000-01-01T00:00:00+00:00",
            "conversation_id": ["conv_2"],
        },
    )
    assert [row["conversation_id"] for row in listed.json()] == ["conv_2"]
