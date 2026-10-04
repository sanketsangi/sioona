import hashlib
import json


def payload(content="Updated", valid=True):
    digest = hashlib.sha256(json.dumps([["m1", "customer", content]], separators=(",", ":")).encode()).hexdigest()
    return {"source": "synthetic.csv", "replace": True, "conversations": [{"conversation_id": "c1", "channel": "upload", "started_at": "2026-10-01T00:00:00Z", "messages": [{"message_id": "m1", "role": "customer", "content": content, "timestamp": "2026-10-01T00:00:00Z"}]}], "detections": [{"conversation_id": "c1", "content_hash": digest if valid else "0" * 64, "model_version": "m1", "prompt_version": "p1", "output": []}]}


def test_failed_publication_preserves_previous_corpus(client):
    headers = {"X-Tenant-Id": "a"}
    old = payload("Original")["conversations"][0]
    assert client.post("/v1/conversations", headers=headers, json=old).status_code == 201
    url = "/v1/tenants/a/ingestions/failed"
    response = client.put(url, headers=headers, json=payload(valid=False))
    assert response.status_code == 409, response.text
    response = client.get("/v1/tenants/a/conversations", headers=headers)
    assert response.json()[0]["messages"][0]["content"] == "Original"
    assert client.get("/v1/tenants/a/uploads/failed", headers=headers).status_code == 404
    assert client.put(url, headers=headers, json=payload()).status_code == 409


def test_atomic_publication_retry_and_replacement(client):
    headers = {"X-Tenant-Id": "a"}
    url = "/v1/tenants/a/ingestions/upload1"
    first = client.put(url, headers=headers, json=payload())
    assert first.status_code == 200, first.text
    assert client.put(url, headers=headers, json=payload()).json() == first.json()
    assert client.put(url, headers=headers, json=payload("Changed")).status_code == 409
    assert client.put(url, headers={"X-Tenant-Id": "b"}, json=payload()).status_code == 403
    second = client.put("/v1/tenants/a/ingestions/upload2", headers=headers, json=payload("Second"))
    assert second.status_code == 200, second.text
    active = client.get("/v1/tenants/a/uploads", headers=headers).json()
    assert "upload2" in str(active) and "upload1" not in str(active)
    replay = client.put(url, headers=headers, json=payload())
    assert replay.json()["active"] is False
    assert replay.json()["predictions"] == []


def test_interrupted_publication_can_retry_same_operation(client, monkeypatch):
    from app.services import ingestion
    headers = {"X-Tenant-Id": "a"}
    url = "/v1/tenants/a/ingestions/retry"
    original = ingestion.reconcile_detection
    def fail(*args, **kwargs):
        raise ValueError("injected publication failure")
    monkeypatch.setattr(ingestion, "reconcile_detection", fail)
    assert client.put(url, headers=headers, json=payload()).status_code == 409
    status = client.get(url, headers=headers).json()
    assert status["status"] == "failed" and status["active"] is False
    assert client.get("/v1/tenants/a/conversations", headers=headers).json() == []
    assert client.get(url, headers={"X-Tenant-Id": "b"}).status_code == 403
    assert client.get("/v1/tenants/b/ingestions/retry", headers={"X-Tenant-Id": "b"}).status_code == 404
    monkeypatch.setattr(ingestion, "reconcile_detection", original)
    assert client.post(url + "/resume", headers=headers).status_code == 200
    restored = client.get(url, headers=headers).json()
    assert restored["status"] == "completed" and restored["active"] is True
    assert restored["content_sha256"] == status["content_sha256"]


def test_recovery_does_not_replace_a_newer_published_upload(db):
    from datetime import datetime, timezone
    import pytest
    from fastapi import HTTPException
    from app.api.routes.ingestion import resume_ingestion, Ingestion
    from app.models.upload import Upload
    body = Ingestion.model_validate(payload()).model_dump(mode="json")
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    db.add_all([
        Upload(tenant_id="a", upload_id="old", source="synthetic.csv", content_sha256=digest,
               status="failed", payload=body, imported_at=datetime(2026, 10, 1, tzinfo=timezone.utc)),
        Upload(tenant_id="a", upload_id="new", source="new.csv", content_sha256="0" * 64,
               status="completed", imported_at=datetime(2026, 10, 2, tzinfo=timezone.utc)),
    ])
    db.commit()
    with pytest.raises(HTTPException) as error:
        resume_ingestion("a", "old", "a", db)
    assert error.value.status_code == 409
    assert error.value.detail == "ingestion_superseded_by_newer_upload"


def test_file_memberships_publish_in_one_transaction(client):
    headers = {"X-Tenant-Id": "a"}
    body = payload()
    other = {**body["conversations"][0], "conversation_id": "c2", "messages": []}
    body["conversations"].append(other)
    body["detections"].append({**body["detections"][0], "conversation_id": "c2", "content_hash": hashlib.sha256(b"[]").hexdigest()})
    body["files"] = [{"source": "one.csv", "conversation_ids": ["c1"]}, {"source": "two.csv", "conversation_ids": ["c2"]}]
    url = "/v1/tenants/a/ingestions/multi"
    assert client.put(url, headers=headers, json=body).status_code == 200
    active = client.get("/v1/tenants/a/uploads", headers=headers).json()
    assert {item["upload"]["source"]: item["conversation_ids"] for item in active} == {"one.csv": ["c1"], "two.csv": ["c2"]}
    bad = {**body, "files": [{"source": "one.csv", "conversation_ids": ["c1"]}]}
    assert client.put("/v1/tenants/a/ingestions/partial", headers=headers, json=bad).status_code == 422


def test_later_file_failure_rolls_back_entire_import_and_resume_recovers(client, monkeypatch):
    from app.services import ingestion
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/original", headers=headers, json=payload("Original")).status_code == 200
    body = payload("Replacement")
    body["conversations"].append({**body["conversations"][0], "conversation_id": "c2", "messages": []})
    body["detections"].append({**body["detections"][0], "conversation_id": "c2", "content_hash": hashlib.sha256(b"[]").hexdigest()})
    body["files"] = [{"source": "one.csv", "conversation_ids": ["c1"]}, {"source": "two.csv", "conversation_ids": ["c2"]}]
    original_publish = ingestion.publish_upload
    def fail_second_file(*args, **kwargs):
        if kwargs["source"] == "two.csv":
            raise ValueError("injected second membership failure")
        return original_publish(*args, **kwargs)
    monkeypatch.setattr(ingestion, "publish_upload", fail_second_file)
    url = "/v1/tenants/a/ingestions/replacement"
    assert client.put(url, headers=headers, json=body).status_code == 409
    active = client.get("/v1/tenants/a/uploads", headers=headers).json()
    assert len(active) == 1 and active[0]["upload"]["upload_id"] == "original"
    chats = client.get("/v1/tenants/a/conversations", headers=headers).json()
    assert len(chats) == 1 and chats[0]["messages"][0]["content"] == "Original"
    assert client.get("/v1/tenants/a/detection-runs/replacement", headers=headers).status_code == 404
    assert client.get(url, headers=headers).json()["status"] == "failed"
    monkeypatch.setattr(ingestion, "publish_upload", original_publish)
    assert client.post(url + "/resume", headers=headers).status_code == 200
    active = client.get("/v1/tenants/a/uploads", headers=headers).json()
    assert {item["upload"]["source"] for item in active} == {"one.csv", "two.csv"}


def test_production_ingestion_gate_scenario_on_local_database(db):
    from test_postgres_migrations import assert_native_ingestion
    assert_native_ingestion(db)


def test_missing_positive_evidence_rolls_back_upload_and_transcript(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/original", headers=headers,
                      json=payload("Original")).status_code == 200
    unsupported = payload("Close my account")
    unsupported["detections"][0]["output"] = [{"signal_type": "retention", "confidence": .9,
                                              "summary": "Leaving", "evidence": []}]
    url = "/v1/tenants/a/ingestions/unsupported"
    response = client.put(url, headers=headers, json=unsupported)
    assert response.status_code == 409 and response.json()["detail"] == "ingestion_not_published"
    assert client.get(url, headers=headers).json()["status"] == "failed"
    assert client.get("/v1/tenants/a/uploads/unsupported", headers=headers).status_code == 404
    assert client.get("/v1/tenants/a/conversations", headers=headers).json()[0]["messages"][0]["content"] == "Original"
    assert client.get("/v1/tenants/a/uploads", headers=headers).json()[0]["upload"]["upload_id"] == "original"


def test_upload_snapshots_preserve_original_multifile_corpus_after_replacement(client):
    headers = {"X-Tenant-Id": "a"}
    original = payload("Original customer text")
    original["files"] = [{"source": "one.csv", "conversation_ids": ["c1"]}]
    assert client.put("/v1/tenants/a/ingestions/snapshot1", headers=headers, json=original).status_code == 200
    child_id = client.get("/v1/tenants/a/uploads", headers=headers).json()[0]["upload"]["upload_id"]
    parent_url = "/v1/tenants/a/uploads/snapshot1/snapshot"
    child_url = f"/v1/tenants/a/uploads/{child_id}/snapshot"
    before = client.get(parent_url, headers=headers).json()
    file_before = client.get(child_url, headers=headers).json()
    assert before["conversations"][0]["messages"][0]["content"] == "Original customer text"
    assert file_before["run_id"] == "snapshot1"
    assert file_before["detections"] == before["detections"]
    assert client.put("/v1/tenants/a/ingestions/snapshot2", headers=headers,
                      json=payload("Replacement customer text")).status_code == 200
    assert client.get(parent_url, headers=headers).json() == before
    assert client.get(child_url, headers=headers).json() == file_before
    assert client.get(child_url, headers={"X-Tenant-Id": "b"}).status_code == 403
    assert client.get("/v1/tenants/a/uploads/missing/snapshot", headers=headers).status_code == 404


def test_legacy_upload_snapshot_is_explicitly_unavailable(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.post("/v1/conversations", headers=headers,
                      json=payload()["conversations"][0]).status_code == 201
    assert client.put("/v1/tenants/a/uploads/legacy", headers=headers, json={
        "source": "legacy.csv", "content_sha256": "0" * 64, "conversation_ids": ["c1"]}).status_code == 200
    response = client.get("/v1/tenants/a/uploads/legacy/snapshot", headers=headers)
    assert response.status_code == 409 and response.json()["detail"] == "upload_snapshot_unavailable"


def test_historical_upload_score_and_prediction_identity_survive_new_none_revision(db):
    from datetime import datetime, timezone, date
    from sqlalchemy import select
    from app.schemas.ingestion import Ingestion
    from app.services.ingestion import publish_ingestion
    from app.services.feedback import record_feedback
    from app.services.predictions import set_prediction_outcome
    from app.services.signal_score import calculate_signal_score
    from app.api.routes.uploads import get_upload_snapshot
    from app.models.signal_prediction import SignalPrediction
    original = payload("Close my subscription, fees INR 1000")
    original["detections"][0]["output"] = [{"signal_type": "retention", "confidence": .9,
        "summary": "Leaving", "evidence": ['quote: "Close my subscription"'], "mentioned_value_inr": 1000}]
    original["files"] = [{"source": "one.csv", "conversation_ids": ["c1"]}]
    publish_ingestion(db, tenant_id="a", upload_id="old", body=Ingestion.model_validate(original))
    prediction = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))
    record_feedback(db, tenant_id="a", signal_id=prediction.id, feedback="correct", reviewed_by="reviewer")
    set_prediction_outcome(db, tenant_id="a", signal_id=prediction.id, outcome="retained",
                           value_inr=1000, recorded_on=date(2026, 10, 2))
    publish_ingestion(db, tenant_id="a", upload_id="new", body=Ingestion.model_validate(payload("Thanks")))
    child_id = hashlib.sha256(json.dumps(["old", "one.csv"], ensure_ascii=False).encode()).hexdigest()
    for uid in ["old", child_id]:
        snapshot = get_upload_snapshot("a", uid, "a", db)
        assert snapshot["predictions"][0].id == prediction.id
        assert snapshot["predictions"][0].active is False
        assert snapshot["predictions"][0].feedback.feedback == "correct"
        assert snapshot["predictions"][0].outcome_value_inr == 1000
        score = calculate_signal_score(db, "a", upload_id=uid)
        assert score.reviewed_count == 1 and score.correct_count == 1 and score.revenue_saved_inr == 1000
        assert calculate_signal_score(db, "a", upload_id=uid, conversation_ids=[]).reviewed_count == 0
        assert calculate_signal_score(db, "a", upload_id=uid,
            date_from=datetime(2026, 10, 3, tzinfo=timezone.utc)).revenue_saved_inr == 0
    assert calculate_signal_score(db, "a").reviewed_count == 0
    assert calculate_signal_score(db, "a", upload_id="new").revenue_saved_inr == 0
    assert calculate_signal_score(db, "b", upload_id="old").reviewed_count == 0


def test_corrupt_snapshot_cannot_score_or_report_a_newer_revision(client):
    import copy
    from app.models.upload import Upload
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/integrity", headers=headers,
                      json=payload("Original")).status_code == 200
    from app.db import get_db
    session_source = client.app.dependency_overrides[get_db]()
    db = next(session_source)
    operation = db.get(Upload, ("a", "integrity"))
    valid = copy.deepcopy(operation.payload)
    corruptions = []
    changed_timestamp = copy.deepcopy(valid)
    changed_timestamp["conversations"][0]["messages"][0]["timestamp"] = "2026-09-01T00:00:00Z"
    corruptions.append(changed_timestamp)
    changed_text = copy.deepcopy(valid)
    changed_text["conversations"][0]["messages"][0]["content"] = "Replacement"
    corruptions.append(changed_text)
    changed_output = copy.deepcopy(valid)
    changed_output["detections"][0]["output"] = [{"signal_type": "lead", "confidence": .9,
        "summary": "Invented", "evidence": ['quote: "Original"']}]
    corruptions.append(changed_output)
    changed_model = copy.deepcopy(valid)
    changed_model["detections"][0]["model_version"] = "fabricated"
    corruptions.append(changed_model)
    corruptions.extend([{"snapshot": None}, {"snapshot": {**valid, "run_id": "missing"}}])
    for damaged in corruptions:
        operation.payload = damaged
        db.commit()
        snapshot = client.get("/v1/tenants/a/uploads/integrity/snapshot", headers=headers)
        assert snapshot.status_code == 409 and snapshot.json()["detail"] == "upload_snapshot_unavailable"
        score = client.post("/v1/tenants/a/signal-score", headers=headers,
                            json={"upload_id": "integrity", "conversation_ids": ["c1"]})
        assert score.status_code == 409 and score.json()["detail"] == "upload_snapshot_unavailable"
    operation.payload = valid
    db.commit()
    assert client.get("/v1/tenants/a/uploads/integrity/snapshot", headers=headers).status_code == 200
    session_source.close()



def test_empty_atomic_transcript_replaces_prior_messages_and_retains_snapshot(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/full", headers=headers, json=payload("Original")).status_code == 200
    empty = payload()
    empty["conversations"][0]["messages"] = []
    empty["detections"][0]["content_hash"] = hashlib.sha256(b"[]").hexdigest()
    response = client.put("/v1/tenants/a/ingestions/empty", headers=headers, json=empty)
    assert response.status_code == 200, response.text
    assert client.get("/v1/tenants/a/conversations", headers=headers).json()[0]["messages"] == []
    assert client.get("/v1/tenants/a/uploads/empty/snapshot", headers=headers).json()["conversations"][0]["messages"] == []
    assert client.get("/v1/tenants/a/uploads/full/snapshot", headers=headers).json()["conversations"][0]["messages"][0]["content"] == "Original"


def test_atomic_ingestion_cannot_move_an_existing_message_to_another_conversation(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/owner", headers=headers, json=payload("Original")).status_code == 200
    moved = payload("Changed")
    moved["conversations"][0]["conversation_id"] = "other"
    moved["detections"][0]["conversation_id"] = "other"
    response = client.put("/v1/tenants/a/ingestions/moved", headers=headers, json=moved)
    assert response.status_code == 409
    corpus = client.get("/v1/tenants/a/conversations", headers=headers).json()
    assert len(corpus) == 1 and corpus[0]["conversation_id"] == "c1"
    assert corpus[0]["messages"][0]["content"] == "Original"
    assert client.get("/v1/tenants/a/uploads/moved", headers=headers).status_code == 404


def test_atomic_transcript_limits_reject_without_staging(client):
    headers = {"X-Tenant-Id": "a"}
    oversized = payload("界" * 90000)
    response = client.put("/v1/tenants/a/ingestions/oversized", headers=headers, json=oversized)
    assert response.status_code == 422 and "256 KiB" in response.text
    assert client.get("/v1/tenants/a/ingestions/oversized", headers=headers).status_code == 404
    assert client.get("/v1/tenants/a/conversations", headers=headers).json() == []


def test_atomic_total_text_limit_counts_utf8_bytes():
    import pytest
    from pydantic import ValidationError
    from app.schemas.ingestion import Ingestion
    body = payload()
    message = body["conversations"][0]["messages"][0]
    body["conversations"][0]["messages"] = [{**message, "message_id": f"m{i}",
        "content": "x" * 262144} for i in range(65)]
    with pytest.raises(ValidationError, match="16 MiB"):
        Ingestion.model_validate(body)
    body["conversations"][0]["messages"].pop()
    assert len(Ingestion.model_validate(body).conversations[0].messages) == 64


def test_published_conversation_lookup_is_tenant_scoped_and_bounded(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/seen", headers=headers, json=payload()).status_code == 200
    url = "/v1/tenants/a/uploads/published-conversations"
    assert client.post(url, headers=headers, json={"conversation_ids": ["c1", "missing"]}).json() == {"conversation_ids": ["c1"]}
    assert client.post(url, headers={"X-Tenant-Id": "b"}, json={"conversation_ids": ["c1"]}).status_code == 403
    assert client.post("/v1/tenants/b/uploads/published-conversations", headers={"X-Tenant-Id": "b"}, json={"conversation_ids": ["c1"]}).json() == {"conversation_ids": []}
    assert client.post(url, headers=headers, json={"conversation_ids": ["c1"] * 51}).status_code == 422


def test_retired_membership_remains_processed_for_live_deduplication(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/retired", headers=headers, json=payload()).status_code == 200
    replacement = payload("New corpus")
    replacement["conversations"][0]["conversation_id"] = "c2"
    replacement["conversations"][0]["messages"][0]["message_id"] = "m2"
    replacement["detections"][0]["conversation_id"] = "c2"
    replacement["detections"][0]["content_hash"] = hashlib.sha256(json.dumps([["m2", "customer", "New corpus"]], separators=(",", ":")).encode()).hexdigest()
    assert client.put("/v1/tenants/a/ingestions/current", headers=headers, json=replacement).status_code == 200
    active = client.get("/v1/tenants/a/uploads", headers=headers).json()
    assert [row["upload"]["upload_id"] for row in active] == ["current"]
    url = "/v1/tenants/a/uploads/published-conversations"
    assert client.post(url, headers=headers, json={"conversation_ids": ["c1", "c2"]}).json() == {"conversation_ids": ["c1", "c2"]}
    assert client.post(url, headers=headers, json={"conversation_ids": [""]}).status_code == 422
    assert client.post(url, headers=headers, json={"conversation_ids": ["x" * 257]}).status_code == 422


def test_append_only_live_publication_rejects_a_second_classification(client):
    headers = {"X-Tenant-Id": "a"}
    first = {**payload("Original"), "append_only": True, "replace": False}
    assert client.put("/v1/tenants/a/ingestions/live1", headers=headers, json=first).status_code == 200
    second = {**payload("Replacement"), "append_only": True, "replace": False}
    response = client.put("/v1/tenants/a/ingestions/live2", headers=headers, json=second)
    assert response.status_code == 409 and response.json()["detail"] == "live_event_already_published"
    assert client.get("/v1/tenants/a/ingestions/live2", headers=headers).json()["status"] == "failed"
    assert client.get("/v1/tenants/a/conversations", headers=headers).json()[0]["messages"][0]["content"] == "Original"
    assert client.get("/v1/tenants/a/uploads/live2", headers=headers).status_code == 404
    assert client.put("/v1/tenants/a/ingestions/live1", headers=headers, json=first).status_code == 200


def test_staged_append_only_batch_can_resume_after_unrelated_publication(db):
    from datetime import datetime, timezone, timedelta
    from app.models.upload import Upload
    from app.schemas.ingestion import Ingestion
    from app.services.ingestion import publish_ingestion, resume_ingestion
    from app.services.uploads import upload_conversation_ids
    old = Ingestion.model_validate({**payload("Old live event"), "append_only": True, "replace": False})
    retained = old.model_dump(mode="json")
    digest = hashlib.sha256(json.dumps(retained, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    db.add(Upload(tenant_id="a", upload_id="oldlive", source=old.source, content_sha256=digest,
        status="staged", payload=retained, imported_at=datetime.now(timezone.utc) - timedelta(hours=1)))
    db.commit()
    newer = payload("New unrelated event")
    newer["conversations"][0]["conversation_id"] = "c2"
    newer["conversations"][0]["messages"][0]["message_id"] = "m2"
    newer["detections"][0]["conversation_id"] = "c2"
    newer["detections"][0]["content_hash"] = hashlib.sha256(json.dumps([["m2", "customer", "New unrelated event"]], separators=(",", ":")).encode()).hexdigest()
    publish_ingestion(db, tenant_id="a", upload_id="newer", body=Ingestion.model_validate(newer))
    assert resume_ingestion(db, tenant_id="a", upload_id="oldlive")["status"] == "completed"
    assert upload_conversation_ids(db, "a", "oldlive") == {"c1"}
    assert upload_conversation_ids(db, "a", "newer") == {"c2"}
    assert db.get(Upload, ("a", "newer")).active


def test_tenant_wipe_counts_retained_snapshots_and_detection_history(db):
    from app.schemas.ingestion import Ingestion
    from app.services.ingestion import publish_ingestion
    from app.services.tenant_data import wipe_tenant_data
    from app.models.upload import Upload
    from app.models.detection_run import DetectionRun
    for tenant in ["a", "b"]:
        publish_ingestion(db, tenant_id=tenant, upload_id="snapshot", body=Ingestion.model_validate(payload()))
    counts = wipe_tenant_data(db, tenant_id="a")
    assert counts["uploads"] == 1 and counts["upload_memberships"] == 1 and counts["detection_runs"] == 1
    assert db.get(Upload, ("a", "snapshot")) is None
    assert db.get(DetectionRun, ("a", "snapshot", "c1")) is None
    assert db.get(Upload, ("b", "snapshot")).payload is not None
    assert db.get(DetectionRun, ("b", "snapshot", "c1")) is not None
