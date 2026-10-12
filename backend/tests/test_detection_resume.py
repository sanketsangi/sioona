"""Detection resume cursor is tenant-scoped and replaced as a whole."""

from fastapi.testclient import TestClient


def test_resume_round_trip_replaces_the_previous_cursor(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    missing = client.get("/v1/tenants/tenant_demo/detection-resume", headers=headers)
    assert missing.status_code == 404

    saved = client.put(
        "/v1/tenants/tenant_demo/detection-resume",
        headers=headers,
        json={
            "failed_conversation_ids": ["conv_failed", "conv_failed"],
            "skipped_conversation_ids": ["conv_skip"],
        },
    )
    assert saved.status_code == 200
    assert saved.json()["failed_conversation_ids"] == ["conv_failed"]
    assert saved.json()["skipped_conversation_ids"] == ["conv_skip"]

    replaced = client.put(
        "/v1/tenants/tenant_demo/detection-resume",
        headers=headers,
        json={"failed_conversation_ids": [], "skipped_conversation_ids": ["conv_next"]},
    )
    assert replaced.status_code == 200
    body = client.get("/v1/tenants/tenant_demo/detection-resume", headers=headers)
    assert body.status_code == 200
    assert body.json()["failed_conversation_ids"] == []
    assert body.json()["skipped_conversation_ids"] == ["conv_next"]


def test_resume_rejects_a_tenant_mismatch(client: TestClient) -> None:
    response = client.put(
        "/v1/tenants/tenant_a/detection-resume",
        headers={"X-Tenant-Id": "tenant_b"},
        json={"failed_conversation_ids": ["conv_a"], "skipped_conversation_ids": []},
    )
    assert response.status_code == 403
