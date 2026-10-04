from datetime import datetime, timezone
import pytest
from sqlalchemy.exc import IntegrityError
from app.models.conversation import Conversation
from app.models.upload import Upload
from app.services.uploads import publish_upload, upload_conversation_ids


def add_chat(db, tenant, cid):
    db.add(Conversation(tenant_id=tenant, conversation_id=cid, channel="upload", started_at=datetime.now(timezone.utc)))
    db.commit()


def publish(db, tenant="a", ids=("c1",)):
    return publish_upload(db, tenant_id=tenant, upload_id="u1", source="weekly.csv", content_sha256="a" * 64, conversation_ids=ids)


def test_idempotent_membership_is_immutable(db):
    add_chat(db, "a", "c1")
    row = publish(db)
    db.commit()
    stamp = row.imported_at
    assert publish(db).imported_at == stamp
    assert upload_conversation_ids(db, "a", "u1") == frozenset({"c1"})
    assert upload_conversation_ids(db, "b", "u1") == frozenset()
    with pytest.raises(ValueError, match="different corpus"):
        publish(db, ids=("c2",))


def test_rollback_does_not_publish(db):
    add_chat(db, "a", "c1")
    publish(db)
    db.rollback()
    assert db.get(Upload, ("a", "u1")) is None
    assert not upload_conversation_ids(db, "a", "u1")


def test_membership_cannot_cross_tenants(db):
    add_chat(db, "b", "c1")
    with pytest.raises(IntegrityError):
        publish(db)
    db.rollback()
    assert db.get(Upload, ("a", "u1")) is None


def test_upload_score_survives_baseline_edit_and_intersects_explicit_filter(db):
    from app.services.predictions import record_prediction
    from app.services.feedback import record_feedback
    from app.services.pilot import upsert_pilot_settings
    from app.services.signal_score import calculate_signal_score
    add_chat(db, "a", "c1")
    publish(db)
    db.commit()
    prediction = record_prediction(db, tenant_id="a", conversation_id="c1", signal_type="lead", confidence=.9, summary="Account opening")
    record_feedback(db, tenant_id="a", signal_id=prediction.id, feedback="correct", reviewed_by="r")
    upsert_pilot_settings(db, tenant_id="a", baseline_opportunities=9, last_uploaded_file_name="weekly.csv")
    assert calculate_signal_score(db, "a", upload_id="u1").reviewed_count == 1
    upsert_pilot_settings(db, tenant_id="a", baseline_opportunities=15, last_uploaded_file_name="weekly.csv")
    assert calculate_signal_score(db, "a", upload_id="u1").reviewed_count == 1
    assert calculate_signal_score(db, "a", upload_id="u1", conversation_ids=[]).reviewed_count == 0
    assert calculate_signal_score(db, "b", upload_id="u1").reviewed_count == 0


def test_upload_api_rejects_missing_corpus_and_tenant_mismatch(client):
    body = {"source": "weekly.csv", "content_sha256": "a" * 64, "conversation_ids": ["missing"]}
    url = "/v1/tenants/a/uploads/u1"
    assert client.put(url, headers={"X-Tenant-Id": "b"}, json=body).status_code == 403
    assert client.put(url, headers={"X-Tenant-Id": "a"}, json=body).status_code == 409
    assert client.get(url, headers={"X-Tenant-Id": "a"}).status_code == 404


def test_weekly_membership_union_and_replacement_preserve_history(db):
    from app.services.signal_score import resolve_score_keep_set
    add_chat(db, "a", "c1")
    add_chat(db, "a", "c2")
    publish(db)
    db.commit()
    publish_upload(db, tenant_id="a", upload_id="u2", source="week2.csv", content_sha256="b" * 64, conversation_ids=["c2"])
    db.commit()
    assert resolve_score_keep_set(db, "a", None) == frozenset({"c1", "c2"})
    publish_upload(db, tenant_id="a", upload_id="u3", source="replacement.csv", content_sha256="c" * 64, conversation_ids=["c2"], replace=True)
    db.commit()
    assert resolve_score_keep_set(db, "a", None) == frozenset({"c2"})
    assert upload_conversation_ids(db, "a", "u1") == frozenset({"c1"})


def test_active_upload_listing_restores_source_and_excludes_retired_tenant_rows(client):
    headers = {"X-Tenant-Id": "a"}
    assert client.post("/v1/conversations", headers=headers, json={
        "conversation_id": "c1", "channel": "upload", "started_at": "2026-10-01T00:00:00Z"}).status_code == 201
    for number in (1, 2):
        response = client.put(f"/v1/tenants/a/uploads/u{number}", headers=headers, json={
            "source": f"week{number}.csv", "content_sha256": str(number) * 64,
            "conversation_ids": ["c1"], "replace": number == 2})
        assert response.status_code == 200
    active = client.get("/v1/tenants/a/uploads", headers=headers).json()
    assert len(active) == 1
    assert active[0]["upload"]["source"] == "week2.csv"
    assert active[0]["conversation_ids"] == ["c1"]
    assert client.get("/v1/tenants/b/uploads", headers={"X-Tenant-Id": "b"}).json() == []
    assert client.get("/v1/tenants/a/uploads/u1", headers=headers).status_code == 200


def test_active_upload_listing_batches_memberships_without_loading_payloads(db):
    from sqlalchemy import event
    from app.api.routes.uploads import get_active_uploads
    for i in range(12):
        add_chat(db, "a", f"c{i}")
        publish_upload(db, tenant_id="a", upload_id=f"u{i}", source=f"file{i}.csv",
            content_sha256="a" * 64, conversation_ids=[f"c{i}"])
    db.commit()
    statements = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("SELECT"):
            statements.append(statement)
    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", capture)
    try:
        result = get_active_uploads("a", "a", db)
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert len(result) == 12
    assert len(statements) == 2
    assert "uploads.payload" not in statements[0].split("FROM")[0]
    assert {row.conversation_ids[0] for row in result} == {f"c{i}" for i in range(12)}
