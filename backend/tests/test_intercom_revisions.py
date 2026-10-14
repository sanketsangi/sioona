"""Intercom snapshots update stable conversations without losing later revisions."""
import hashlib
import json
import os
import pytest

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.engine import make_url

from app.models.upload import Upload
from app.schemas.ingestion import Ingestion
from app.services.ingestion import publish_ingestion, IngestionError
from app.services.conversations import list_conversations


def revision(messages, expected):
    corpus = [[f"m{i}", "customer", text] for i, text in enumerate(messages)]
    digest = hashlib.sha256(json.dumps(corpus, separators=(",", ":")).encode()).hexdigest()
    return Ingestion.model_validate({
        "source": "live-ingest", "append_only": True,
        "expected_content_hashes": {"c1": expected},
        "conversations": [{"conversation_id": "c1", "external_id": "ext_c1",
            "channel": "intercom", "started_at": "2026-10-01T00:00:00Z",
            "messages": [{"message_id": mid, "role": role, "content": text,
                "timestamp": "2026-10-01T00:00:00Z"} for mid, role, text in corpus]}],
        "detections": [{"conversation_id": "c1", "content_hash": digest,
            "model_version": "heuristic-v1", "prompt_version": "taxonomy-v1", "output": []}],
    })


def test_added_reply_survives_new_session_and_replay_has_no_duplicate_publication(tmp_path):
    from app.models import Base
    url = f"sqlite+pysqlite:///{tmp_path / 'restart.sqlite'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    first = revision(["Synthetic first turn"], None)
    second = revision(["Synthetic first turn", "Synthetic added reply"], first.detections[0].content_hash)
    with Session(engine, autoflush=False) as db:
        publish_ingestion(db, tenant_id="a", upload_id="first", body=first)
        publish_ingestion(db, tenant_id="a", upload_id="second", body=second)
    engine.dispose()
    # Reopen the on-disk database with a new engine, discarding all caches.
    engine = create_engine(url)
    with Session(engine, autoflush=False) as restarted:
        rows = list_conversations(restarted, "a")
        assert len(rows) == 1 and rows[0][0].conversation_id == "c1"
        assert [row.content for row in rows[0][1]] == ["Synthetic first turn", "Synthetic added reply"]
        before = restarted.scalar(select(func.count()).select_from(Upload))
        publish_ingestion(restarted, tenant_id="a", upload_id="second", body=second)
        assert restarted.scalar(select(func.count()).select_from(Upload)) == before
        assert len(list_conversations(restarted, "a")[0][1]) == 2
    engine.dispose()


def test_stale_revision_cannot_overwrite_a_newer_reply(db):
    first = revision(["First"], None)
    publish_ingestion(db, tenant_id="a", upload_id="first", body=first)
    second = revision(["First", "Second"], first.detections[0].content_hash)
    publish_ingestion(db, tenant_id="a", upload_id="second", body=second)
    stale = revision(["First", "Stale"], first.detections[0].content_hash)
    with pytest.raises(IngestionError, match="conversation_revision_conflict"):
        publish_ingestion(db, tenant_id="a", upload_id="stale", body=stale)
    assert [row.content for row in list_conversations(db, "a")[0][1]] == ["First", "Second"]


def test_revision_lookup_and_preconditions_are_tenant_scoped(client):
    body = revision(["First"], None).model_dump(mode="json")
    headers = {"X-Tenant-Id": "a"}
    assert client.put("/v1/tenants/a/ingestions/first", headers=headers, json=body).status_code == 200
    url = "/v1/tenants/a/uploads/published-conversations"
    lookup = {"conversation_ids": ["c1", "missing"], "include_content_hashes": True}
    assert client.post(url, headers=headers, json=lookup).json()["content_hashes"] == {
        "c1": body["detections"][0]["content_hash"], "missing": None}
    assert client.post(url, headers={"X-Tenant-Id": "b"}, json=lookup).status_code == 403
    other = client.post(url.replace("/a/", "/b/"), headers={"X-Tenant-Id": "b"}, json=lookup).json()
    assert other["content_hashes"] == {"c1": None, "missing": None}
    changed = revision(["First", "Second"], body["detections"][0]["content_hash"]).model_dump(mode="json")
    assert client.put("/v1/tenants/b/ingestions/second", headers={"X-Tenant-Id": "b"}, json=changed).status_code == 409
    assert client.get("/v1/tenants/b/conversations", headers={"X-Tenant-Id": "b"}).json() == []


def test_failed_classification_publication_does_not_replace_previous_transcript(db):
    first = revision(["First"], None)
    publish_ingestion(db, tenant_id="a", upload_id="first", body=first)
    invalid = revision(["First", "Second"], first.detections[0].content_hash)
    invalid.detections[0].content_hash = "0" * 64
    with pytest.raises(IngestionError):
        publish_ingestion(db, tenant_id="a", upload_id="invalid", body=invalid)
    assert [row.content for row in list_conversations(db, "a")[0][1]] == ["First"]


def test_delayed_shorter_snapshot_cannot_delete_replies_even_with_current_precondition(db):
    current = revision(["First", "Second"], None)
    publish_ingestion(db, tenant_id="a", upload_id="current", body=current)
    delayed = revision(["First"], current.detections[0].content_hash)
    with pytest.raises(IngestionError, match="intercom_snapshot_missing_replies"):
        publish_ingestion(db, tenant_id="a", upload_id="delayed", body=delayed)
    assert [row.content for row in list_conversations(db, "a")[0][1]] == ["First", "Second"]


@pytest.mark.skipif(not os.environ.get("PG_TEST_DATABASE_URL"), reason="Dedicated local PostgreSQL database required")
def test_two_postgres_workers_cannot_both_replace_the_same_revision():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.models import Base
    url = make_url(os.environ["PG_TEST_DATABASE_URL"])
    assert url.host in ("127.0.0.1", "localhost", "::1") and url.database == "sioona_migration_test"
    engine = create_engine(url)
    # Test schema only. No application migration or hosted connection.
    Base.metadata.create_all(engine)
    first = revision(["First"], None)
    try:
        with Session(engine, autoflush=False) as db:
            publish_ingestion(db, tenant_id="intercom-race", upload_id="first", body=first)
        barrier = Barrier(2)
        def worker(index):
            changed = revision(["First", f"Reply {index}"], first.detections[0].content_hash)
            with Session(engine, autoflush=False) as db:
                barrier.wait(timeout=10)
                try:
                    publish_ingestion(db, tenant_id="intercom-race", upload_id=f"worker{index}", body=changed)
                    return "completed", index
                except IngestionError as exc:
                    return exc.detail, index
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(worker, [0, 1]))
        assert sorted(status for status, _ in outcomes) == ["completed", "conversation_revision_conflict"]
        winner = next(index for status, index in outcomes if status == "completed")
        with Session(engine) as db:
            assert [row.content for row in list_conversations(db, "intercom-race")[0][1]] == ["First", f"Reply {winner}"]
            assert db.scalar(select(func.count()).select_from(Upload).where(
                Upload.tenant_id == "intercom-race", Upload.status == "completed")) == 2
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
