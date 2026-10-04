import hashlib
import json
from datetime import datetime, timezone, timedelta
import pytest
from app.schemas.ingestion import Ingestion
from app.models.upload import Upload
from app.services.ingestion_recovery import recover_staged_ingestions


def stage(db, tenant, identifier, age, status="staged"):
    body = Ingestion.model_validate({"source": "synthetic.csv", "replace": True,
        "conversations": [{"conversation_id": "c1", "channel": "upload", "started_at": "2026-10-01T00:00:00Z"}],
        "detections": [{"conversation_id": "c1", "content_hash": hashlib.sha256(b"[]").hexdigest(),
            "model_version": "m1", "prompt_version": "p1", "output": []}]}).model_dump(mode="json")
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    db.add(Upload(tenant_id=tenant, upload_id=identifier, source="synthetic.csv", content_sha256=digest,
        status=status, payload=body, imported_at=datetime.now(timezone.utc) - timedelta(seconds=age)))
    db.commit()


def test_recovery_is_bounded_and_respects_grace_and_failed_states(db):
    stage(db, "a", "old", 1000)
    stage(db, "b", "next", 900)
    stage(db, "c", "recent", 10)
    stage(db, "d", "failed", 1200, "failed")
    assert recover_staged_ingestions(db, limit=1) == {"attempted": 1, "completed": 1, "failed": 0}
    assert db.get(Upload, ("a", "old")).status == "completed"
    assert db.get(Upload, ("b", "next")).status == "staged"
    assert recover_staged_ingestions(db) == {"attempted": 1, "completed": 1, "failed": 0}
    assert db.get(Upload, ("c", "recent")).status == "staged"
    assert db.get(Upload, ("d", "failed")).status == "failed"


def test_invalid_recovery_bounds_fail_before_scan(db):
    for kwargs in [{"limit": 0}, {"limit": 101}, {"grace_seconds": -1}]:
        with pytest.raises(ValueError):
            recover_staged_ingestions(db, **kwargs)


def test_bad_operation_does_not_block_another_tenant_or_loop(db):
    stage(db, "a", "invalid", 1000)
    stage(db, "b", "valid", 900)
    row = db.get(Upload, ("a", "invalid"))
    body = json.loads(json.dumps(row.payload))
    body["detections"][0]["content_hash"] = "0" * 64
    row.payload = body
    row.content_sha256 = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    db.commit()
    assert recover_staged_ingestions(db) == {"attempted": 2, "completed": 1, "failed": 1}
    assert db.get(Upload, ("a", "invalid")).status == "failed"
    assert db.get(Upload, ("b", "valid")).status == "completed"
    assert recover_staged_ingestions(db) == {"attempted": 0, "completed": 0, "failed": 0}


def test_tenant_wipe_removes_recovery_payload_and_cannot_resurrect_it(db):
    from app.services.tenant_data import wipe_tenant_data
    from app.services.ingestion import resume_ingestion, IngestionError
    stage(db, "a", "deleted", 1000)
    stage(db, "b", "preserved", 900)
    wipe_tenant_data(db, tenant_id="a")
    assert db.get(Upload, ("a", "deleted")) is None
    with pytest.raises(IngestionError) as error:
        resume_ingestion(db, tenant_id="a", upload_id="deleted")
    assert error.value.status_code == 404
    assert recover_staged_ingestions(db) == {"attempted": 1, "completed": 1, "failed": 0}
    assert db.get(Upload, ("b", "preserved")).status == "completed"


def test_recovery_rechecks_existence_after_acquiring_publication_lock(db, monkeypatch):
    from sqlalchemy import delete
    from app.services import ingestion
    stage(db, "a", "removed", 1000)
    def delete_before_publication(session, tenant_id):
        session.execute(delete(Upload).where(Upload.tenant_id == tenant_id))
        session.commit()
    monkeypatch.setattr(ingestion, "lock_tenant_corpus", delete_before_publication)
    with pytest.raises(ingestion.IngestionError) as error:
        ingestion.resume_ingestion(db, tenant_id="a", upload_id="removed")
    assert error.value.status_code == 404
    assert db.get(Upload, ("a", "removed")) is None


@pytest.mark.parametrize("damaged", [{"conversations": "private customer text"},
    {"snapshot": None}])
def test_malformed_retained_payload_isolated_without_customer_text(db, damaged):
    from app.services.ingestion import resume_ingestion, IngestionError
    stage(db, "a", "damaged", 1000)
    stage(db, "b", "valid", 900)
    row = db.get(Upload, ("a", "damaged"))
    row.payload = damaged
    db.commit()
    with pytest.raises(IngestionError) as error:
        resume_ingestion(db, tenant_id="a", upload_id="damaged")
    assert error.value.detail == "ingestion_payload_invalid"
    assert "private" not in str(error.value)
    db.rollback()
    assert recover_staged_ingestions(db) == {"attempted": 2, "completed": 1, "failed": 1}
    assert db.get(Upload, ("a", "damaged")).status == "failed"
    assert db.get(Upload, ("b", "valid")).status == "completed"
    assert recover_staged_ingestions(db) == {"attempted": 0, "completed": 0, "failed": 0}


def test_recovery_scan_uses_status_age_index_and_does_not_select_payload(db):
    from sqlalchemy import event
    stage(db, "a", "candidate", 1000)
    queries = []
    def capture(connection, cursor, statement, parameters, context, many):
        if statement.lstrip().upper().startswith("SELECT") and "FROM uploads" in statement:
            queries.append((statement, parameters))
    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        recover_staged_ingestions(db, limit=1)
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)
    scan, params = queries[0]
    assert "uploads.payload" not in scan.split("FROM")[0]
    assert "LIMIT" in scan.upper()
    plan = db.connection().exec_driver_sql("EXPLAIN QUERY PLAN " + scan, params).all()
    assert any("ix_upload_recovery_scan" in row[3] for row in plan)
    assert not any("TEMP B-TREE" in row[3] for row in plan)
