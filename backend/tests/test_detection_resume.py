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


def test_stale_resume_write_merges_failed_ids(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    saved = client.put(
        "/v1/tenants/tenant_demo/detection-resume",
        headers=headers,
        json={"failed_conversation_ids": ["conv_kept"], "skipped_conversation_ids": ["conv_skip"]},
    )
    assert saved.status_code == 200

    stale = client.put(
        "/v1/tenants/tenant_demo/detection-resume",
        headers=headers,
        json={
            "failed_conversation_ids": ["conv_added"],
            "skipped_conversation_ids": ["conv_skip_added"],
            "expected_updated_at": "2020-01-01T00:00:00Z",
        },
    )
    assert stale.status_code == 200
    assert stale.json()["failed_conversation_ids"] == ["conv_kept", "conv_added"]
    assert stale.json()["skipped_conversation_ids"] == ["conv_skip", "conv_skip_added"]


def test_matching_resume_version_replaces_the_cursor(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    saved = client.put(
        "/v1/tenants/tenant_demo/detection-resume",
        headers=headers,
        json={"failed_conversation_ids": ["conv_old"], "skipped_conversation_ids": ["conv_skip"]},
    )
    assert saved.status_code == 200
    current = client.get("/v1/tenants/tenant_demo/detection-resume", headers=headers)
    assert current.status_code == 200

    replaced = client.put(
        "/v1/tenants/tenant_demo/detection-resume",
        headers=headers,
        json={
            "failed_conversation_ids": [],
            "skipped_conversation_ids": ["conv_next"],
            "expected_updated_at": current.json()["updated_at"],
        },
    )
    assert replaced.status_code == 200
    assert replaced.json()["failed_conversation_ids"] == []
    assert replaced.json()["skipped_conversation_ids"] == ["conv_next"]


def test_resume_rejects_a_tenant_mismatch(client: TestClient) -> None:
    response = client.put(
        "/v1/tenants/tenant_a/detection-resume",
        headers={"X-Tenant-Id": "tenant_b"},
        json={"failed_conversation_ids": ["conv_a"], "skipped_conversation_ids": []},
    )
    assert response.status_code == 403


def test_insert_race_unions_failed_ids(db) -> None:
    from datetime import datetime, timezone

    import pytest
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    from app.models.detection_resume import DetectionResume
    from app.services.detection_resume import upsert_detection_resume

    winner = DetectionResume(
        tenant_id="tenant_demo",
        failed_conversation_ids=["conv_winner"],
        skipped_conversation_ids=["conv_skip_winner"],
        updated_at=datetime.now(timezone.utc),
    )
    db.add(winner)
    db.commit()

    original_scalar = Session.scalar
    original_commit = Session.commit
    state = {"missed": False, "failed": False}

    def hiding_scalar(self, statement, *args, **kwargs):
        if not state["missed"]:
            state["missed"] = True
            return None
        return original_scalar(self, statement, *args, **kwargs)

    def failing_commit(self):
        if not state["failed"]:
            state["failed"] = True
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return original_commit(self)

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(Session, "scalar", hiding_scalar)
    monkeypatch.setattr(Session, "commit", failing_commit)
    try:
        row = upsert_detection_resume(
            db,
            tenant_id="tenant_demo",
            failed_conversation_ids=["conv_loser"],
            skipped_conversation_ids=["conv_skip_loser"],
        )
    finally:
        monkeypatch.undo()

    assert row.failed_conversation_ids == ["conv_winner", "conv_loser"]
    assert row.skipped_conversation_ids == ["conv_skip_winner", "conv_skip_loser"]


def test_interleaved_completion_preserves_newer_pending_work(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    url = "/v1/tenants/tenant_demo/detection-resume"
    original = client.put(url, headers=headers, json={"failed_conversation_ids": [], "skipped_conversation_ids": ["chat_b"]})
    version = original.json()["updated_at"]
    newer = client.put(url, headers=headers, json={"failed_conversation_ids": ["chat_c"], "skipped_conversation_ids": [], "expected_updated_at": version})
    assert newer.status_code == 200
    stale = client.put(url, headers=headers, json={"failed_conversation_ids": [], "skipped_conversation_ids": [], "expected_updated_at": version})
    assert stale.status_code == 200
    assert stale.json()["failed_conversation_ids"] == ["chat_c"]
