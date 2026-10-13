"""Weekly-file publications increment once, in the publication transaction."""

import hashlib
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.weekly_upload_receipt import WeeklyUploadReceipt
from app.services.pilot import get_pilot_settings, upsert_pilot_settings
from app.services.weekly_upload import apply_weekly_upload_receipt


def _chat(conversation_id: str, message_id: str, content: str) -> tuple[dict, dict]:
    digest = hashlib.sha256(
        json.dumps([[message_id, "customer", content]], separators=(",", ":")).encode()
    ).hexdigest()
    conversation = {
        "conversation_id": conversation_id,
        "channel": "upload",
        "started_at": "2026-10-01T00:00:00Z",
        "messages": [{
            "message_id": message_id,
            "role": "customer",
            "content": content,
            "timestamp": "2026-10-01T00:00:00Z",
        }],
    }
    detection = {
        "conversation_id": conversation_id,
        "content_hash": digest,
        "model_version": "m1",
        "prompt_version": "p1",
        "output": [],
    }
    return conversation, detection


def _publication(
    files: list[tuple[str, bool]],
    *,
    metadata: bool = True,
    append_only: bool = False,
    prefix: str = "c",
) -> dict:
    conversations = []
    detections = []
    rows = []
    for index, (name, weekly) in enumerate(files):
        conversation, detection = _chat(f"{prefix}{index}", f"{prefix}m{index}", f"Customer text {index} {name}")
        conversations.append(conversation)
        detections.append(detection)
        row = {"source": name, "conversation_ids": [conversation["conversation_id"]]}
        if weekly:
            row["counts_as_weekly"] = True
        rows.append(row)
    body = {
        "source": files[-1][0],
        "replace": False,
        "conversations": conversations,
        "detections": detections,
        "files": rows,
    }
    if append_only:
        body["append_only"] = True
    elif metadata:
        body["record_upload_metadata"] = True
    return body


def _seed(client: TestClient, count: int = 2) -> dict:
    headers = {"X-Tenant-Id": "tenant_demo"}
    created = client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers=headers,
        json={
            "baseline_opportunities": 4,
            "baseline_note": "keep",
            "weekly_export_count": count,
            "last_uploaded_file_name": "old.csv",
        },
    )
    assert created.status_code == 200, created.text
    return headers


def _count(client: TestClient, headers: dict) -> dict:
    response = client.get("/v1/tenants/tenant_demo/pilot", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _publish(client: TestClient, headers: dict, upload_id: str, body: dict):
    response = client.put(
        f"/v1/tenants/tenant_demo/ingestions/{upload_id}",
        headers=headers,
        json=body,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_two_weekly_publications_from_two_finish_at_four_and_replay_stays_there(client: TestClient) -> None:
    headers = _seed(client)
    first = _publication([("real-partner-export.local.csv", False)], prefix="a")
    second = _publication([("real-partner-export.week2.local.csv", False)], prefix="b")
    published = _publish(client, headers, "week-a", first)
    assert published["weekly_export_count"] == 3
    published = _publish(client, headers, "week-b", second)
    assert published["weekly_export_count"] == 4
    assert published["last_uploaded_file_name"] == "real-partner-export.week2.local.csv"
    replay = _publish(client, headers, "week-a", first)
    assert replay["weekly_export_count"] == 4
    resumed = client.post("/v1/tenants/tenant_demo/ingestions/week-a/resume", headers=headers)
    assert resumed.status_code == 200, resumed.text
    assert _count(client, headers)["weekly_export_count"] == 4


def test_restart_after_a_failed_publication_counts_once(client: TestClient, monkeypatch) -> None:
    from app.services import ingestion

    headers = _seed(client)
    body = _publication([("Zerodha_week_5_batch_01.json", False)])
    original = ingestion.reconcile_detection

    def fail(*args, **kwargs):
        raise ValueError("injected publication failure")

    monkeypatch.setattr(ingestion, "reconcile_detection", fail)
    failed = client.put("/v1/tenants/tenant_demo/ingestions/retry-week", headers=headers, json=body)
    assert failed.status_code == 409, failed.text
    assert _count(client, headers)["weekly_export_count"] == 2
    monkeypatch.setattr(ingestion, "reconcile_detection", original)
    resumed = client.post("/v1/tenants/tenant_demo/ingestions/retry-week/resume", headers=headers)
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["weekly_export_count"] == 3
    again = client.post("/v1/tenants/tenant_demo/ingestions/retry-week/resume", headers=headers)
    assert again.status_code == 200, again.text
    assert _count(client, headers)["weekly_export_count"] == 3


def test_timeout_retry_after_commit_does_not_double_count(client: TestClient) -> None:
    headers = _seed(client)
    body = _publication([("real-partner-export.week3.local.csv", False)])
    first = _publish(client, headers, "committed-week", body)
    assert first["weekly_export_count"] == 3
    retry = _publish(client, headers, "committed-week", body)
    assert retry["weekly_export_count"] == 3
    assert _count(client, headers)["weekly_export_count"] == 3


def test_uncommitted_receipt_adds_zero(db) -> None:
    upsert_pilot_settings(
        db,
        tenant_id="tenant_demo",
        baseline_opportunities=4,
        baseline_note="keep",
        weekly_export_count=2,
        last_uploaded_file_name="old.csv",
    )
    apply_weekly_upload_receipt(
        db,
        tenant_id="tenant_demo",
        receipt_id="uncommitted",
        weekly_file_count=1,
        last_uploaded_file_name="new.csv",
        update_filename=True,
    )
    db.rollback()
    db.expire_all()
    pilot = get_pilot_settings(db, "tenant_demo")
    assert pilot is not None
    assert pilot.weekly_export_count == 2
    assert pilot.last_uploaded_file_name == "old.csv"
    assert db.scalar(select(WeeklyUploadReceipt).where(WeeklyUploadReceipt.receipt_id == "uncommitted")) is None
    apply_weekly_upload_receipt(
        db,
        tenant_id="tenant_demo",
        receipt_id="committed",
        weekly_file_count=1,
        last_uploaded_file_name="new.csv",
        update_filename=True,
    )
    db.commit()
    apply_weekly_upload_receipt(
        db,
        tenant_id="tenant_demo",
        receipt_id="committed",
        weekly_file_count=1,
        last_uploaded_file_name="other.csv",
        update_filename=True,
    )
    db.commit()
    db.expire_all()
    pilot = get_pilot_settings(db, "tenant_demo")
    assert pilot.weekly_export_count == 3
    assert pilot.last_uploaded_file_name == "new.csv"


def test_multifile_counts_every_weekly_file_and_skips_other_files(client: TestClient) -> None:
    headers = _seed(client)
    mixed = _publication([
        ("real-partner-export.local.csv", False),
        ("real-partner-export.local (2).csv", True),
        ("notes.csv", False),
    ])
    published = _publish(client, headers, "mixed", mixed)
    assert published["weekly_export_count"] == 4
    assert published["last_uploaded_file_name"] == "notes.csv"
    snapshot = client.get("/v1/tenants/tenant_demo/uploads/mixed/snapshot", headers=headers)
    assert snapshot.status_code == 200, snapshot.text
    other = _publication([("notes-later.csv", False)], prefix="n")
    published = _publish(client, headers, "notes-only", other)
    assert published["weekly_export_count"] == 4
    assert published["last_uploaded_file_name"] == "notes-later.csv"


def test_live_ingestion_does_not_change_weekly_metadata(client: TestClient) -> None:
    headers = _seed(client)
    live = _publication([("live-ingest", False)], metadata=False, append_only=True)
    published = _publish(client, headers, "live-1", live)
    assert published["weekly_export_count"] == 2
    assert published["last_uploaded_file_name"] == "old.csv"
    replay = _publish(client, headers, "live-1", live)
    assert replay["weekly_export_count"] == 2
    assert _count(client, headers)["last_uploaded_file_name"] == "old.csv"


def test_first_insertions_accumulate_without_a_prior_row(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_demo"}
    missing = client.get("/v1/tenants/tenant_demo/pilot", headers=headers)
    assert missing.status_code == 404
    _publish(client, headers, "first", _publication([("real-partner-export.local.csv", False)], prefix="a"))
    _publish(client, headers, "second", _publication([("Zerodha_week_5_batch_01.json", False)], prefix="b"))
    pilot = _count(client, headers)
    assert pilot["weekly_export_count"] == 2
    assert pilot["baseline_opportunities"] == 0
    assert pilot["baseline_note"] is None


def test_baseline_save_preserves_upload_managed_metadata(client: TestClient) -> None:
    headers = _seed(client)
    _publish(client, headers, "week", _publication([("real-partner-export.week4.local.csv", False)]))
    baseline = client.put(
        "/v1/tenants/tenant_demo/pilot",
        headers=headers,
        json={
            "update_scope": "baseline",
            "baseline_opportunities": 12,
            "baseline_note": "approved",
            "weekly_export_count": 1,
            "last_uploaded_file_name": "old.csv",
        },
    )
    assert baseline.status_code == 200, baseline.text
    body = baseline.json()
    assert body["baseline_opportunities"] == 12
    assert body["baseline_note"] == "approved"
    assert body["weekly_export_count"] == 3
    assert body["last_uploaded_file_name"] == "real-partner-export.week4.local.csv"


def test_restart_of_a_staged_publication_counts_once(db, monkeypatch) -> None:
    from app.models.upload import Upload
    from app.services.ingestion import publish_ingestion, resume_ingestion
    from app.schemas.ingestion import Ingestion

    upsert_pilot_settings(
        db,
        tenant_id="tenant_demo",
        baseline_opportunities=4,
        weekly_export_count=2,
        last_uploaded_file_name="old.csv",
    )

    def explode(*_args, **_kwargs):
        raise RuntimeError("restart")

    monkeypatch.setattr("app.services.ingestion.apply_weekly_upload_receipt", explode)
    body = Ingestion.model_validate(_publication([("real-partner-export.week8.local.csv", False)]))
    with pytest.raises(RuntimeError, match="restart"):
        publish_ingestion(db, tenant_id="tenant_demo", upload_id="staged-week", body=body)
    db.rollback()
    staged = db.get(Upload, ("tenant_demo", "staged-week"))
    assert staged is not None and staged.status == "staged"
    assert get_pilot_settings(db, "tenant_demo").weekly_export_count == 2
    monkeypatch.setattr(
        "app.services.ingestion.apply_weekly_upload_receipt",
        apply_weekly_upload_receipt,
    )
    resumed = resume_ingestion(db, tenant_id="tenant_demo", upload_id="staged-week")
    assert resumed["weekly_export_count"] == 3
    again = resume_ingestion(db, tenant_id="tenant_demo", upload_id="staged-week")
    assert again["weekly_export_count"] == 3
