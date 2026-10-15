"""Production DDL checks against an explicitly dedicated disposable CI database."""
import os
import hashlib
import json
from datetime import datetime, timezone
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text, select, func
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session
from app.models.conversation import Conversation
from app.services.uploads import publish_upload
from app.services.tenant_data import wipe_tenant_data

URL = os.getenv("PG_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Dedicated PostgreSQL test database required")


@pytest.mark.parametrize("seeded", [False, True])
def test_cb10_concurrent_canonical_writes(monkeypatch, seeded):
    """Independent sessions preserve scoped pilot fields, Adapt and resume IDs."""
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.services.pilot import upsert_pilot_settings, get_pilot_settings
    from app.services.taxonomy import replace_taxonomy_overrides, list_taxonomy_overrides
    from app.services.detection_resume import upsert_detection_resume, get_detection_resume
    from app.config import get_settings
    assert URL and make_url(URL).database == "sioona_migration_test"
    assert make_url(URL).host in ("localhost", "127.0.0.1", "::1")
    assert not os.environ.get("MIGRATION_DATABASE_URL", "").strip()
    engine = create_engine(URL)
    monkeypatch.setenv("DATABASE_URL", URL)
    get_settings.cache_clear()
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
        command.upgrade(Config("alembic.ini"), "head")
        if seeded:
            with Session(engine) as db:
                upsert_pilot_settings(db, tenant_id="cb10", baseline_opportunities=4,
                    weekly_export_count=1, last_uploaded_file_name="old.csv")
                replace_taxonomy_overrides(db, tenant_id="cb10", overrides={"lead": {"phrases": ["existing"]}})
                upsert_detection_resume(db, tenant_id="cb10", failed_conversation_ids=["prior"], skipped_conversation_ids=[])

        def race(operation):
            barrier = Barrier(2)
            def run(index):
                with Session(engine) as db:
                    barrier.wait(timeout=10)
                    operation(db, index)
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(run, [0, 1]))

        race(lambda db, i: upsert_pilot_settings(db, tenant_id="cb10",
            baseline_opportunities=12 if i == 0 else 4,
            baseline_note="approved" if i == 0 else "stale",
            weekly_export_count=1 if i == 0 else 2,
            last_uploaded_file_name="old.csv" if i == 0 else "new.csv",
            update_scope="baseline" if i == 0 else "upload"))
        race(lambda db, i: replace_taxonomy_overrides(db, tenant_id="cb10",
            overrides={"lead": {"phrases": [f"edit-{i}"]}}, merge=True))
        race(lambda db, i: upsert_detection_resume(db, tenant_id="cb10",
            failed_conversation_ids=[f"pending-{i}"], skipped_conversation_ids=[],
            expected_updated_at=datetime(1970, 1, 1, tzinfo=timezone.utc)))
        with Session(engine) as db:
            pilot = get_pilot_settings(db, "cb10")
            assert (pilot.baseline_opportunities, pilot.baseline_note) == (12, "approved")
            assert (pilot.weekly_export_count, pilot.last_uploaded_file_name) == (2, "new.csv")
            assert set(list_taxonomy_overrides(db, "cb10")["lead"]["phrases"]) == (
                {"existing", "edit-0", "edit-1"} if seeded else {"edit-0", "edit-1"})
            assert set(get_detection_resume(db, "cb10").failed_conversation_ids) == (
                {"prior", "pending-0", "pending-1"} if seeded else {"pending-0", "pending-1"})
    finally:
        get_settings.cache_clear()
        engine.dispose()


def _postgres_engine(monkeypatch):
    from app.config import get_settings
    assert URL and make_url(URL).database == "sioona_migration_test"
    assert make_url(URL).host in ("localhost", "127.0.0.1", "::1")
    assert not os.environ.get("MIGRATION_DATABASE_URL", "").strip()
    engine = create_engine(URL)
    monkeypatch.setenv("DATABASE_URL", URL)
    get_settings.cache_clear()
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    command.upgrade(Config("alembic.ini"), "head")
    return engine


@pytest.mark.parametrize("seeded,same_receipt,expected", [(True, False, 4), (False, False, 2), (True, True, 3), (False, True, 1)])
def test_concurrent_weekly_receipts_count_each_publication_once(monkeypatch, seeded, same_receipt, expected):
    """Two publications that both start from the same counter finish at the exact sum."""
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.config import get_settings
    from app.services.pilot import get_pilot_settings, upsert_pilot_settings
    from app.services.weekly_upload import apply_weekly_upload_receipt
    engine = _postgres_engine(monkeypatch)
    try:
        if seeded:
            with Session(engine) as db:
                upsert_pilot_settings(db, tenant_id="weekly", baseline_opportunities=4,
                    baseline_note="keep", weekly_export_count=2, last_uploaded_file_name="old.csv")
        barrier = Barrier(2)

        def publish(index):
            with Session(engine) as db:
                db.execute(text("SET lock_timeout = '8s'"))
                barrier.wait(timeout=10)
                apply_weekly_upload_receipt(db, tenant_id="weekly",
                    receipt_id="same" if same_receipt else f"upload-{index}",
                    weekly_file_count=1, last_uploaded_file_name=f"week-{index}.csv", update_filename=True)
                db.commit()

        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(publish, [0, 1]))
        with Session(engine) as db:
            pilot = get_pilot_settings(db, "weekly")
            assert pilot.weekly_export_count == expected
            assert pilot.last_uploaded_file_name in {"week-0.csv", "week-1.csv"}
            if seeded:
                assert (pilot.baseline_opportunities, pilot.baseline_note) == (4, "keep")
            apply_weekly_upload_receipt(db, tenant_id="weekly", receipt_id="same" if same_receipt else "upload-0",
                weekly_file_count=1, last_uploaded_file_name="replay.csv", update_filename=True)
            db.commit()
            assert get_pilot_settings(db, "weekly").weekly_export_count == expected
            assert get_pilot_settings(db, "weekly").last_uploaded_file_name != "replay.csv"
    finally:
        get_settings.cache_clear()
        engine.dispose()


@pytest.mark.parametrize("seeded", [False, True])
def test_concurrent_baseline_save_preserves_weekly_receipt(monkeypatch, seeded):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.config import get_settings
    from app.services.pilot import get_pilot_settings, upsert_pilot_settings
    from app.services.weekly_upload import apply_weekly_upload_receipt
    engine = _postgres_engine(monkeypatch)
    try:
        if seeded:
            with Session(engine) as db:
                upsert_pilot_settings(db, tenant_id="weekly", baseline_opportunities=4,
                    baseline_note="keep", weekly_export_count=2, last_uploaded_file_name="old.csv")
        barrier = Barrier(2)

        def run(index):
            with Session(engine) as db:
                db.execute(text("SET lock_timeout = '8s'"))
                barrier.wait(timeout=10)
                if index == 0:
                    apply_weekly_upload_receipt(db, tenant_id="weekly", receipt_id="upload",
                        weekly_file_count=1, last_uploaded_file_name="new.csv", update_filename=True)
                    db.commit()
                else:
                    upsert_pilot_settings(db, tenant_id="weekly", baseline_opportunities=12,
                        baseline_note="approved", weekly_export_count=1, last_uploaded_file_name="old.csv",
                        update_scope="baseline")

        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(run, [0, 1]))
        with Session(engine) as db:
            pilot = get_pilot_settings(db, "weekly")
            assert (pilot.baseline_opportunities, pilot.baseline_note) == (12, "approved")
            assert (pilot.weekly_export_count, pilot.last_uploaded_file_name) == (3 if seeded else 1, "new.csv")
    finally:
        get_settings.cache_clear()
        engine.dispose()


@pytest.mark.parametrize("prior", [None, "011_signal_urgency_value", "028_batch_cache"])
def test_postgres_fresh_and_existing_schema_upgrade(prior, monkeypatch):
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing to reset a non-test database"
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        cfg = Config("alembic.ini")
        if prior:
            command.upgrade(cfg, prior)
        command.upgrade(cfg, "head")
        schema = inspect(engine)
        assert "commercial_value_evidence" in {column["name"] for column in schema.get_columns("signal_predictions")}
        assert "coverage" in {column["name"] for column in schema.get_columns("detection_runs")}
        assert "payload" in {column["name"] for column in schema.get_columns("uploads")}
        assert "ix_upload_recovery_scan" in {index["name"] for index in schema.get_indexes("uploads")}
        assert "ix_prediction_tenant_active_id" in {index["name"] for index in schema.get_indexes("signal_predictions")}
        assert_membership_schema(schema)
        assert_inference_schema(schema)
        with Session(engine) as db:
            db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=datetime.now(timezone.utc)))
            db.commit()
            publish_upload(db, tenant_id="a", upload_id="u1", source="weekly.csv", content_sha256="a" * 64, conversation_ids=["c1"])
            db.commit()
            with pytest.raises(IntegrityError):
                publish_upload(db, tenant_id="b", upload_id="u1", source="weekly.csv", content_sha256="a" * 64, conversation_ids=["c1"])
            db.rollback()
            assert wipe_tenant_data(db, tenant_id="a")["conversations"] == 1
            assert_native_ingestion(db)
    finally:
        get_settings.cache_clear()
        engine.dispose()


@pytest.mark.parametrize("prior", [None, "019_upload_recovery_index"])
def test_membership_upgrade_from_empty_and_prior_head(prior, monkeypatch):
    """020 is additive. Empty and 019 both reach the membership constraints."""
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing to reset a non-test database"
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        cfg = Config("alembic.ini")
        if prior:
            command.upgrade(cfg, prior)
            assert "memberships" not in set(inspect(engine).get_table_names())
        command.upgrade(cfg, "head")
        assert_membership_schema(inspect(engine))
        assert_inference_schema(inspect(engine))
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO workspaces (tenant_id, name) VALUES ('tenant_a', 'A')"
            ))
            conn.execute(text(
                "INSERT INTO users (id, email) VALUES ('4f79ac56-3a83-5f2a-b143-dafc406b7c28', 'reviewer@example.test')"
            ))
            conn.execute(text(
                "INSERT INTO memberships (tenant_id, user_id, role) "
                "VALUES ('tenant_a', '4f79ac56-3a83-5f2a-b143-dafc406b7c28', 'reviewer')"
            ))
            with pytest.raises(IntegrityError):
                conn.execute(text(
                    "INSERT INTO memberships (tenant_id, user_id, role) "
                    "VALUES ('tenant_a', '4f79ac56-3a83-5f2a-b143-dafc406b7c28', 'admin')"
                ))
    finally:
        get_settings.cache_clear()
        engine.dispose()


@pytest.mark.parametrize("prior", [None, "020_workspaces_memberships"])
def test_inference_upgrade_from_empty_and_prior_head(prior, monkeypatch):
    """021 is additive. Empty and 020 both reach the ledger constraints."""
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing to reset a non-test database"
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        cfg = Config("alembic.ini")
        if prior:
            command.upgrade(cfg, prior)
            assert "inference_attempts" not in set(inspect(engine).get_table_names())
        command.upgrade(cfg, "head")
        assert_inference_schema(inspect(engine))
    finally:
        get_settings.cache_clear()
        engine.dispose()


def test_postgres_actor_read_mutate_and_revoke(monkeypatch):
    """One read, one write, and a revoke on the disposable database only."""
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing to reset a non-test database"
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings
    from app.db import get_db
    from app.main import app
    from app.models.membership import Membership
    from app.models.user import User, actor_user_id
    from app.models.workspace import Workspace
    from tests.test_actor_token import KEY, sign_like_web

    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "enforce")
    monkeypatch.setenv("SIOONA_ACTOR_KEY", KEY)
    monkeypatch.setenv("SIOONA_ENV", "development")
    monkeypatch.delenv("SIOONA_SERVICE_TOKEN", raising=False)
    get_settings.cache_clear()
    try:
        command.upgrade(Config("alembic.ini"), "head")
        user_id = actor_user_id("reviewer@example.test")
        with Session(engine) as db:
            db.add(Workspace(tenant_id="tenant_a", name="A"))
            db.add(Workspace(tenant_id="tenant_b", name="B"))
            db.flush()
            db.add(User(id=user_id, email="reviewer@example.test"))
            db.flush()
            db.add(Membership(tenant_id="tenant_a", user_id=user_id, role="reviewer"))
            db.commit()
        factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

        def override_get_db():
            session = factory()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_get_db
        headers = {
            "X-Tenant-Id": "tenant_a",
            "X-Sioona-Actor": sign_like_web(str(user_id), "tenant_a"),
        }
        with TestClient(app) as client:
            read = client.get("/v1/tenants/tenant_a/signal-score", headers=headers)
            assert read.status_code == 200
            assert read.json()["tenant_id"] == "tenant_a"
            created = client.post(
                "/v1/tenants/tenant_a/conversations",
                headers=headers,
                json={
                    "conversation_id": "shared",
                    "channel": "upload",
                    "started_at": "2026-10-01T00:00:00Z",
                    "external_id": "ext-shared",
                    "messages": [{
                        "message_id": "m1",
                        "role": "customer",
                        "content": "postgres-marker",
                        "timestamp": "2026-10-01T00:00:00Z",
                    }],
                },
            )
            assert created.status_code == 201, created.text
            hidden = client.get(
                "/v1/tenants/tenant_a/conversations",
                headers={
                    "X-Tenant-Id": "tenant_b",
                    "X-Sioona-Actor": sign_like_web(str(user_id), "tenant_b"),
                },
            )
            assert hidden.status_code == 404
            assert "postgres-marker" not in hidden.text
            with Session(engine) as db:
                row = db.get(Membership, ("tenant_a", user_id))
                row.revoked_at = datetime.now(timezone.utc)
                db.commit()
            denied = client.get("/v1/tenants/tenant_a/signal-score", headers=headers)
            assert denied.status_code == 404
            assert denied.json()["detail"] == "not_found"
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()
        engine.dispose()


def test_evidence_upgrade_preserves_populated_021(monkeypatch):
    """022 is additive. A populated 021 database keeps business rows and gains one head."""
    from alembic.script import ScriptDirectory

    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing to reset a non-test database"
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    from app.config import get_settings
    get_settings.cache_clear()
    prediction_id = "6b0c1a2e-7d44-4a1b-9c3e-11a0b7c8d9e0"
    feedback_id = "7c1d2b3f-8e55-4b2c-ad4f-22b1c8d9e0f1"
    try:
        cfg = Config("alembic.ini")
        command.upgrade(cfg, "021_inference_attempts")
        schema = inspect(engine)
        assert "content_sha256" not in {column["name"] for column in schema.get_columns("messages")}
        assert "evidence_status" not in {column["name"] for column in schema.get_columns("signal_predictions")}
        assert "signal_evidence" not in set(schema.get_table_names())
        with pytest.raises(Exception):
            with engine.connect() as conn:
                conn.execute(text("SELECT evidence_status FROM signal_predictions LIMIT 1"))
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO conversations (id, tenant_id, conversation_id, channel, started_at) "
                "VALUES ('11111111-1111-4111-8111-111111111111', 'tenant_a', 'c1', 'upload', now())"
            ))
            conn.execute(text(
                "INSERT INTO messages (id, tenant_id, conversation_id, message_id, role, content, timestamp) "
                "VALUES ('22222222-2222-4222-8222-222222222222', 'tenant_a', 'c1', 'm1', 'customer', "
                "'Please pause my SIP', now())"
            ))
            conn.execute(text(
                "INSERT INTO signal_predictions (id, tenant_id, conversation_id, signal_type, confidence, summary, "
                "acted, outcome, outcome_value_inr) "
                "VALUES (:id, 'tenant_a', 'c1', 'retention', 0.9, 'Leaving', true, 'retained', 500000)"
            ), {"id": prediction_id})
            conn.execute(text(
                "INSERT INTO signal_feedback (id, tenant_id, signal_id, feedback, note, reviewed_by) "
                "VALUES (:id, 'tenant_a', :signal_id, 'correct', 'kept', 'reviewer')"
            ), {"id": feedback_id, "signal_id": prediction_id})
        command.upgrade(cfg, "head")
        schema = inspect(engine)
        message_columns = {column["name"]: column for column in schema.get_columns("messages")}
        prediction_columns = {column["name"]: column for column in schema.get_columns("signal_predictions")}
        assert message_columns["content_sha256"]["nullable"] is True
        assert prediction_columns["evidence_status"]["nullable"] is True
        assert "ck_messages_content_sha256" in {item["name"] for item in schema.get_check_constraints("messages")}
        assert "ck_signal_predictions_evidence_status" in {
            item["name"] for item in schema.get_check_constraints("signal_predictions")
        }
        assert_evidence_schema(schema)
        heads = ScriptDirectory.from_config(cfg).get_heads()
        assert heads == ["033_supervised_action_executions"]
        with engine.begin() as conn:
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
            assert version == heads
            kept = conn.execute(text(
                "SELECT p.acted, p.outcome, p.outcome_value_inr, p.evidence_status, f.feedback, f.note, "
                "m.content, m.content_sha256 "
                "FROM signal_predictions p "
                "JOIN signal_feedback f ON f.signal_id = p.id "
                "JOIN messages m ON m.tenant_id = p.tenant_id AND m.conversation_id = p.conversation_id "
                "WHERE p.id = :id"
            ), {"id": prediction_id}).one()
            assert kept.acted is True
            assert kept.outcome == "retained"
            assert kept.outcome_value_inr == 500000
            assert kept.evidence_status is None
            assert kept.feedback == "correct"
            assert kept.note == "kept"
            assert kept.content == "Please pause my SIP"
            assert kept.content_sha256 is None
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(text(
                    "UPDATE signal_predictions SET evidence_status = 'invented' WHERE id = :id"
                ), {"id": prediction_id})
        with engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO signal_evidence (id, tenant_id, prediction_id, message_id, start_cp, end_cp, "
                "text_sha256, candidate_turns) VALUES ("
                "'33333333-3333-4333-8333-333333333333', 'tenant_a', :prediction_id, 'm1', 0, 4, :digest, 1)"
            ), {"prediction_id": prediction_id, "digest": "ab" * 32})
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(text(
                    "INSERT INTO signal_evidence (id, tenant_id, prediction_id, message_id, start_cp, end_cp, "
                    "text_sha256, candidate_turns) VALUES ("
                    "'44444444-4444-4444-8444-444444444444', 'tenant_a', :prediction_id, 'm1', 0, 4, :digest, 2)"
                ), {"prediction_id": prediction_id, "digest": "cd" * 32})
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(text(
                    "INSERT INTO signal_evidence (id, tenant_id, prediction_id, message_id, start_cp, end_cp, "
                    "text_sha256, candidate_turns) VALUES ("
                    "'55555555-5555-4555-8555-555555555555', 'tenant_a', "
                    "'66666666-6666-4666-8666-666666666666', 'm1', 0, 4, :digest, 1)"
                ), {"digest": "ef" * 32})
        with engine.begin() as conn:
            deleted = conn.execute(text(
                "DELETE FROM messages WHERE tenant_id = 'tenant_a' AND message_id = 'm1' RETURNING message_id"
            )).scalar_one()
            assert deleted == "m1"
            still_there = conn.execute(text(
                "SELECT message_id FROM signal_evidence WHERE prediction_id = :id"
            ), {"id": prediction_id}).scalar_one()
            assert still_there == "m1"
    finally:
        get_settings.cache_clear()
        engine.dispose()


def assert_evidence_schema(schema):
    assert "signal_evidence" in set(schema.get_table_names())
    columns = {column["name"] for column in schema.get_columns("signal_evidence")}
    assert {
        "id",
        "tenant_id",
        "prediction_id",
        "message_id",
        "start_cp",
        "end_cp",
        "text_sha256",
        "candidate_turns",
        "created_at",
    } <= columns
    uniques = schema.get_unique_constraints("signal_evidence")
    assert any(
        item["name"] == "uq_signal_evidence_span"
        or set(item["column_names"]) == {"prediction_id", "message_id", "start_cp", "end_cp"}
        for item in uniques
    )
    checks = {item["name"] for item in schema.get_check_constraints("signal_evidence")}
    assert {
        "ck_signal_evidence_span",
        "ck_signal_evidence_candidate_turns",
        "ck_signal_evidence_text_sha256",
    } <= checks
    fks = schema.get_foreign_keys("signal_evidence")
    assert any(item["name"] == "fk_signal_evidence_prediction" and item["referred_table"] == "signal_predictions" for item in fks)
    assert all("messages" not in (item["referred_table"] or "") for item in fks)
    indexes = {index["name"] for index in schema.get_indexes("signal_evidence")}
    assert {
        "ix_signal_evidence_tenant_prediction",
        "ix_signal_evidence_tenant_message",
    } <= indexes


def assert_inference_schema(schema):
    assert "inference_attempts" in set(schema.get_table_names())
    columns = {column["name"] for column in schema.get_columns("inference_attempts")}
    assert {
        "tenant_id",
        "attempt_id",
        "usage_status",
        "cost_status",
        "input_tokens",
        "detection_run_id",
    } <= columns
    forbidden = {"prompt", "transcript", "content", "quote", "message", "body", "evidence", "summary"}
    assert columns.isdisjoint(forbidden)
    uniques = schema.get_unique_constraints("inference_attempts")
    assert any(
        item["name"] == "uq_inference_attempts_tenant_attempt"
        or set(item["column_names"]) == {"tenant_id", "attempt_id"}
        for item in uniques
    )
    checks = {item["name"] for item in schema.get_check_constraints("inference_attempts")}
    assert {
        "ck_inference_attempts_status",
        "ck_inference_attempts_usage_status",
        "ck_inference_attempts_cost_status",
        "ck_inference_attempts_tokens_nonnegative",
    } <= checks
    indexes = {index["name"] for index in schema.get_indexes("inference_attempts")}
    assert {
        "ix_inference_attempts_tenant_started",
        "ix_inference_attempts_tenant_run",
    } <= indexes


def assert_membership_schema(schema):
    assert {"workspaces", "users", "memberships"} <= set(schema.get_table_names())
    workspace_pk = schema.get_pk_constraint("workspaces")["constrained_columns"]
    assert workspace_pk == ["tenant_id"]
    user_columns = {column["name"]: column for column in schema.get_columns("users")}
    assert user_columns["email"]["nullable"] is False
    assert any(
        set(item["column_names"]) == {"email"}
        for item in schema.get_unique_constraints("users")
    )
    membership_columns = {column["name"]: column for column in schema.get_columns("memberships")}
    assert membership_columns["revoked_at"]["nullable"] is True
    assert membership_columns["role"]["nullable"] is False
    assert schema.get_pk_constraint("memberships")["constrained_columns"] == ["tenant_id", "user_id"]
    checks = {item["name"] for item in schema.get_check_constraints("memberships")}
    assert "ck_memberships_role" in checks
    fks = {item["name"] for item in schema.get_foreign_keys("memberships")}
    assert {"fk_memberships_workspace", "fk_memberships_user"} <= fks


def assert_native_ingestion(db):
    """Exercise tenant locks, JSON membership filtering and provenance after DDL."""
    from app.schemas.ingestion import Ingestion
    from app.services.ingestion import publish_ingestion
    from app.api.routes.uploads import get_active_uploads, get_upload_snapshot
    from app.models.signal_prediction import SignalPrediction
    from app.models.detection_run import DetectionRun
    from app.services.signal_score import calculate_signal_score
    from sqlalchemy import select
    chats, detections = [], []
    for cid, content in [("c1", "I am closing my account, portfolio INR 500000"), ("c2", "Thanks, that is all")]:
        mid = f"{cid}-message"
        chats.append({"conversation_id": cid, "channel": "upload", "started_at": "2026-10-01T00:00:00Z",
                      "messages": [{"message_id": mid, "role": "customer", "content": content, "timestamp": "2026-10-01T00:00:00Z"}]})
        digest = hashlib.sha256(json.dumps([[mid, "customer", content]], separators=(",", ":")).encode()).hexdigest()
        detections.append({"conversation_id": cid, "content_hash": digest, "model_version": "m1", "prompt_version": "p1",
                          "coverage": {"included_turns": 1, "omitted_turns": 0, "truncated": False,
                                       "token_upper_bound": len(content.encode()), "token_budget": 2400},
                          "output": [{"signal_type": "retention", "confidence": .9, "summary": "Leaving",
                                      "evidence": [f'quote: "{content}"'], "mentioned_value_inr": 500000}] if cid == "c1" else []})
    body = Ingestion.model_validate({"source": "batch", "replace": True, "conversations": chats,
        "detections": detections, "files": [{"source": "one.csv", "conversation_ids": ["c1"]},
                                             {"source": "two.csv", "conversation_ids": ["c2"]}]})
    first = publish_ingestion(db, tenant_id="a", upload_id="native", body=body)
    assert first["status"] == "completed" and first["active"]
    assert publish_ingestion(db, tenant_id="a", upload_id="native", body=body) == first
    memberships = get_active_uploads("a", "a", db)
    assert {row.upload.source: row.conversation_ids for row in memberships} == {"one.csv": ["c1"], "two.csv": ["c2"]}
    for membership in memberships:
        snapshot = get_upload_snapshot("a", membership.upload.upload_id, "a", db)
        assert snapshot["run_id"] == "native"
        assert [chat["conversation_id"] for chat in snapshot["conversations"]] == membership.conversation_ids
        assert [item["conversation_id"] for item in snapshot["detections"]] == membership.conversation_ids
        assert snapshot["conversations"][0]["messages"][0]["content"] == next(
            chat["messages"][0]["content"] for chat in chats if chat["conversation_id"] == membership.conversation_ids[0])
    row = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a", SignalPrediction.active.is_(True)))
    assert row.commercial_value_evidence[0]["message_id"] == "c1-message"
    assert row.commercial_value_evidence[0]["amount_inr"] == 500000
    assert db.get(DetectionRun, ("a", "native", "c2")).coverage["included_turns"] == 1
    assert calculate_signal_score(db, "a").reviewed_count == 0
    assert wipe_tenant_data(db, tenant_id="a")["conversations"] == 2


def test_budget_upgrade_and_concurrent_last_allowance(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.services.inference_budget import configure, reserve, settle, BudgetDenied
    from app.models.inference_budget import InferenceBudget, InferenceReservation
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing a non-test database"
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        cfg = Config("alembic.ini")
        command.upgrade(cfg, "022_evidence_anchors")
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO workspaces (tenant_id, name) VALUES ('budget_test', 'Synthetic')"))
        command.upgrade(cfg, "head")
        assert {"inference_controls", "inference_budgets", "inference_run_budgets", "inference_reservations"} <= set(inspect(engine).get_table_names())
        with Session(engine) as db:
            configure(db, "budget_test", 1, 1, True, "", "synthetic-admin")
            db.commit()
        barrier = Barrier(2)
        def attempt(index):
            with Session(engine) as db:
                barrier.wait(timeout=10)
                try:
                    reserve(db, "budget_test", f"attempt_{index}", f"run_{index}", "groq", "model")
                    db.commit()
                    return "authorized"
                except BudgetDenied as error:
                    db.rollback()
                    return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, [1, 2]))
        assert sorted(results) == ["authorized", "daily_limit"]
        with Session(engine) as db:
            reservation = db.scalar(select(InferenceReservation))
            settle(db, "budget_test", reservation.attempt_id)
            settle(db, "budget_test", reservation.attempt_id)
            db.commit()
            assert db.scalar(select(InferenceBudget.attempts)) == 1
            assert db.scalar(text("SELECT count(*) FROM workspaces WHERE tenant_id='budget_test'")) == 1
            # Fresh runs do not bypass daily allowance; ambiguous authorization
            # remains consumed after a new connection (simulated caller crash).
            with pytest.raises(BudgetDenied, match="daily_limit"):
                reserve(db, "budget_test", "crash_retry", "new_run", "groq", "fallback")
            db.rollback()
            configure(db, "midnight_test", 3, 2, True, "", "admin")
            from datetime import datetime, timezone
            reserve(db, "midnight_test", "before", "r", "groq", "primary", now=datetime(2026, 10, 9, 18, 29, tzinfo=timezone.utc))
            reserve(db, "midnight_test", "after", "r", "groq", "fallback", now=datetime(2026, 10, 9, 18, 30, tzinfo=timezone.utc))
            db.commit()
        with Session(engine) as db:
            assert db.get(InferenceReservation, ("midnight_test", "before")).status == "authorized"
            assert db.get(InferenceReservation, ("midnight_test", "after")).status == "authorized"
            with pytest.raises(BudgetDenied, match="run_limit"):
                reserve(db, "midnight_test", "retry", "r", "groq", "fallback", now=datetime(2026, 10, 9, 18, 30, tzinfo=timezone.utc))
            db.rollback()
            configure(db, "global", 1, 1, False, "synthetic pause", "admin")
            db.commit()
        with Session(engine) as db:
            with pytest.raises(BudgetDenied, match="paused"):
                reserve(db, "midnight_test", "paused", "new_run", "groq", "primary")

    finally:
        get_settings.cache_clear()
        engine.dispose()


RLS_TABLES = (
    "messages",
    "conversations",
    "signal_predictions",
    "signal_feedback",
    "supervised_action_decisions",
    "detection_runs",
    "inference_attempts",
    "signal_evidence",
    "detection_resume",
    "weekly_upload_receipts",
    "jobs", "classification_cache", "job_conversations",
    "workspaces", "memberships", "pilot_settings", "taxonomy_overrides",
    "uploads", "upload_conversations", "inference_budgets",
    "inference_run_budgets", "inference_reservations", "inference_controls",
)


def test_runtime_role_rls_scopes_and_forgets_context(monkeypatch):
    """CB-04: runtime role sees one tenant, missing context sees none, one connection does not leak."""
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing a non-test database"
    assert not os.environ.get("MIGRATION_DATABASE_URL", "").strip(), "Refusing a migration URL during the test reset"
    engine = create_engine(URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    monkeypatch.setenv("DATABASE_URL", URL)
    monkeypatch.delenv("MIGRATION_DATABASE_URL", raising=False)
    from app.config import get_settings
    from app.db import bind_tenant, clear_tenant
    get_settings.cache_clear()
    try:
        cfg = Config("alembic.ini")
        command.upgrade(cfg, "head")
        with engine.begin() as conn:
            bypass = conn.execute(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user"
            )).scalar()
            assert bypass, "Seeding requires a migration role that bypasses RLS"
            role = conn.execute(text(
                """
                SELECT rolsuper, rolbypassrls, rolcanlogin
                FROM pg_roles WHERE rolname = 'sioona_runtime'
                """
            )).one()
            assert role == (False, False, False)
            for table in RLS_TABLES:
                flags = conn.execute(text(
                    """
                    SELECT c.relrowsecurity, c.relforcerowsecurity
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = :table
                    """
                ), {"table": table}).one()
                assert flags == (True, True), table
                policy = conn.execute(text(
                    """
                    SELECT cmd, qual, with_check
                    FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = :table AND policyname = 'tenant_isolation'
                    """
                ), {"table": table}).one()
                assert policy.cmd == "ALL"
                assert "current_setting('app.tenant_id'" in policy.qual
                assert "current_setting('app.tenant_id'" in policy.with_check
                assert conn.execute(text(
                    "SELECT has_table_privilege('sioona_runtime', :table, 'SELECT')"
                ), {"table": table}).scalar() is True
            assert conn.execute(text(
                """
                SELECT COUNT(*) FROM pg_policies
                WHERE policyname = 'tenant_isolation' AND tablename = 'workspaces'
                """
            )).scalar() == 1
            _seed_two_tenants(conn)
        _assert_runtime_isolation(engine)
        command.downgrade(cfg, "023_inference_budgets")
        with engine.begin() as conn:
            assert conn.execute(text(
                "SELECT COUNT(*) FROM pg_policies WHERE policyname = 'tenant_isolation'"
            )).scalar() == 0
            assert conn.execute(text(
                "SELECT COUNT(*) FROM pg_roles WHERE rolname = 'sioona_runtime'"
            )).scalar() == 1
        command.upgrade(cfg, "head")
        with engine.begin() as conn:
            assert conn.execute(text(
                "SELECT COUNT(*) FROM pg_policies WHERE policyname = 'tenant_isolation'"
            )).scalar() == len(RLS_TABLES) + 10  # CB-18/CB-17 forced-RLS tables
    finally:
        clear_tenant()
        get_settings.cache_clear()
        engine.dispose()


def _seed_two_tenants(conn) -> None:
    from app.models import Workspace, User, Membership
    from app.models.pilot_settings import PilotSettings
    from app.models.taxonomy_override import TaxonomyOverride
    from app.models.upload import Upload, UploadConversation
    from app.models.inference_budget import InferenceControl, InferenceBudget, InferenceRunBudget, InferenceReservation
    from uuid import UUID
    with Session(bind=conn) as db:
        for index, tenant in enumerate(("tenant_a", "tenant_b"), 1):
            user_id = UUID(int=index)
            db.add(Workspace(tenant_id=tenant, name=tenant))
            db.add(User(id=user_id, email=f"{tenant}@example.test"))
            db.flush()
            db.add(Membership(tenant_id=tenant, user_id=user_id, role="admin"))
            db.add(PilotSettings(tenant_id=tenant))
            db.add(TaxonomyOverride(tenant_id=tenant, signal_type="lead", phrases=[]))
            db.add(Upload(tenant_id=tenant, upload_id="upload", source="fixture", content_sha256="a" * 64))
            db.add(InferenceControl(scope=tenant, tenant_id=tenant, updated_by="fixture"))
            db.add(InferenceBudget(tenant_id=tenant, budget_day=datetime.now(timezone.utc).date()))
            db.add(InferenceRunBudget(tenant_id=tenant, run_id="run"))
            db.add(InferenceReservation(tenant_id=tenant, attempt_id="attempt", run_id="run", budget_day=datetime.now(timezone.utc).date()))
        db.flush()
    conn.execute(text(
        """
        INSERT INTO conversations (id, tenant_id, conversation_id, channel, started_at)
        VALUES
          ('10000000-0000-4000-8000-000000000001', 'tenant_a', 'chat-a', 'upload', now()),
          ('10000000-0000-4000-8000-000000000002', 'tenant_b', 'chat-b', 'upload', now())
        """
    ))
    conn.execute(text(
        """
        INSERT INTO messages (id, tenant_id, conversation_id, message_id, role, content, timestamp)
        VALUES
          ('20000000-0000-4000-8000-000000000001', 'tenant_a', 'chat-a', 'm-a', 'customer', 'a', now()),
          ('20000000-0000-4000-8000-000000000002', 'tenant_b', 'chat-b', 'm-b', 'customer', 'b', now())
        """
    ))
    conn.execute(text(
        """
        INSERT INTO signal_predictions (id, tenant_id, conversation_id, signal_type, confidence, summary)
        VALUES
          ('30000000-0000-4000-8000-000000000001', 'tenant_a', 'chat-a', 'lead', 0.5, 'a'),
          ('30000000-0000-4000-8000-000000000002', 'tenant_b', 'chat-b', 'lead', 0.5, 'b')
        """
    ))
    conn.execute(text(
        """
        INSERT INTO signal_feedback (id, tenant_id, signal_id, feedback, reviewed_by)
        VALUES
          ('40000000-0000-4000-8000-000000000001', 'tenant_a', '30000000-0000-4000-8000-000000000001', 'correct', 'reviewer'),
          ('40000000-0000-4000-8000-000000000002', 'tenant_b', '30000000-0000-4000-8000-000000000002', 'correct', 'reviewer')
        """
    ))
    conn.execute(text(
        """
        INSERT INTO supervised_action_decisions
          (id, tenant_id, conversation_id, action_type, status, subject, body, evidence_quote)
        VALUES
          ('50000000-0000-4000-8000-000000000001', 'tenant_a', 'chat-a', 'lead_outreach_draft', 'approved', 's', 'b', ''),
          ('50000000-0000-4000-8000-000000000002', 'tenant_b', 'chat-b', 'lead_outreach_draft', 'approved', 's', 'b', '')
        """
    ))
    conn.execute(text(
        """
        INSERT INTO detection_runs
          (tenant_id, run_id, conversation_id, content_hash, model_version, prompt_version, status, output)
        VALUES
          ('tenant_a', 'run-a', 'chat-a', :digest, 'model', 'prompt', 'complete', '[]'::json),
          ('tenant_b', 'run-b', 'chat-b', :digest, 'model', 'prompt', 'complete', '[]'::json)
        """
    ), {"digest": "a" * 64})
    conn.execute(text(
        """
        INSERT INTO inference_attempts (
          id, tenant_id, attempt_id, logical_operation_id, attempt_ordinal, stage,
          route_version, provider, model, prompt_version, status, usage_status, cost_status, started_at
        ) VALUES
          ('60000000-0000-4000-8000-000000000001', 'tenant_a', 'attempt-a', 'op-a', 1, 'detect', 'route', 'groq', 'model', 'prompt', 'pending', 'unknown', 'unknown', now()),
          ('60000000-0000-4000-8000-000000000002', 'tenant_b', 'attempt-b', 'op-b', 1, 'detect', 'route', 'groq', 'model', 'prompt', 'pending', 'unknown', 'unknown', now())
        """
    ))
    conn.execute(text(
        """
        INSERT INTO signal_evidence (
          id, tenant_id, prediction_id, message_id, start_cp, end_cp, text_sha256, candidate_turns
        ) VALUES
          ('70000000-0000-4000-8000-000000000001', 'tenant_a', '30000000-0000-4000-8000-000000000001', 'm-a', 0, 1, :digest, 1),
          ('70000000-0000-4000-8000-000000000002', 'tenant_b', '30000000-0000-4000-8000-000000000002', 'm-b', 0, 1, :digest, 1)
        """
    ), {"digest": "b" * 64})
    conn.execute(text(
        """
        INSERT INTO detection_resume (tenant_id, failed_conversation_ids, skipped_conversation_ids)
        VALUES
          ('tenant_a', '["chat-a"]'::json, '[]'::json),
          ('tenant_b', '[]'::json, '["chat-b"]'::json)
        """
    ))
    conn.execute(text(
        """
        INSERT INTO weekly_upload_receipts (tenant_id, receipt_id, weekly_file_count)
        VALUES
          ('tenant_a', 'receipt-a', 1),
          ('tenant_b', 'receipt-b', 1)
        """
    ))

    conn.execute(text("""
        INSERT INTO uploads (tenant_id, upload_id, source, content_sha256, status)
        VALUES ('tenant_a','job-source-a','synthetic',:digest,'staged'),
               ('tenant_b','job-source-b','synthetic',:digest,'staged')
    """), {"digest": "a" * 64})
    conn.execute(text("""
        INSERT INTO jobs (tenant_id,id,job_type,upload_id,conversation_ids_sha256,conversation_count,config_sha256)
        VALUES ('tenant_a','job-a','upload','job-source-a',:digest,1,:digest),
               ('tenant_b','job-b','upload','job-source-b',:digest,1,:digest)
    """), {"digest": "a" * 64})

    conn.execute(text("""
        INSERT INTO job_conversations (tenant_id,job_id,conversation_id,ordinal,content_sha256,context_sha256)
        VALUES ('tenant_a','job-a','chat-a',0,:digest,:digest), ('tenant_b','job-b','chat-b',0,:digest,:digest)
    """), {"digest": "a" * 64})
    conn.execute(text("""
        INSERT INTO classification_cache (tenant_id,content_sha256,prompt_version,model_id,route_version,taxonomy_hash,classification,expires_at)
        VALUES ('tenant_a',:digest,'p','m','r',:digest,'{}',now()), ('tenant_b',:digest,'p','m','r',:digest,'{}',now())
    """), {"digest": "a" * 64})
    conn.execute(text("INSERT INTO upload_conversations (tenant_id, upload_id, conversation_id) VALUES ('tenant_a', 'upload', 'chat-a'), ('tenant_b', 'upload', 'chat-b')"))


def _assert_runtime_isolation(engine) -> None:
    from app.db import bind_tenant, clear_tenant
    with engine.connect() as conn:
        for table in RLS_TABLES:
            seen = conn.execute(text(f"SELECT DISTINCT tenant_id FROM {table} WHERE tenant_id IS NOT NULL")).scalars().all()
            assert sorted(seen) == ["tenant_a", "tenant_b"], table
        conn.commit()
        conn.execute(text("SET ROLE sioona_runtime"))
        conn.commit()
        try:
            _as_runtime(conn, "tenant_a", ["tenant_a"])
            clear_tenant()
            _as_runtime(conn, None, [])
            _as_runtime(conn, "tenant_b", ["tenant_b"])
            trans = conn.begin()
            conn.execute(text("SELECT set_config('app.tenant_id', 'tenant_a', true)"))
            with pytest.raises(DBAPIError, match="row-level security"):
                conn.execute(text(
                    """
                    INSERT INTO messages (id, tenant_id, conversation_id, message_id, role, content, timestamp)
                    VALUES ('20000000-0000-4000-8000-000000000003', 'tenant_b', 'chat-b', 'm-x', 'customer', 'x', now())
                    """
                ))
            trans.rollback()
            trans = conn.begin()
            conn.execute(text("SELECT set_config('app.tenant_id', 'tenant_a', true)"))
            conn.execute(text(
                """
                INSERT INTO messages (id, tenant_id, conversation_id, message_id, role, content, timestamp)
                VALUES ('20000000-0000-4000-8000-000000000004', 'tenant_a', 'chat-a', 'm-ok', 'customer', 'ok', now())
                """
            ))
            trans.commit()
            session = Session(bind=conn)
            bind_tenant(session, "tenant_a")
            visible = session.execute(text("SELECT DISTINCT tenant_id FROM messages")).scalars().all()
            assert visible == ["tenant_a"]
            session.commit()
            clear_tenant()
            leaked = session.execute(text("SELECT count(*) FROM messages")).scalar()
            assert leaked == 0
            session.commit()
        finally:
            clear_tenant()
            conn.rollback()
            conn.execute(text("RESET ROLE"))
            conn.commit()


def _as_runtime(conn, tenant, expected) -> None:
    trans = conn.begin()
    if tenant is not None:
        conn.execute(text("SELECT set_config('app.tenant_id', :tenant_id, true)"), {"tenant_id": tenant})
    for table in RLS_TABLES:
        seen = conn.execute(text(f"SELECT DISTINCT tenant_id FROM {table} WHERE tenant_id IS NOT NULL ORDER BY tenant_id")).scalars().all()
        assert seen == expected, table
    trans.commit()


@pytest.mark.parametrize("existing", ["fresh", "safe", "unsafe"])
def test_rls_upgrade_with_non_superuser_migration_owner(monkeypatch, existing):
    """Neon owner has CREATEROLE/BYPASSRLS, but cannot ALTER SUPERUSER attributes."""
    assert URL and make_url(URL).database == 'sioona_migration_test'
    assert not os.environ.get('MIGRATION_DATABASE_URL', '').strip()
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.config import get_settings
    engine = create_engine(URL)
    owner = 'cb04_test_migration_owner'
    runtime = 'cb04_test_runtime'
    monkeypatch.setenv('DATABASE_URL', URL)
    get_settings.cache_clear()
    try:
        with engine.begin() as conn:
            conn.execute(text('DROP SCHEMA public CASCADE'))
            conn.execute(text('CREATE SCHEMA public'))
            conn.execute(text(f'CREATE ROLE {owner} NOLOGIN NOSUPERUSER CREATEROLE BYPASSRLS'))
        command.upgrade(Config('alembic.ini'), '023_inference_budgets')
        spec = importlib.util.spec_from_file_location('rls_migration_test', Path('alembic/versions/024_tenant_rls.py'))
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        monkeypatch.setattr(migration, 'RUNTIME_ROLE', runtime)
        with engine.begin() as conn:
            conn.execute(text(f'ALTER SCHEMA public OWNER TO {owner}'))
            tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).scalars().all()
            for table in tables:
                conn.execute(text(f'ALTER TABLE public."{table}" OWNER TO {owner}'))
            if existing != 'fresh':
                attribute = 'CREATEROLE' if existing == 'unsafe' else 'NOCREATEROLE'
                conn.execute(text(f'CREATE ROLE {runtime} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB {attribute}'))
            conn.execute(text(f'SET LOCAL ROLE {owner}'))
            assert conn.execute(text('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).scalar() is False
            monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(conn)))
            if existing == 'unsafe':
                with pytest.raises(DBAPIError, match='Unsafe runtime role attributes'):
                    with conn.begin_nested():
                        migration.upgrade()
                assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE policyname='tenant_isolation'")).scalar() == 0
                return
            migration.upgrade()
            attributes = conn.execute(text('SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname=:role'), {'role': runtime}).one()
            assert attributes == (False, False, False, False, False)
            assert conn.execute(text("SELECT count(*) FROM pg_policies WHERE policyname='tenant_isolation'")).scalar() == 8
    finally:
        with engine.begin() as conn:
            conn.execute(text('DROP SCHEMA public CASCADE'))
            conn.execute(text('CREATE SCHEMA public'))
            for role in (runtime, owner):
                if conn.execute(text('SELECT 1 FROM pg_roles WHERE rolname=:role'), {'role': role}).scalar():
                    conn.execute(text(f'DROP OWNED BY {role} CASCADE'))
                    conn.execute(text(f'DROP ROLE {role}'))
        get_settings.cache_clear()
        engine.dispose()


@pytest.fixture
def job_pg(monkeypatch):
    from app.config import get_settings
    from app.db import clear_tenant

    monkeypatch.setenv("SIOONA_DETECTION_EXECUTION", "worker")
    monkeypatch.setenv("SIOONA_WORKER_TENANTS", "a,b")
    monkeypatch.setenv("SIOONA_WORKER_PAUSE", "0")
    monkeypatch.setenv("DETECT_LLM", "0")
    engine = _postgres_engine(monkeypatch)
    yield engine
    clear_tenant()
    get_settings.cache_clear()
    engine.dispose()


def _job_seed(engine, ids=("c1",), upload="u1", tenant="a"):
    from tests.test_jobs import body
    from app.services import jobs
    from app.db import bind_tenant

    with Session(engine) as db:
        bind_tenant(db, tenant)
        row = jobs.enqueue_upload(db, tenant, upload, body(ids))
        db.commit()
        return row.id


def _runtime_session(engine, tenant):
    from app.db import bind_tenant

    db = Session(engine)
    from sqlalchemy import event

    event.listen(
        db,
        "after_begin",
        lambda session, transaction, connection: connection.execute(
            text("SET LOCAL ROLE sioona_runtime")
        ),
    )
    bind_tenant(db, tenant)
    assert db.scalar(text("SELECT current_user")) == "sioona_runtime"
    return db


def test_cb11_skip_locked_two_independent_workers(job_pg):
    """Hold the first row lock while another runtime connection claims."""
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.services import jobs

    jid = _job_seed(job_pg)
    barrier = Barrier(2)

    def race(owner):
        with _runtime_session(job_pg, "a") as db:
            barrier.wait(timeout=10)
            lease = jobs.claim(db, "a", owner)
            barrier.wait(timeout=10)  # Both claims finish before either commits.
            db.commit()
            return lease

    with ThreadPoolExecutor(max_workers=2) as pool:
        leases = list(pool.map(race, ["one", "two"]))
    assert sum(l is not None for l in leases) == 1
    assert next(l for l in leases if l).job_id == jid


def test_cb11_expired_reclaim_fences_publication_completion_and_heartbeat(job_pg):
    from app.services import jobs
    from app.models.job import Job
    from app.models.detection_run import DetectionRun
    from app.services.detection_runs import conversation_content_hash

    jid = _job_seed(job_pg)
    with _runtime_session(job_pg, "a") as db:
        stale = jobs.claim(db, "a", "old")
        db.commit()
    with Session(job_pg) as db:
        db.get(Job, ("a", jid)).lease_expires_at = datetime.now(
            timezone.utc
        ) - __import__("datetime").timedelta(seconds=1)
        db.commit()
    with _runtime_session(job_pg, "a") as db:
        fresh = jobs.claim(db, "a", "new")
        db.commit()
        assert fresh.token == stale.token + 1
        for operation in (
            lambda: jobs.heartbeat(db, stale),
            lambda: jobs.complete(db, stale),
            lambda: jobs.publish_conversation(
                db,
                stale,
                "c1",
                conversation_content_hash(db, "a", "c1"),
                "heuristic",
                [],
            ),
        ):
            with pytest.raises(jobs.LeaseLost):
                operation()
            db.rollback()
        assert db.get(DetectionRun, ("a", jid, "c1")) is None
        jobs.publish_conversation(
            db, fresh, "c1", conversation_content_hash(db, "a", "c1"), "heuristic", []
        )
        db.commit()
        jobs.complete(db, fresh)
        db.commit()
        assert db.get(Job, ("a", jid)).status == "succeeded"


@pytest.mark.parametrize("after_commit", [False, True])
def test_cb11_crash_publication_boundary_retries_only_unpublished(job_pg, after_commit):
    from app.services import jobs
    from app.models.job import Job
    from app.models.detection_run import DetectionRun
    from app.worker import Worker
    from sqlalchemy.orm import sessionmaker

    jid = _job_seed(job_pg, ids=("c1", "c2"))
    with _runtime_session(job_pg, "a") as db:
        lease = jobs.claim(db, "a", "first")
        db.commit()
        content_hash = jobs.conversation_content_hash(db, "a", "c1")
        jobs.publish_conversation(db, lease, "c1", content_hash, "heuristic", [])
        if after_commit:
            db.commit()
        else:
            db.rollback()
    with Session(job_pg) as db:
        db.get(Job, ("a", jid)).lease_expires_at = datetime.now(
            timezone.utc
        ) - __import__("datetime").timedelta(seconds=1)
        db.commit()
    publications = []

    def sessions():
        return _runtime_session(job_pg, "a")

    from unittest.mock import patch

    original = jobs.publish_conversation

    def record(db, lease, cid, *args, **kwargs):
        publications.append(cid)
        return original(db, lease, cid, *args, **kwargs)

    with patch.object(jobs, "publish_conversation", record):
        assert Worker(sessions, owner="second").run_once("a")
    assert publications == (["c2"] if after_commit else ["c1", "c2"])
    with Session(job_pg) as db:
        assert db.get(Job, ("a", jid)).status == "succeeded"
        assert (
            len(
                db.scalars(select(DetectionRun).where(DetectionRun.run_id == jid)).all()
            )
            == 2
        )


def test_cb11_runtime_jobs_isolation_and_constraints(job_pg):
    from app.services import jobs
    from app.models.job import Job

    a = _job_seed(job_pg, tenant="a")
    b = _job_seed(job_pg, tenant="b")
    with _runtime_session(job_pg, "a") as db:
        assert db.get(Job, ("b", b)) is None
        assert db.scalar(select(Job).where(Job.tenant_id == "b")) is None
        assert (
            db.execute(
                text("UPDATE jobs SET status='cancelled' WHERE tenant_id='b'")
            ).rowcount
            == 0
        )
        with pytest.raises(DBAPIError, match="row-level security"):
            db.execute(
                text(
                    "INSERT INTO jobs (tenant_id,id,job_type,upload_id,conversation_ids_sha256,conversation_count,config_sha256) VALUES ('b','bad','upload','u1',:d,1,:d)"
                ),
                {"d": "a" * 64},
            )
        db.rollback()
    with _runtime_session(job_pg, "a") as db:
        db.execute(text("SELECT set_config('app.tenant_id','',true)"))
        assert db.scalar(text("SELECT count(*) FROM jobs")) == 0
    with Session(job_pg) as db:
        for field, value in [("status", "running"), ("max_attempts", 4), ("cursor", 2)]:
            with pytest.raises(IntegrityError):
                setattr(db.get(Job, ("a", a)), field, value)
                db.commit()
            db.rollback()


def test_cb11_atomic_enqueue_crash_and_lease_exhaustion(job_pg):
    from app.services import jobs
    from app.models.job import Job
    from app.models.detection_resume import DetectionResume
    from tests.test_jobs import body

    with _runtime_session(job_pg, "a") as db:
        row = jobs.enqueue_upload(db, "a", "rolled-back", body())
        jid = row.id
        db.rollback()
        assert db.get(Job, ("a", jid)) is None
        assert (
            db.get(
                __import__("app.models.upload", fromlist=["Upload"]).Upload,
                ("a", "rolled-back"),
            )
            is None
        )
    jid = _job_seed(job_pg)
    with _runtime_session(job_pg, "a") as db:
        for index in range(3):
            lease = jobs.claim(db, "a", f"worker-{index}")
            db.commit()
            assert lease.token == index + 1
            row = db.get(Job, ("a", jid))
            row.lease_expires_at = datetime.now(timezone.utc) - __import__(
                "datetime"
            ).timedelta(seconds=1)
            db.commit()
        assert jobs.reap_exhausted(db, "a") == 1
        db.commit()
        assert db.get(Job, ("a", jid)).status == "dead_lettered"
        assert db.get(DetectionResume, "a").failed_conversation_ids == ["c1"]
        assert jobs.claim(db, "a", "fourth") is None


@pytest.mark.parametrize(
    "crash",
    ["before_call", "after_response", "before_publication", "after_publication"],
)
def test_cb11_provider_and_commit_crash_boundaries_are_metered(
    job_pg, monkeypatch, crash
):
    from datetime import timedelta
    from unittest.mock import patch
    from app.config import get_settings
    from app.services import jobs
    from app.services.inference_budget import configure
    from app.models.job import Job
    from app.models.inference_attempt import InferenceAttempt
    from app.models.detection_run import DetectionRun
    from app.worker import Worker

    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    with Session(job_pg) as db:
        configure(db, "a", 20, 20, True, "synthetic", jobs.PRINCIPAL)
        db.commit()
    jid = _job_seed(job_pg)
    calls = []
    parsed = {
        "type": "lead",
        "confidence": 0.9,
        "summary": "Buying intent",
        "quotes": ["I want to open a demat account"],
    }

    def provider(model, messages):
        with _runtime_session(job_pg, "a") as db:
            attempt = db.scalar(
                select(InferenceAttempt)
                .where(InferenceAttempt.job_id == jid)
                .order_by(InferenceAttempt.started_at.desc())
            )
            assert attempt.status == "pending" and attempt.input_tokens is None
        if crash == "before_call" and not calls:
            calls.append("crash")
            raise SystemExit("simulated process loss before dispatch")
        calls.append("provider")
        if crash == "after_response" and len(calls) == 1:
            raise SystemExit("simulated process loss after response")
        return parsed, {"status": "succeeded", "usage": {}}

    sessions = lambda: _runtime_session(job_pg, "a")
    original_publish = jobs.publish_conversation
    if crash == "before_publication":

        def crash_publish(*args, **kwargs):
            raise SystemExit("simulated process loss before publication")

        manager = patch.object(jobs, "publish_conversation", crash_publish)
    elif crash == "after_publication":
        manager = patch.object(
            jobs,
            "complete",
            side_effect=SystemExit("simulated process loss after publication commit"),
        )
    else:
        from contextlib import nullcontext

        manager = nullcontext()
    with manager, pytest.raises(SystemExit):
        Worker(sessions, call=provider).run_once("a")
    with _runtime_session(job_pg, "a") as db:
        first = db.scalar(
            select(InferenceAttempt).where(InferenceAttempt.job_id == jid)
        )
        assert first is not None
        assert first.status == (
            "pending" if crash in {"before_call", "after_response"} else "succeeded"
        )
        assert first.usage_status == "unknown" and first.input_tokens is None
        row = db.get(Job, ("a", jid))
        row.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    if crash in {"before_call", "after_response"}:
        # A new provider response is returned on retry; old ambiguous admission
        # remains metered as pending/unknown and is never refunded or reused.
        crash = "already_crashed"
    calls_before = len(calls)
    assert Worker(sessions, call=provider).run_once("a")
    with _runtime_session(job_pg, "a") as db:
        assert db.get(Job, ("a", jid)).status == "succeeded"
        assert (
            len(
                db.scalars(select(DetectionRun).where(DetectionRun.run_id == jid)).all()
            )
            == 1
        )
        attempts = db.scalars(
            select(InferenceAttempt).where(InferenceAttempt.job_id == jid)
        ).all()
        assert len(attempts) == (1 if len(calls) == calls_before else 2)
        assert all(
            a.input_tokens is None and a.usage_status == "unknown" for a in attempts
        )


def test_cb11_cancellation_in_flight_and_unknown_usage(job_pg, monkeypatch):
    from app.config import get_settings
    from app.services import jobs
    from app.services.inference_budget import configure
    from app.models.job import Job
    from app.models.inference_attempt import InferenceAttempt
    from app.models.detection_resume import DetectionResume
    from app.models.detection_run import DetectionRun
    from app.worker import Worker

    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    with Session(job_pg) as db:
        configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL)
        db.commit()
    jid = _job_seed(job_pg)

    def call(*_):
        with _runtime_session(job_pg, "a") as db:
            jobs.cancel(db, "a", jid)
            db.commit()
        return {
            "type": "lead",
            "confidence": 0.9,
            "summary": "Buying",
            "quotes": ["I want to open a demat account"],
        }, {"status": "succeeded", "usage": {}}

    assert Worker(lambda: _runtime_session(job_pg, "a"), call=call).run_once("a")
    with _runtime_session(job_pg, "a") as db:
        assert db.get(Job, ("a", jid)).status == "cancelled"
        assert db.get(DetectionRun, ("a", jid, "c1")) is None
        assert db.get(DetectionResume, "a").failed_conversation_ids == ["c1"]
        attempt = db.scalar(select(InferenceAttempt))
        assert attempt.status == "succeeded" and attempt.usage_status == "unknown"


def test_cb11_executable_refuses_owner_connection(job_pg, monkeypatch):
    from app import db as db_module
    from app.worker import main

    monkeypatch.setattr(db_module, "engine", job_pg)
    with pytest.raises(SystemExit, match="sioona_runtime"):
        main()


def test_all_tenant_tables_have_rls(monkeypatch):
    from app.models import Base
    engine = _postgres_engine(monkeypatch)
    try:
        with engine.begin() as conn:
            for table in Base.metadata.sorted_tables:
                if "tenant_id" not in table.c:
                    continue
                flags = conn.execute(text("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = to_regclass(:name)"), {"name": table.name}).one()
                assert flags == (True, True), table.name
    finally:
        engine.dispose()


def test_global_controls_readable_but_only_control_tenant_can_write(monkeypatch):
    from app.config import get_settings
    from app.db import bind_tenant, clear_tenant
    from app.services.inference_budget import configure
    engine = _postgres_engine(monkeypatch)
    monkeypatch.setenv("SIOONA_GLOBAL_CONTROL_TENANT", "tenant_control")
    get_settings.cache_clear()
    try:
        with Session(engine) as db:
            configure(db, "global", 10, 5, False, "paused", "fixture")
            db.commit()
        with engine.connect() as conn:
            conn.execute(text("SET ROLE sioona_runtime"))
            conn.commit()
            with Session(bind=conn) as db:
                bind_tenant(db, "tenant_other")
                assert db.execute(text("SELECT enabled FROM inference_controls WHERE scope = 'global'")).scalar() is False
                # SELECT policy must not accidentally grant UPDATE authority.
                assert db.execute(text("UPDATE inference_controls SET enabled = true WHERE scope = 'global'")).rowcount == 0
                db.rollback()
                bind_tenant(db, "tenant_control")
                configure(db, "global", 10, 5, True, "resumed", "fixture")
                db.commit()
                clear_tenant()
                assert db.execute(text("SELECT count(*) FROM inference_controls")).scalar() == 0
                db.rollback()
            conn.execute(text("RESET ROLE"))
            conn.commit()
    finally:
        clear_tenant()
        get_settings.cache_clear()
        engine.dispose()




def test_cb11_verified_api_to_runtime_worker_and_polling(job_pg, monkeypatch):
    """HTTP acceptance, real outbox, runtime processing, and tenant-safe polling."""
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker
    from app.main import app
    from app.db import get_db, clear_tenant
    from app.config import get_settings
    from app.worker import Worker
    from app.models.job import Job
    from app.models.inference_attempt import InferenceAttempt
    from app.services import jobs
    from app.services.inference_budget import configure
    from tests.actor_support import add_member, actor_headers
    from tests.test_actor_token import KEY
    from tests.test_jobs import body

    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "enforce")
    monkeypatch.setenv("SIOONA_ACTOR_KEY", KEY)
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    factory = sessionmaker(bind=job_pg)
    a = add_member(factory, "a@example.test", "a", "reviewer")
    b = add_member(factory, "b@example.test", "b", "reviewer")
    with Session(job_pg) as db:
        configure(db, "a", 10, 10, True, "synthetic", jobs.PRINCIPAL)
        db.commit()

    def request_db():
        db = Session(job_pg)
        from sqlalchemy import event
        event.listen(db, "after_begin", lambda session, transaction, connection:
                     connection.execute(text("SET LOCAL ROLE sioona_runtime")))
        try:
            yield db
        finally:
            db.close()
            clear_tenant()

    def provider(*_):
        with _runtime_session(job_pg, "a") as db:
            attempt = db.scalar(select(InferenceAttempt))
            assert attempt.status == "pending"
            assert db.scalar(text("SELECT count(*) FROM inference_reservations")) == 1
        return {"type": "lead", "confidence": 0.9, "summary": "Buying intent",
                "quotes": ["I want to open a demat account"]}, {"status": "succeeded", "usage": {}}

    prior = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = request_db
    try:
        with TestClient(app) as client:
            payload = body().model_dump(mode="json")
            response = client.put("/v1/tenants/a/jobs/uploads/u1", json=payload,
                                  headers=actor_headers(a, "a"))
            assert response.status_code == 202, response.text
            jid = response.json()["job_id"]
            assert response.json()["status"] == "queued"
            replay = client.put("/v1/tenants/a/jobs/uploads/u1", json=payload,
                                headers=actor_headers(a, "a"))
            assert replay.status_code == 202 and replay.json()["job_id"] == jid
            assert client.get(f"/v1/tenants/b/jobs/{jid}", headers=actor_headers(b, "b")).status_code == 404
            worker = Worker(lambda: _runtime_session(job_pg, "a"), call=provider)
            assert worker.run_once("a")
            status = client.get(f"/v1/tenants/a/jobs/{jid}", headers=actor_headers(a, "a"))
            assert status.status_code == 200
            assert status.json()["status"] == "succeeded"
            assert status.json()["completed_conversations"] == 1
            assert "demat" not in status.text
            assert not worker.run_once("a")
            with _runtime_session(job_pg, "a") as db:
                assert db.get(Job, ("a", jid)).cursor == 1
                assert db.scalar(select(InferenceAttempt)).usage_status == "unknown"
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(prior)
        get_settings.cache_clear()


def test_cb15_dashboard_reconciliation_under_runtime_rls(job_pg):
    from tests.test_economics_dashboard import _seed, NOW
    from app.services.economics_dashboard import build_economics_dashboard
    from datetime import timedelta
    from decimal import Decimal
    with Session(job_pg) as db:
        _seed(db, "a")
        _seed(db, "b", multiplier=3)
    with _runtime_session(job_pg, "a") as db:
        result = build_economics_dashboard(db, tenant_id="a", from_ts=NOW - timedelta(days=1), to_ts=NOW, now=NOW)
        assert (result.funnel.ingested, result.funnel.processed, result.funnel.correct) == (2, 2, 1)
        assert result.funnel.influenced_value_inr == 500
        assert result.quality.signal_score == 1
        assert result.quality.abstention_rate == .5
        assert result.reliability.p50_latency_ms == 200
        assert result.reliability.p95_latency_ms == 290
        assert result.economics.input_tokens == 100
        assert result.economics.unknown_usage_rate == .5
        assert result.economics.known_cost_usd == Decimal("0.02")
        assert [p.estimated_cost_usd for p in result.economics.projections] == [Decimal("100"), Decimal("500"), Decimal("1000")]
        assert all(p.incomplete for p in result.economics.projections)
        # Deliberately request B through A's DB context: RLS must still deny rows.
        denied = build_economics_dashboard(db, tenant_id="b", from_ts=NOW - timedelta(days=1), to_ts=NOW, now=NOW)
        assert denied.funnel.ingested == denied.funnel.processed == denied.economics.attempts == 0
        assert denied.funnel.surfaced == denied.funnel.reviewed == 0


def test_cb15_reference_sql_under_runtime_rls(job_pg):
    from pathlib import Path
    from decimal import Decimal
    import re
    from datetime import timedelta
    from tests.test_economics_dashboard import _seed, NOW, _attempt
    from app.models.signal_prediction import SignalPrediction
    from app.models.detection_run import DetectionRun
    from app.models.job import Job
    from app.services.economics_dashboard import build_economics_dashboard
    with Session(job_pg) as db:
        _seed(db, "a")
        _seed(db, "b", multiplier=3)
        prediction = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))
        prediction.created_at = NOW - timedelta(days=40)
        job = db.get(Job, ("a", "job-a"))
        job.status, job.created_at = "queued", NOW-timedelta(days=40)
        db.add(DetectionRun(tenant_id="a", run_id="repeat", conversation_id="chat-a-0", content_hash="f"*64, model_version="m", prompt_version="p", status="complete", output=[], created_at=NOW-timedelta(hours=2)))
        attempt = _attempt("a", "repeat", ordinal=1, latency=500, cost="0.03")
        attempt.detection_run_id, attempt.cost_status = "repeat", "reconciled"
        db.add(attempt)
        db.commit()
    cookbook = (Path(__file__).resolve().parents[2] / "docs/DEVELOPMENT_COOKBOOK.md").read_text()
    section = cookbook.split("### 13.3 Queries", 1)[1].split("### 13.4", 1)[0]
    queries = re.findall(r"```sql\n(.*?)```", section, re.S)
    assert len(queries) == 4
    start, end = NOW-timedelta(days=1), NOW
    parameters = {"tenant_id": "a", "date_from": start, "date_to": end, "run_id": "run-a-0"}
    with _runtime_session(job_pg, "a") as db:
        dashboard = build_economics_dashboard(db, tenant_id="a", from_ts=start, to_ts=end, now=NOW)
        # Execute the cookbook SQL itself. Only replace the moving daily window
        # with the fixed half-open test window and explicit tenant predicate.
        run_rows = db.execute(text(queries[0]), parameters).mappings().all()
        daily_sql = queries[1].replace("started_at >= now() - interval '30 days'", "tenant_id = :tenant_id AND started_at >= :date_from AND started_at < :date_to")
        daily = db.execute(text(daily_sql), parameters).mappings().all()
        acceptance = db.execute(text(queries[2]), parameters).mappings().all()
        funnel = db.execute(text(queries[3]), parameters).mappings().all()
        assert sum(r["attempts"] for r in run_rows) == 2
        assert dashboard.economics.attempts == sum(r["attempts"] for r in daily)
        assert dashboard.economics.known_cost_usd == sum(r["estimated_cost_usd"] for r in daily)
        assert dashboard.economics.input_tokens == sum(r["input_tokens"] for r in daily)
        assert dashboard.economics.cached_input_tokens == sum(r["cached_input_tokens"] for r in daily)
        assert dashboard.economics.output_tokens == sum(r["output_tokens"] for r in daily)
        assert dashboard.economics.unknown_cost_count == sum(r["unknown_cost_attempts"] for r in daily)
        assert len(daily) == 1
        assert dashboard.reliability.p95_latency_ms == daily[0]["p95_latency_ms"]
        assert dashboard.quality.reviewed == sum(r["reviewed"] for r in acceptance)
        assert dashboard.quality.correct == sum(r["correct"] for r in acceptance)
        assert dashboard.quality.by_signal_type[0].acceptance_rate == float(acceptance[0]["acceptance"])
        assert dashboard.funnel.surfaced == sum(r["signals"] for r in funnel)
        assert dashboard.funnel.acted == sum(r["acted"] for r in funnel)
        assert dashboard.funnel.positive_outcomes == sum(r["positive_outcomes"] for r in funnel)
        assert dashboard.funnel.processed == 2
        assert dashboard.economics.cost_per_processed_conversation_usd == Decimal("0.025")
        assert dashboard.reliability.queue_depth == 1
        assert next(a for a in dashboard.alerts if a.key == "queue_age").status == "alert"


def test_cb14_cache_race_and_runtime_isolation(job_pg):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.services import classification_cache as cache
    from app.models.classification_cache import ClassificationCache
    from tests.test_jobs import body
    chat = body().conversations[0]
    key = cache.identity("a", chat, "model", {})
    parsed = {"type": "lead", "confidence": .9, "summary": "Buying intent", "quotes": ["I want to open a demat account"]}
    barrier = Barrier(2)
    def write(index):
        with _runtime_session(job_pg, "a") as db:
            barrier.wait(timeout=10)
            cache.store(db, key, {**parsed, "confidence": .8 + index / 10}, chat)
            db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(write, range(2)))
    with _runtime_session(job_pg, "a") as db:
        assert len(list(db.scalars(select(ClassificationCache)))) == 1
        winner = cache.lookup(db, key, chat)[0]
        assert winner["confidence"] in {.8, .9}
        assert winner["summary"] == ""
        cache.store(db, key, parsed, chat)
        db.commit()
        db.expire_all()
        assert cache.lookup(db, key, chat)[0] == winner
    with _runtime_session(job_pg, "b") as db:
        assert cache.lookup(db, key, chat) is None
        with pytest.raises(DBAPIError, match="row-level security"):
            cache.store(db, key, parsed, chat)
            db.commit()
        db.rollback()


def test_cb14_10k_historical_restart_and_ledger(job_pg, monkeypatch):
    """Real RLS worker: 10K sources, process loss after response and after commit."""
    import time
    from app.config import get_settings
    from app.services import jobs
    from app.services.conversations import upsert_conversations
    from app.services.inference_budget import configure
    from app.models.job import Job
    from app.models.job_conversation import JobConversation
    from app.models.inference_attempt import InferenceAttempt
    from app.models.inference_budget import InferenceReservation
    from app.models.signal_prediction import SignalPrediction
    from app.models.signal_evidence import SignalEvidence
    from app.models.detection_run import DetectionRun
    from app.worker import Worker
    from tests.test_jobs import body
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker
    from app.main import app
    from app.db import get_db, clear_tenant
    from tests.actor_support import add_member, actor_headers
    from tests.test_actor_token import KEY
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "enforce")
    monkeypatch.setenv("SIOONA_ACTOR_KEY", KEY)
    monkeypatch.setenv("DETECT_LLM", "1")
    monkeypatch.setenv("DETECT_LLM_PRIMARY", "1")
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    actor = add_member(sessionmaker(bind=job_pg), "history@example.test", "a", "reviewer")
    started = time.monotonic()
    ids = [f"historical-{i:05}" for i in range(10000)]
    with Session(job_pg) as owner_db:
        configure(owner_db, "global", 1000, 1000, True, "synthetic", jobs.PRINCIPAL)
        owner_db.commit()
    with _runtime_session(job_pg, "a") as db:
        configure(db, "a", 20, 20, True, "synthetic", jobs.PRINCIPAL)
        for offset in range(0, len(ids), 100):
            upsert_conversations(db, tenant_id="a", payloads=body(ids[offset:offset + 100]).conversations, commit=False)
        db.commit()
    def request_db():
        with _runtime_session(job_pg, "a") as db:
            try:
                yield db
            finally:
                clear_tenant()

    prior = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = request_db
    try:
        enqueue_start = time.monotonic()
        with TestClient(app) as client:
            response = client.post("/v1/tenants/a/jobs/historical",
                json={"request_id": "history-10k", "conversation_ids": ids},
                headers=actor_headers(actor, "a"))
        assert response.status_code == 202, response.text
        assert response.json()["status"] == "queued"
        assert response.json()["completed_conversations"] == 0
        jid = response.json()["job_id"]
        enqueue_seconds = time.monotonic() - enqueue_start
        assert enqueue_seconds < 10  # Below both the read and historical enqueue timeout.
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(prior)
    with _runtime_session(job_pg, "a") as db:
        assert db.scalar(select(func.count()).select_from(InferenceAttempt)) == 0
    calls = []
    def provider(model, messages):
        calls.append(model)
        if len(calls) == 1:
            raise SystemExit("synthetic loss after provider response")
        return {"type": "lead", "confidence": .9, "summary": "Buying intent", "quotes": ["I want to open a demat account"]}, {"status": "succeeded", "usage": {"input_tokens": 10, "output_tokens": 5, "cached_input_tokens": 2}}
    sessions = lambda: _runtime_session(job_pg, "a")
    worker = Worker(sessions, call=provider)
    with pytest.raises(SystemExit):
        worker.run_once("a")
    def expire():
        with Session(job_pg) as db:
            db.execute(text("UPDATE jobs SET lease_expires_at=now()-interval '1 second' WHERE tenant_id='a' AND id=:id"), {"id": jid})
            db.commit()
    expire()
    worker = Worker(sessions, call=provider)
    original = worker.transaction
    committed_hits = 0
    def crash_after_commit(tenant, operation):
        nonlocal committed_hits
        result = original(tenant, operation)
        if operation.__name__ == "use_cached" and result:
            committed_hits += 1
            if committed_hits == 150:
                raise SystemExit("synthetic loss after cache ledger and publication commit")
        return result
    worker.transaction = crash_after_commit
    with pytest.raises(SystemExit):
        while worker.run_once("a"):
            pass
    expire()
    worker = Worker(sessions, call=provider)
    ticks = 0
    while worker.run_once("a"):
        ticks += 1
        assert ticks <= 101
    with _runtime_session(job_pg, "a") as db:
        row = db.get(Job, ("a", jid))
        assert row.status == "succeeded" and row.cursor == row.conversation_count == 10000
        assert len(calls) == 2
        attempts = list(db.scalars(select(InferenceAttempt).where(InferenceAttempt.job_id == jid)))
        assert len(attempts) == 10001
        assert sum(a.cache_hit for a in attempts) == 9999
        assert sum(a.status == "pending" for a in attempts) == 1
        assert all(a.input_tokens is None and a.estimated_cost_usd is None for a in attempts if a.status == "pending")
        assert all(a.estimated_cost_usd == 0 and a.cached_input_tokens == 0 for a in attempts if a.cache_hit)
        reported = next(a for a in attempts if not a.cache_hit and a.status == "succeeded")
        assert (reported.input_tokens, reported.output_tokens, reported.cached_input_tokens) == (10, 5, 2)
        from app.services.inference_ledger import query_detection_run_inference
        summary = query_detection_run_inference(db, tenant_id="a", detection_run_id=jid)
        assert (summary.attempts, summary.cache_hits, summary.pending, summary.unknown_usage_count) == (10001, 9999, 1, 1)
        assert (summary.reported_input_tokens, summary.reported_output_tokens) == (10, 5)
        assert db.scalar(select(func.count()).select_from(InferenceReservation)) == 2
        assert db.scalar(select(func.count()).select_from(DetectionRun).where(DetectionRun.run_id == jid)) == 10000
        assert db.scalar(select(func.count()).select_from(JobConversation).where(JobConversation.completed.is_(True))) == 10000
        assert db.scalar(select(func.count()).select_from(SignalPrediction).where(SignalPrediction.active.is_(True))) == 10000
        assert db.scalar(select(func.count()).select_from(SignalEvidence)) == 10000
        from app.models.message import Message
        from app.services.evidence_anchors import reconstruct, text_sha256
        anchors = list(db.scalars(select(SignalEvidence)))
        messages = {m.message_id: m for m in db.scalars(select(Message).where(Message.tenant_id == "a"))}
        predictions = {p.id: p for p in db.scalars(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))}
        assert len(anchors) == 10000
        reconstructed = set()
        for anchor in anchors:
            message = messages[anchor.message_id]
            prediction = predictions[anchor.prediction_id]
            assert anchor.tenant_id == message.tenant_id == prediction.tenant_id == "a"
            assert message.conversation_id == prediction.conversation_id
            assert prediction.detection_run_id == jid
            assert anchor.text_sha256 == text_sha256(message.content)
            assert 0 <= anchor.start_cp < anchor.end_cp <= len(message.content)
            assert reconstruct(message.content, start=anchor.start_cp, end=anchor.end_cp,
                digest=anchor.text_sha256) == "I want to open a demat account"
            reconstructed.add(message.conversation_id)
        assert reconstructed == set(ids)
        # Retry of completed request is idempotent, with no additional attempts.
        assert jobs.enqueue_historical(db, "a", "history-10k", ids).id == jid
        db.commit()
        assert db.scalar(select(func.count()).select_from(InferenceAttempt).where(InferenceAttempt.job_id == jid)) == 10001
    assert not worker.run_once("a")
    print(f"CB14_10K seconds={time.monotonic()-started:.3f} enqueue_seconds={enqueue_seconds:.3f} provider_calls=2 cache_hits=9999 attempts=10001")


def test_cb14_migration_constraints_and_safe_downgrade(job_pg, monkeypatch):
    from app.models.inference_attempt import InferenceAttempt
    from app.services import jobs
    from app.services.conversations import upsert_conversations
    from tests.test_jobs import body
    with _runtime_session(job_pg, "a") as db:
        db.add(InferenceAttempt(tenant_id="a", attempt_id="invalid-hit", logical_operation_id="op", attempt_ordinal=1,
            stage="detect", route_version="r", provider="groq", model="m", prompt_version="p", cache_hit=True,
            status="succeeded", usage_status="reported", started_at=datetime.now(timezone.utc),
            cost_status="reconciled", estimated_cost_usd=0))
        with pytest.raises(IntegrityError, match="ck_inference_cache_hit"):
            db.flush()
        db.rollback()
    # Empty additive revision can roll back and upgrade without losing baseline.
    command.downgrade(Config("alembic.ini"), "027_jobs")
    command.upgrade(Config("alembic.ini"), "head")
    with _runtime_session(job_pg, "a") as db:
        upsert_conversations(db, tenant_id="a", payloads=body().conversations, commit=False)
        jobs.enqueue_historical(db, "a", "retained", ["c1"])
        db.commit()
    with pytest.raises(DBAPIError, match="historical jobs must be retained"):
        command.downgrade(Config("alembic.ini"), "027_jobs")
    assert inspect(job_pg).has_table("job_conversations")


def test_cb18_runtime_audit_rls_and_append_only(job_pg):
    import uuid
    from app.services import lifecycle
    from app.models.lifecycle import AuditEvent
    actor = str(uuid.uuid4())
    for tenant in ('a','b'):
        with _runtime_session(job_pg, tenant) as db:
            lifecycle.audit(db, tenant, actor, 'retention_sweep')
            db.commit()
    with job_pg.connect() as conn:
        conn.execute(text('SET ROLE sioona_runtime'))
        conn.commit()
        assert conn.scalar(text('SELECT count(*) FROM audit_events')) == 0
        conn.rollback()
    with _runtime_session(job_pg, 'a') as db:
        assert list(db.scalars(select(AuditEvent.tenant_id))) == ['a']
        for statement in ('UPDATE audit_events SET result=\'failed\'', 'DELETE FROM audit_events', 'TRUNCATE audit_events'):
            with pytest.raises(DBAPIError, match='permission denied'):
                db.execute(text(statement))
            db.rollback()
        lifecycle.audit(db, 'b', actor, 'retention_sweep')
        with pytest.raises(DBAPIError, match='row-level security'):
            db.commit()
        db.rollback()
        for table in ('audit_events','legal_holds','tenant_deletions','tenant_exports','lifecycle_ledger_summaries'):
            assert db.execute(text('SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid=to_regclass(:name)'), {'name':table}).one() == (True,True)


def test_cb18_runtime_hold_crash_resume_worker_fence_and_shared_user(job_pg):
    from tests.test_audit_lifecycle import seed
    from app.services import lifecycle, jobs
    from app.models import User, Workspace, SignalEvidence
    from app.models.lifecycle import TenantDeletion, LifecycleLedgerSummary
    from app.models.job import Job
    from app.db import bind_tenant
    import uuid
    with Session(job_pg) as db:
        actor, solo = seed(db)
    jid = _job_seed(job_pg)
    with _runtime_session(job_pg, 'a') as db:
        lease = jobs.claim(db, 'a', 'cb18-worker')
        db.commit()
        held = lifecycle.place_hold(db, 'a', actor, 'litigation', 'conversation', 'c')
        held_id = held.id
        request = lifecycle.request_deletion(db, 'a', actor)
        request_id = request.id
        with pytest.raises(lifecycle.LifecycleError, match='legal_hold'):
            lifecycle.confirm_deletion(db, 'a', request_id, actor, 'DELETE a')
        db.rollback()
        with pytest.raises(lifecycle.LifecycleError, match='legal_hold'):
            lifecycle.sweep(db, 'a', actor)
        db.rollback()
        exported = lifecycle.create_export(db, 'a', actor)
        export_id = exported.id
        lifecycle.release_hold(db, 'a', actor, held_id)
        lifecycle.confirm_deletion(db, 'a', request_id, actor, 'DELETE a')
        assert db.get(Job, ('a', jid)).status == 'cancelled'
        with pytest.raises(jobs.JobError):
            jobs.fenced(db, lease, corpus=True)
        db.rollback()
        with pytest.raises(lifecycle.LifecycleError):
            lifecycle.download_export(db, 'a', export_id)
        db.rollback()
        # A late direct writer is rejected by DB enforcement as well as leases.
        db.add(Conversation(tenant_id='a', conversation_id='late', channel='chat', started_at=datetime.now(timezone.utc)))
        with pytest.raises(DBAPIError, match='tenant_deleting'):
            db.commit()
        db.rollback()
        first = lifecycle.advance_deletion(db, 'a', request_id, actor, batch_size=1)
        checkpoint = first.checkpoint
    # Close and reopen runtime sessions at every checkpoint (process crash model).
    for _ in range(100):
        with _runtime_session(job_pg, 'a') as db:
            row = lifecycle.advance_deletion(db, 'a', request_id, actor, batch_size=1)
            if row.state == 'completed':
                break
    else:
        pytest.fail('deletion did not complete')
    with Session(job_pg) as db:
        assert db.get(TenantDeletion, 'a').state == 'completed'
        assert db.get(User, uuid.UUID(actor)) is not None
        assert db.get(User, solo) is None
        assert db.get(Workspace, 'a') is None and db.get(Workspace, 'b') is not None
        assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.tenant_id=='a')) == 0
        assert db.scalar(select(func.count()).select_from(LifecycleLedgerSummary).where(LifecycleLedgerSummary.tenant_id=='a')) == 1


def test_cb18_mid_step_failure_and_restore_reconciliation(job_pg, monkeypatch):
    from tests.test_audit_lifecycle import seed
    from app.services import lifecycle
    from app.models.lifecycle import TenantDeletion
    from app.models import SignalEvidence, Workspace, Membership
    from app.db import bind_tenant
    import uuid
    with Session(job_pg) as db:
        actor, _ = seed(db)
    with _runtime_session(job_pg, 'a') as db:
        row = lifecycle.request_deletion(db, 'a', actor)
        rid = row.id
        lifecycle.confirm_deletion(db, 'a', rid, actor, 'DELETE a')
        lifecycle.advance_deletion(db, 'a', rid, actor)  # exports
        checkpoint = row.checkpoint
        original = lifecycle.delete_batch
        def crash(*args):
            original(*args)
            raise RuntimeError('synthetic_mid_step_crash')
        monkeypatch.setattr(lifecycle, 'delete_batch', crash)
        with pytest.raises(RuntimeError):
            lifecycle.advance_deletion(db, 'a', rid, actor)
        db.refresh(row)
        assert row.state == 'failed' and row.checkpoint == checkpoint
        assert db.scalar(select(func.count()).select_from(SignalEvidence)) == 1
        monkeypatch.setattr(lifecycle, 'delete_batch', original)
        # A hold placed after fencing blocks the next batch without un-fencing.
        hold = lifecycle.place_hold(db, 'a', actor, 'investigation', 'tenant', None)
        hid = hold.id
        assert lifecycle.advance_deletion(db, 'a', rid, actor).state == 'blocked'
        lifecycle.release_hold(db, 'a', actor, hid)
        while lifecycle.advance_deletion(db, 'a', rid, actor).state != 'completed':
            pass
        receipt = lifecycle.receipt(row)
        assert receipt['counts']['signal_evidence'] == 1
        assert receipt['counts']['memberships'] == 2
        with pytest.raises(DBAPIError, match='deletion_fence_is_permanent'):
            db.execute(text("UPDATE tenant_deletions SET fenced=false WHERE tenant_id='a'"))
        db.rollback()
    # Disposable backup model: restore old source rows without the current fence.
    with Session(job_pg) as db:
        db.execute(text("DELETE FROM tenant_deletions WHERE tenant_id='a'"))
        db.add(Workspace(tenant_id='a', name='restored'))
        db.flush()
        db.add(Membership(tenant_id='a', user_id=uuid.UUID(actor), role='admin'))
        db.add(Conversation(tenant_id='a', conversation_id='restored', channel='chat', started_at=datetime.now(timezone.utc)))
        db.commit()
        bind_tenant(db, 'a')
        restored = lifecycle.reconcile_tombstone(db, 'a', receipt, actor)
        assert restored.fenced
    with _runtime_session(job_pg, 'a') as db:
        while lifecycle.advance_deletion(db, 'a', rid, actor).state != 'completed':
            pass
        assert db.scalar(select(func.count()).select_from(Conversation)) == 0
    with _runtime_session(job_pg, 'b') as db:
        assert db.scalar(select(func.count()).select_from(Conversation)) == 1


def test_cb18_export_has_one_snapshot_during_concurrent_update(job_pg, monkeypatch):
    from tests.test_audit_lifecycle import seed
    from app.services import lifecycle
    from app.models import Message
    from sqlalchemy import update
    from concurrent.futures import ThreadPoolExecutor
    with Session(job_pg) as db:
        actor, _ = seed(db)
        db.execute(update(Conversation).where(Conversation.tenant_id=='a').values(customer_name='before'))
        db.execute(update(Message).where(Message.tenant_id=='a').values(content='before',content_sha256=hashlib.sha256(b'before').hexdigest()))
        db.commit()
    with _runtime_session(job_pg, 'a') as db:
        execute = db.execute
        changed = False
        def intercept(statement, *args, **kwargs):
            nonlocal changed
            result = execute(statement, *args, **kwargs)
            if not changed and 'FROM conversations' in str(statement):
                changed = True
                def writer():
                    with _runtime_session(job_pg, 'a') as other:
                        other.execute(text("SET LOCAL lock_timeout = '5s'"))
                        other.execute(update(Conversation).where(Conversation.tenant_id=='a').values(customer_name='after'))
                        other.execute(update(Message).where(Message.tenant_id=='a').values(content='after',content_sha256=hashlib.sha256(b'after').hexdigest()))
                        other.commit()
                with ThreadPoolExecutor(max_workers=1) as pool:
                    pool.submit(writer).result(timeout=10)
            return result
        monkeypatch.setattr(db, 'execute', intercept)
        export = lifecycle.create_export(db, 'a', actor)
        payload = lifecycle.download_export(db, 'a', export.id)
        assert changed
        assert payload['data']['conversations'][0]['customer_name'] == 'before'
        assert payload['data']['messages'][0]['content'] == 'before'
        lifecycle.verify_bundle(payload)


def test_cb18_privileged_expiry_is_age_tenant_and_hold_restricted(job_pg):
    from tests.test_audit_lifecycle import seed
    from app.services import lifecycle
    from app.models.lifecycle import AuditEvent, LifecycleLedgerSummary
    from datetime import timedelta
    import uuid
    with Session(job_pg) as db:
        actor, _ = seed(db)
        for tenant in ('a','b'):
            lifecycle.audit(db, tenant, actor, 'retention_sweep')
        db.commit()
        db.execute(text("UPDATE audit_events SET created_at=now()-interval '366 days'"))
        lifecycle.audit(db, 'a', actor, 'retention_sweep')
        db.add(LifecycleLedgerSummary(tenant_id='a', id=str(uuid.uuid4()), attempts=1, unknown_attempts=1,
            reserved_usd=0, spent_usd=0, created_at=datetime.now(timezone.utc)-timedelta(days=366)))
        db.commit()
    with _runtime_session(job_pg, 'a') as db:
        hold = lifecycle.place_hold(db, 'a', actor, 'litigation', 'tenant', None)
        hid = hold.id
        with pytest.raises(DBAPIError, match='legal_hold'):
            db.execute(text("SELECT cb18_expire_summaries('a')"))
        db.rollback()
        lifecycle.release_hold(db, 'a', actor, hid)
        assert db.scalar(text("SELECT cb18_expire_summaries('a')")) == 2
        db.commit()
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 3  # recent + hold + release
        with pytest.raises(DBAPIError, match='tenant_mismatch'):
            db.execute(text("SELECT cb18_expire_summaries('b')"))
        db.rollback()
    with _runtime_session(job_pg, 'b') as db:
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 1


def test_cb18_export_waiting_for_deletion_fails_closed(job_pg):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event, current_thread
    from sqlalchemy import event
    from app.services import lifecycle
    from app.models.lifecycle import TenantExport
    from tests.test_audit_lifecycle import seed
    with Session(job_pg) as db:
        actor, _ = seed(db)
    with _runtime_session(job_pg, 'a') as db:
        request_id = lifecycle.request_deletion(db, 'a', actor).id
    waiting, resume = Event(), Event()
    def pause_export(conn, cursor, statement, parameters, context, executemany):
        if current_thread().name.startswith('cb18-export') and 'pg_advisory' in statement and not waiting.is_set():
            waiting.set()
            assert resume.wait(15), 'deletion did not release export'
    event.listen(job_pg, 'before_cursor_execute', pause_export)
    def export():
        with _runtime_session(job_pg, 'a') as db:
            try:
                lifecycle.create_export(db, 'a', actor)
            except lifecycle.LifecycleError as exc:
                return str(exc)
            return 'incorrectly_published'
    try:
        with ThreadPoolExecutor(max_workers=1, thread_name_prefix='cb18-export') as pool:
            future = pool.submit(export)
            try:
                assert waiting.wait(10), 'export did not reach serialization'
                with _runtime_session(job_pg, 'a') as db:
                    lifecycle.confirm_deletion(db, 'a', request_id, actor, 'DELETE a')
                    while lifecycle.advance_deletion(db, 'a', request_id, actor).state != 'completed':
                        pass
            finally:
                resume.set()
            assert future.result(timeout=15) == 'tenant_deleting'
    finally:
        event.remove(job_pg, 'before_cursor_execute', pause_export)
    with _runtime_session(job_pg, 'a') as db:
        assert db.scalar(select(func.count()).select_from(TenantExport)) == 0
        # Failed export must release the session lock, even on a pooled connection.
        key = int.from_bytes(hashlib.sha256(b'a').digest()[:8], 'big', signed=True)
        assert db.scalar(text('SELECT pg_try_advisory_xact_lock(:key)'), {'key': key})


def test_cb18_runtime_export_artifact_writes_are_fenced(job_pg):
    from app.services import lifecycle
    from app.models.lifecycle import TenantExport
    from tests.test_audit_lifecycle import seed
    with Session(job_pg) as db:
        actor, _ = seed(db)
    with _runtime_session(job_pg, 'a') as db:
        request_id = lifecycle.request_deletion(db, 'a', actor).id
        lifecycle.confirm_deletion(db, 'a', request_id, actor, 'DELETE a')
        db.add(TenantExport(tenant_id='a', bundle={}, expires_at=datetime.now(timezone.utc)))
        with pytest.raises(DBAPIError, match='tenant_deleting'):
            db.commit()
        db.rollback()


def test_cb18_deleted_summary_expiry_uses_restricted_runtime_function(job_pg):
    from datetime import timedelta
    from app.services import lifecycle
    from app.models.lifecycle import AuditEvent, LifecycleLedgerSummary, TenantDeletion, LegalHold
    from tests.test_audit_lifecycle import seed
    old = datetime.now(timezone.utc) - timedelta(days=366)
    with Session(job_pg) as db:
        actor, _ = seed(db)
    with _runtime_session(job_pg, 'a') as db:
        rid = lifecycle.request_deletion(db, 'a', actor).id
        lifecycle.confirm_deletion(db, 'a', rid, actor, 'DELETE a')
        while lifecycle.advance_deletion(db, 'a', rid, actor).state != 'completed':
            pass
        assert lifecycle.expire_deleted_tenant_summaries(db, 'a') == 0
    with Session(job_pg) as db:
        db.get(TenantDeletion, 'a').completed_at = old
        for tenant in ('a', 'b'):
            lifecycle.audit(db, tenant, actor, 'retention_sweep')
        db.flush()
        db.execute(text("UPDATE audit_events SET created_at=:old"), {'old':old})
        db.execute(text("UPDATE lifecycle_ledger_summaries SET created_at=:old"), {'old':old})
        hold = LegalHold(tenant_id='a', reason_code='litigation', resource_type='tenant')
        db.add(hold)
        db.commit()
        hid = hold.id
    with _runtime_session(job_pg, 'a') as db:
        with pytest.raises(lifecycle.LifecycleError, match='legal_hold'):
            lifecycle.expire_deleted_tenant_summaries(db, 'a')
        db.rollback()
        lifecycle.release_hold(db, 'a', actor, hid)
        assert lifecycle.expire_deleted_tenant_summaries(db, 'a') > 0
        assert lifecycle.expire_deleted_tenant_summaries(db, 'a') == 0
        assert db.scalar(select(func.count()).select_from(LifecycleLedgerSummary)) == 0
        assert db.get(TenantDeletion, 'a').state == 'completed'
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 1  # recent release retained
    with _runtime_session(job_pg, 'b') as db:
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 1


def test_cb19_worker_pause_resume(job_pg, monkeypatch):
    """Pause after first publication while a real runtime lease is active."""
    from app.worker import Worker
    from app.services import jobs
    from app.models.job import Job
    from app.models.detection_run import DetectionRun
    from app.config import get_settings
    jid = _job_seed(job_pg, ids=('c1', 'c2'))
    original = jobs.publish_conversation
    def pause_after_publish(*args, **kwargs):
        result = original(*args, **kwargs)
        monkeypatch.setenv('SIOONA_WORKER_PAUSE', '1')
        return result
    monkeypatch.setattr(jobs, 'publish_conversation', pause_after_publish)
    worker = Worker(lambda: _runtime_session(job_pg, 'a'))
    assert worker.run_once('a')
    assert not worker.tick()
    with _runtime_session(job_pg, 'a') as db:
        assert db.scalar(select(func.count()).select_from(DetectionRun)) == 1
        row = db.get(Job, ('a', jid))
        assert row.status == 'queued'
        assert row.lease_owner is None and row.lease_expires_at is None
    monkeypatch.setattr(jobs, 'publish_conversation', original)
    monkeypatch.setenv('SIOONA_WORKER_PAUSE', '0')
    get_settings.cache_clear()
    assert worker.run_once('a')
    assert not worker.run_once('a')
    with _runtime_session(job_pg, 'a') as db:
        assert db.get(Job, ('a', jid)).status == 'succeeded'
        assert db.scalar(select(func.count()).select_from(DetectionRun)) == 2
        from app.models.weekly_upload_receipt import WeeklyUploadReceipt
        assert db.scalar(select(func.count()).select_from(WeeklyUploadReceipt)) == 1


@pytest.mark.parametrize('scope', ['global', 'a'])
def test_cb19_provider_kill_switch(job_pg, monkeypatch, scope):
    import time
    from app.worker import Worker
    from app.services.inference_budget import configure
    from app.config import get_settings
    from app.models.detection_run import DetectionRun
    from app.models.inference_attempt import InferenceAttempt
    monkeypatch.setenv('DETECT_LLM', '1')
    monkeypatch.setenv('DETECT_LLM_PRIMARY', '1')
    monkeypatch.setenv('GROQ_API_KEY', 'synthetic-never-dispatched')
    get_settings.cache_clear()
    _job_seed(job_pg)
    with Session(job_pg) as db:
        for control in ('global', 'a'):
            configure(db, control, 10, 10, True, 'rehearsal', 'operator')
        db.commit()
    calls = []
    def unavailable(*args):
        calls.append(1)
        raise AssertionError('provider must never be dispatched after pause')
    worker = Worker(lambda: _runtime_session(job_pg, 'a'), call=unavailable)
    with Session(job_pg) as db:
        configure(db, scope, 10, 10, False, 'provider_outage', 'operator')
        db.commit()
    begin = time.monotonic()
    assert worker.run_once('a')
    assert time.monotonic() - begin <= 60
    assert calls == []
    from app.models.job import Job
    with _runtime_session(job_pg, 'a') as db:
        run = db.scalar(select(DetectionRun))
        assert run is not None and run.model_version == 'heuristic'
        assert db.scalar(select(Job)).last_error_category == 'ai_paused'
        assert db.scalar(select(func.count()).select_from(InferenceAttempt)) == 0


def test_cb19_backup_restore_tombstone(job_pg, tmp_path):
    """Restore an actual pre-deletion pg_dump; replay externally retained receipt."""
    import subprocess
    from pathlib import Path
    from decimal import Decimal
    from uuid import UUID
    from app.services import lifecycle
    from app.models import Base, SignalEvidence
    from app.models.lifecycle import AuditEvent, LegalHold, LifecycleLedgerSummary, TenantExport
    import sys
    binaries = Path(os.environ.get('CB19_PG_BIN', '/opt/homebrew/opt/postgresql@17/bin' if sys.platform == 'darwin' else '/usr/lib/postgresql/17/bin'))
    url = make_url(URL)
    env = dict(os.environ, PGPASSWORD=url.password or '')
    connection = ['-h', url.host, '-p', str(url.port or 5432), '-U', url.username, '-d', url.database]
    protected_tables = (*lifecycle.DELETE_ORDER, 'audit_events', 'legal_holds', 'lifecycle_ledger_summaries')

    def tenant_snapshot(db, tenant):
        snapshot = {}
        for name in protected_tables:
            table = Base.metadata.tables[name]
            primary_key = tuple(table.primary_key.columns)
            rows = [tuple(str(value) for value in row) for row in db.execute(
                select(*primary_key).where(table.c.tenant_id == tenant)
            )]
            encoded = json.dumps(sorted(rows), separators=(',', ':')).encode()
            snapshot[name] = {
                'count': len(rows),
                'primary_key_digest': hashlib.sha256(encoded).hexdigest(),
            }
        return snapshot

    with job_pg.begin() as conn:
        _seed_two_tenants(conn)
    actor = str(UUID(int=1))
    with Session(job_pg) as db:
        expires = datetime.now(timezone.utc).replace(microsecond=0)
        for tenant in ('tenant_a', 'tenant_b'):
            db.add(TenantExport(tenant_id=tenant, bundle={'tenant': tenant}, expires_at=expires))
        db.add(AuditEvent(tenant_id='tenant_b', actor_id=actor, resource_type='tenant',
            resource_id=actor, operation='retention_sweep'))
        db.add(LegalHold(tenant_id='tenant_b', reason_code='litigation', resource_type='tenant'))
        db.add(LifecycleLedgerSummary(tenant_id='tenant_b', id='summary-b', attempts=1,
            unknown_attempts=0, reserved_usd=Decimal('1'), spent_usd=Decimal('1')))
        db.commit()
        # Include CB-16 records in both tenants' actual backup/restore proof.
        from app.models.live_ingest import LiveInstallation, LiveEvent, LiveSource
        for tenant in ('tenant_a', 'tenant_b'):
            db.add(LiveInstallation(tenant_id=tenant, id='restore-install',
                workspace_id=f'{tenant}-restore', credential_ref='INTERCOM_CLIENT_SECRET',
                active=True, consent_reference='synthetic-consent', monitoring_reference='synthetic-monitor'))
        db.flush()
        for tenant in ('tenant_a', 'tenant_b'):
            db.add(LiveEvent(tenant_id=tenant, installation_id='restore-install', event_id='restore-event',
                source_id='restore-source', source_version=1, occurred_at=expires,
                payload_sha256='a'*64, content_sha256='b'*64, kind='unresolved', state='dead_lettered'))
            db.add(LiveSource(tenant_id=tenant, installation_id='restore-install', source_id='restore-source',
                source_version=1, content_sha256='b'*64, deleted=False))
        db.commit()
        from app.models.supervised_action import ActionProposal, ActionExecution, SupervisedActionDecision
        for tenant in ('tenant_a','tenant_b'):
            decision = db.scalar(select(SupervisedActionDecision).where(SupervisedActionDecision.tenant_id == tenant))
            proposal = ActionProposal(tenant_id=tenant, decision_id=decision.id, action_version=1,
                target='123', payload_json={'message_type':'note','type':'admin','admin_id':'42','body':'Synthetic'},
                payload_sha256='a'*64, state='proposed')
            db.add(proposal); db.flush()
            db.add(ActionExecution(tenant_id=tenant, proposal_id=proposal.id, payload_sha256='a'*64,
                target='123', actor_id=actor, action_version=1, expires_at=expires, state='approved'))
        db.commit()
        tenant_b_before = tenant_snapshot(db, 'tenant_b')
        assert all(item['count'] > 0 for item in tenant_b_before.values())
    backup = tmp_path / 'before.dump'
    subprocess.run([str(binaries / 'pg_dump'), *connection, '-Fc', '-f', str(backup)], env=env, check=True)
    with _runtime_session(job_pg, 'tenant_a') as db:
        row = lifecycle.request_deletion(db, 'tenant_a', actor)
        rid = row.id
        lifecycle.confirm_deletion(db, 'tenant_a', rid, actor, 'DELETE tenant_a')
        for _ in range(100):
            row = lifecycle.advance_deletion(db, 'tenant_a', rid, actor, batch_size=1)
            if row.state == 'completed':
                break
        assert row.state == 'completed'
        trusted_receipt = lifecycle.receipt(row)
    job_pg.dispose()
    subprocess.run([str(binaries / 'pg_restore'), *connection, '--clean', '--if-exists', '--exit-on-error', str(backup)], env=env, check=True)
    with _runtime_session(job_pg, 'tenant_a') as db:
        assert db.scalar(select(func.count()).select_from(SignalEvidence)) == 1
        row = lifecycle.reconcile_tombstone(db, 'tenant_a', trusted_receipt, actor)
        assert row.fenced
    for _ in range(100):
        with _runtime_session(job_pg, 'tenant_a') as db:
            row = lifecycle.advance_deletion(db, 'tenant_a', rid, actor, batch_size=1)
            if row.state == 'completed':
                break
    assert row.state == 'completed'
    with Session(job_pg) as db:
        # Explicitly retained tombstones/audit/accounting are not displayable data.
        for name, table in Base.metadata.tables.items():
            if 'tenant_id' in table.c and name in lifecycle.DELETE_ORDER:
                assert db.scalar(select(func.count()).select_from(table).where(table.c.tenant_id == 'tenant_a')) == 0, name
        assert db.scalar(select(func.count()).select_from(SignalEvidence).where(SignalEvidence.tenant_id == 'tenant_a')) == 0
        assert tenant_snapshot(db, 'tenant_b') == tenant_b_before


def test_cb19_database_outage_recovery(job_pg, monkeypatch):
    """Disable connections to this disposable DB; HTTP reads fail then recover."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.db import get_db
    from app.config import get_settings
    monkeypatch.setenv('SIOONA_ACTOR_AUTH', 'off')
    get_settings.cache_clear()
    _job_seed(job_pg)
    def database():
        with Session(job_pg) as db:
            yield db
    prior = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = database
    admin = create_engine(make_url(URL).set(database='postgres'), isolation_level='AUTOCOMMIT')
    try:
        with TestClient(app) as client:
            headers = {'X-Tenant-Id': 'a'}
            path = '/v1/tenants/a/conversations'
            assert client.get(path, headers=headers).status_code == 200
            job_pg.dispose()
            with admin.connect() as connection:
                connection.execute(text('ALTER DATABASE sioona_migration_test ALLOW_CONNECTIONS false'))
                connection.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='sioona_migration_test'"))
            response = client.get(path, headers=headers)
            assert response.status_code >= 500
            assert response.json()['detail'] == 'database_unavailable'
            with admin.connect() as connection:
                connection.execute(text('ALTER DATABASE sioona_migration_test ALLOW_CONNECTIONS true'))
            assert client.get(path, headers=headers).status_code == 200
    finally:
        with admin.connect() as connection:
            connection.execute(text('ALTER DATABASE sioona_migration_test ALLOW_CONNECTIONS true'))
        admin.dispose()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(prior)


def test_cb19_schema_gate(job_pg, monkeypatch):
    from scripts import check_schema
    # Readiness needs SELECT only, never schema writes or migration-owner URLs.
    runtime = create_engine(URL, connect_args={'options': '-c role=sioona_runtime'})
    monkeypatch.setattr(check_schema, 'create_engine', lambda *_: runtime)
    check_schema.main()
    with job_pg.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num='028_batch_cache'"))
    try:
        with pytest.raises(SystemExit, match='schema_not_ready'):
            check_schema.main()
    finally:
        with job_pg.begin() as connection:
            connection.execute(text("UPDATE alembic_version SET version_num='032_live_ingest'"))


def test_cb19_provider_outage_fallback(job_pg, monkeypatch):
    """Synthetic provider failure is metered, then pauses suppress dispatch."""
    from app.worker import Worker
    from app.ai.gateway import ProviderFailure
    from app.services.inference_budget import configure
    from app.models.inference_attempt import InferenceAttempt
    from app.models.detection_run import DetectionRun
    from app.config import get_settings
    monkeypatch.setenv('DETECT_LLM', '1')
    monkeypatch.setenv('DETECT_LLM_PRIMARY', '1')
    monkeypatch.setenv('GROQ_API_KEY', 'synthetic-never-networked')
    get_settings.cache_clear()
    _job_seed(job_pg)
    with Session(job_pg) as db:
        for scope in ('global', 'a'):
            configure(db, scope, 10, 10, True, 'drill', 'operator')
        db.commit()
    calls = []
    def unavailable(*_):
        calls.append(1)
        raise ProviderFailure('network', retryable=False)
    worker = Worker(lambda: _runtime_session(job_pg, 'a'), call=unavailable)
    assert worker.run_once('a')
    assert calls
    with _runtime_session(job_pg, 'a') as db:
        attempts = list(db.scalars(select(InferenceAttempt)))
        assert len(attempts) == len(calls)
        assert all(row.status == 'failed' for row in attempts)
        assert db.scalar(select(DetectionRun)) is None
    with Session(job_pg) as db:
        configure(db, 'global', 10, 10, False, 'provider_outage', 'operator')
        db.commit()
    import time
    time.sleep(2.1)  # Real first-retry backoff, no clock or queue-state patch.
    previous_calls = len(calls)
    assert worker.run_once('a')
    assert len(calls) == previous_calls
    with _runtime_session(job_pg, 'a') as db:
        assert db.scalar(select(DetectionRun)).model_version == 'heuristic'
        from app.models.job import Job
        assert db.scalar(select(Job)).last_error_category == 'ai_paused'


@pytest.mark.parametrize('operation,resource,constraint', [
    ('inference_paused', 'tenant', 'ck_audit_operation'),
    ('inference_enabled', 'tenant', 'ck_audit_operation'),
    ('retention_sweep', 'inference_control', 'ck_audit_resource'),
    ('retention_sweep', 'global_inference_control', 'ck_audit_resource'),
])
def test_cb19_inference_audit_prior_head_upgrade_preserves_history(job_pg, operation, resource, constraint):
    """029→030 preserves history and admits bounded events under runtime RLS."""
    import uuid
    from app.models.lifecycle import AuditEvent
    from app.services.lifecycle import audit
    cfg = Config('alembic.ini')
    command.downgrade(cfg, '029_audit_lifecycle')
    actor = str(uuid.uuid4())
    with _runtime_session(job_pg, 'a') as db:
        audit(db, 'a', actor, 'retention_sweep')
        db.commit()
    command.upgrade(cfg, 'head')
    with _runtime_session(job_pg, 'a') as db:
        assert list(db.scalars(select(AuditEvent.operation))) == ['retention_sweep']
        # Isolate each new vocabulary dimension so neither constraint masks the other.
        audit(db, 'a', actor, operation, resource)
        db.commit()
        before = set(db.scalars(select(AuditEvent.id)))
        assert len(before) == 2
    with _runtime_session(job_pg, 'b') as db:
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 0
    # A rollback cannot discard incompatible append-only events to fit 029.
    with pytest.raises(DBAPIError, match=constraint):
        command.downgrade(cfg, '029_audit_lifecycle')
    with _runtime_session(job_pg, 'a') as db:
        assert set(db.scalars(select(AuditEvent.id))) == before
        assert set(db.execute(select(AuditEvent.operation, AuditEvent.resource_type)).all()) == {
            ('retention_sweep', 'tenant'), (operation, resource),
        }
    with job_pg.connect() as conn:
        assert conn.scalar(text('SELECT version_num FROM alembic_version')) == '033_supervised_action_executions'


def test_queue_search_pg17_indexes_and_runtime_rls(job_pg):
    from uuid import UUID
    from app.models.message import Message
    from app.models.signal_prediction import SignalPrediction
    from app.services.review_queue import page_signals_needing_review
    from scripts import check_schema
    with job_pg.connect() as conn:
        assert conn.scalar(text('SHOW server_version_num')).startswith('17')
        indexes = dict(conn.execute(text("SELECT indexname, indexdef FROM pg_indexes WHERE indexname LIKE 'ix_messages_customer_search_%' OR indexname LIKE 'ix_predictions_search_%'")).all())
        assert len(indexes) == 4
        assert all('USING gin' in definition for definition in indexes.values())
        assert "WHERE" in indexes['ix_messages_customer_search_fts'] and "'customer'" in indexes['ix_messages_customer_search_fts']
    now = datetime.now(timezone.utc)
    for tenant, base in [('a', 1), ('b', 100)]:
        with _runtime_session(job_pg, tenant) as db:
            for i in range(3):
                db.add(Conversation(tenant_id=tenant, conversation_id=f'c{i}', channel='upload', started_at=now))
                db.add(SignalPrediction(id=UUID(int=base+i), tenant_id=tenant, conversation_id=f'c{i}',
                    signal_type='lead', confidence=.9, summary='renewal annual' if i == 0 else 'ordinary'))
                db.add(Message(tenant_id=tenant, conversation_id=f'c{i}', message_id=f'm{i}',
                    role='customer' if i == 1 else 'agent', content='annual renewal 50%_discount', timestamp=now))
            db.commit()
    with _runtime_session(job_pg, 'a') as db:
        first, cursor = page_signals_needing_review(db, 'a', q='renewal annual', limit=1)
        second, end = page_signals_needing_review(db, 'a', q='renewal annual', limit=1, after=cursor)
        assert [r.conversation_id for r in first+second] == ['c0', 'c1']
        assert end is None
        assert len(page_signals_needing_review(db, 'a', q='newal')[0]) == 2
        assert len(page_signals_needing_review(db, 'a', q='%_')[0]) == 1
        assert page_signals_needing_review(db, 'b', q='renewal')[0] == []
        # Raw reads prove RLS, independent of service tenant predicates.
        assert set(db.scalars(text('SELECT tenant_id FROM messages'))) == {'a'}
        assert set(db.scalars(text('SELECT tenant_id FROM signal_predictions'))) == {'a'}
    with job_pg.begin() as conn:
        conn.execute(text('SET LOCAL ROLE sioona_runtime'))
        conn.execute(text("SELECT set_config('app.tenant_id', '', true)"))
        assert conn.scalar(text('SELECT count(*) FROM messages')) == 0
        assert conn.scalar(text('SELECT count(*) FROM signal_predictions')) == 0
    # Force scan alternatives off to prove both operator classes are usable.
    with job_pg.begin() as conn:
        conn.execute(text('SET LOCAL enable_seqscan = off'))
        for table, column, prefix, predicate in [('messages', 'content', 'ix_messages_customer_search', "role = 'customer' AND "), ('signal_predictions', 'summary', 'ix_predictions_search', '')]:
            for suffix, condition in [('fts', f"to_tsvector('simple'::regconfig, {column}) @@ plainto_tsquery('simple'::regconfig, 'renewal')"), ('trgm', f"{column} ILIKE '%newal%'")]:
                plan = str(conn.execute(text(f'EXPLAIN SELECT id FROM {table} WHERE {predicate}{condition}')).all())
                assert f'{prefix}_{suffix}' in plan
    check_schema.main()


def test_cb16_runtime_atomic_receipts_concurrency_and_rls(job_pg):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from app.services import live_ingest as live, jobs
    from app.models.live_ingest import LiveEvent, LiveInstallation
    from app.models.job import Job
    from tests.test_live_ingest import install, event
    with _runtime_session(job_pg, 'a') as db:
        install(db)
        jid = live.accept_event(db, 'a', event()).job_id
        db.rollback()
        assert db.get(Job, ('a', jid)) is None
        assert db.get(LiveEvent, ('a','install1','e1')) is None
    barrier = Barrier(2)
    def deliver(_):
        with _runtime_session(job_pg, 'a') as db:
            barrier.wait(timeout=10)
            jid = live.accept_event(db, 'a', event()).job_id
            db.commit()
            return jid
    with ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(deliver, range(2)))
    assert receipts[0] == receipts[1]
    with _runtime_session(job_pg, 'a') as db:
        assert len(list(db.scalars(select(LiveEvent)))) == 1
        assert len(list(db.scalars(select(Job)))) == 1
        lease = jobs.claim(db,'a','worker')
        db.commit()
        live.revoke_installation(db,'a','install1','00000000-0000-0000-0000-000000000001')
        db.commit()
        with pytest.raises(jobs.LeaseLost): jobs.fenced(db,lease,corpus=True)
        db.rollback()
    with _runtime_session(job_pg, 'b') as db:
        assert not list(db.scalars(select(LiveEvent)))
        assert not list(db.scalars(select(LiveInstallation)))
        with pytest.raises(Exception):
            db.add(LiveInstallation(tenant_id='a',id='forged',workspace_id='forged',credential_ref='INTERCOM_CLIENT_SECRET',active=True,consent_reference='c',monitoring_reference='m'))
            db.commit()
        db.rollback()


def test_cb16_postgres_ordering_recovery_and_deletion(job_pg):
    from tests.test_live_ingest import install, event
    from app.services import live_ingest as live
    from app.models.job import Job
    from app.models.live_ingest import LiveEvent, LiveSource
    from app.models.message import Message
    with _runtime_session(job_pg,'a') as db:
        install(db)
        first = live.accept_event(db,'a',event())
        second = live.accept_event(db,'a',event('e2',102,'later'))
        db.commit()
        assert second.state == 'pending'
        db.get(Job,('a',first.job_id)).status = 'succeeded'
        db.commit()
        live.dispatch_pending(db,'a')
        db.commit()
        assert second.state == 'dispatched'
        job = db.get(Job,('a',second.job_id))
        job.status,job.attempt_count = 'dead_lettered',3
        db.commit()
        live.requeue(db,'a','install1','e2','00000000-0000-0000-0000-000000000001')
        db.commit()
        assert job.status == 'queued' and job.attempt_count == 0
        deleted = live.accept_event(db,'a',event('deleted',103,kind='delete'))
        db.commit()
        assert deleted.state == 'succeeded'
        assert not list(db.scalars(select(Message)))
        assert not db.get(LiveEvent,('a','install1','e2')).payload
        assert db.get(LiveSource,('a','install1','source1')).deleted


def test_cb16_upgrade_preserves_inflight_deletion_checkpoint_and_downgrade_guards(job_pg):
    from app.models.lifecycle import TenantDeletion
    from app.models.live_ingest import LiveInstallation
    from tests.test_live_ingest import install
    cfg = Config('alembic.ini')
    with Session(job_pg) as db:
        db.add(TenantDeletion(tenant_id='deleting', requested_by='00000000-0000-0000-0000-000000000001', state='running', fenced=True, checkpoint=7))
        db.commit()
    command.downgrade(cfg,'031_queue_search')
    with Session(job_pg) as db:
        assert db.get(TenantDeletion,'deleting').checkpoint == 2
    command.upgrade(cfg,'head')
    with Session(job_pg) as db:
        assert db.get(TenantDeletion,'deleting').checkpoint == 7
    with _runtime_session(job_pg,'a') as db:
        install(db)
    with pytest.raises(Exception, match='live_ingest_not_empty'):
        command.downgrade(cfg,'031_queue_search')
    with _runtime_session(job_pg,'a') as db:
        assert db.get(LiveInstallation,('a','install1')).active


def test_cb17_sandbox_outbox_runtime_rls_and_durable_attempt(job_pg, monkeypatch):
    from app.models.supervised_action import ActionProposal, ActionExecution, SupervisedActionDecision
    from app.services import external_actions as actions
    from datetime import timedelta
    import uuid
    actor = str(uuid.uuid4())
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', '{"a":{"sandbox":true,"conversation_ids":["123"],"admin_id":"42","token":"synthetic"}}')
    with _runtime_session(job_pg, 'a') as db:
        draft = SupervisedActionDecision(tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='approved', subject='Note', body='Synthetic note')
        db.add(draft); db.commit()
        p = actions.propose(db, 'a', actor, draft.id, '123', 'Synthetic operator note')
        e = actions.approve(db, 'a', actor, p.id, p.payload_sha256, p.target, p.action_version, datetime.now(timezone.utc)+timedelta(minutes=5))
        pid, eid = p.id, e.id
    with _runtime_session(job_pg, 'b') as db:
        assert db.get(ActionProposal, ('a',pid)) is None
        assert db.get(ActionExecution, ('a',eid)) is None
        with pytest.raises(DBAPIError):
            db.execute(text("INSERT INTO action_proposals (tenant_id,id,decision_id,action_version,action_type,target,payload_json,payload_sha256,state) VALUES ('a',:id,:decision,1,'intercom_internal_note','123','{}',:sha,'proposed')"), {'id':str(uuid.uuid4()), 'decision':uuid.uuid4(), 'sha':'a'*64})
    with job_pg.connect() as conn:
        rows = conn.execute(text("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('action_proposals','action_executions')")).all()
        assert len(rows) == 2 and all(row[1] and row[2] for row in rows)
    # Commit attempted before simulating a process crash. Re-entry never sends.
    calls = []
    monkeypatch.setattr(actions, 'submit_note', lambda *args: calls.append(args))
    with _runtime_session(job_pg, 'a') as db:
        e = db.get(ActionExecution, ('a',eid)); e.state='attempted'; db.commit()
        assert actions.execute(db, 'a', actor, eid).state == 'unknown'
        assert calls == []
        actions.reconcile(db, 'a', actor, eid, 'failed', 'investigation_1')
        assert actions.execute(db, 'a', actor, eid).state == 'failed'


def test_cb17_concurrent_dispatch_exact_binding_and_audit(job_pg, monkeypatch):
    from app.models.supervised_action import ActionProposal, ActionExecution, SupervisedActionDecision
    from app.models.lifecycle import AuditEvent
    from app.services import external_actions as actions
    from tests.test_audit_lifecycle import seed
    from datetime import timedelta
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', '{"a":{"sandbox":true,"conversation_ids":["123"],"admin_id":"42","token":"synthetic"}}')
    with Session(job_pg) as db:
        actor, _ = seed(db)
    with _runtime_session(job_pg,'a') as db:
        draft = SupervisedActionDecision(tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='approved', subject='Note', body='Synthetic')
        db.add(draft); db.commit()
        p = actions.propose(db, 'a', actor, draft.id, '123', 'Synthetic internal note')
        e = actions.approve(db, 'a', actor, p.id, p.payload_sha256, p.target, 1, datetime.now(timezone.utc)+timedelta(minutes=5))
        pid, eid, did = p.id, e.id, p.decision_id
    with _runtime_session(job_pg,'a') as db:
        with pytest.raises(DBAPIError, match='immutable_action_approval'):
            db.execute(text("UPDATE action_executions SET target='999' WHERE id=:id"), {'id':eid})
        db.rollback()
        with pytest.raises(DBAPIError, match='immutable_action_proposal'):
            db.execute(text("UPDATE action_proposals SET payload_sha256=:sha WHERE id=:id"), {'sha':'b'*64,'id':pid})
    started, release = Event(), Event()
    calls = []
    def submit(*args):
        calls.append(args); started.set(); assert release.wait(15)
        return 'succeeded', '123'
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    monkeypatch.setattr(actions, 'submit_note', submit)
    def execute():
        with _runtime_session(job_pg,'a') as db:
            return actions.execute(db, 'a', actor, eid).state
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(execute)
        try:
            assert started.wait(10)
            with pytest.raises(actions.ActionError, match='dispatch_in_progress'):
                pool.submit(execute).result(timeout=10)
            with _runtime_session(job_pg, 'a') as db:
                with pytest.raises(actions.ActionError, match='dispatch_in_progress'):
                    actions.reconcile(db, 'a', actor, eid, 'failed', 'verified_absent')
            with _runtime_session(job_pg, 'a') as db:
                with pytest.raises(actions.ActionError, match='reconciliation_required'):
                    actions.propose(db, 'a', actor, did, '123', 'Replacement')
        finally: release.set()
        assert first.result(timeout=10) == 'succeeded'
    assert len(calls) == 1
    with _runtime_session(job_pg,'a') as db:
        operations = list(db.scalars(select(AuditEvent.operation).where(AuditEvent.resource_type == 'action').order_by(AuditEvent.created_at)))
        assert operations == ['action_proposed','action_approved','action_attempted','action_succeeded']
        assert actions.execute(db,'a',actor,eid).state == 'succeeded'


def test_cb17_concurrent_approval_is_single_use(job_pg, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from datetime import timedelta
    from app.models.supervised_action import SupervisedActionDecision, ActionExecution
    from app.services import external_actions as actions
    from tests.test_audit_lifecycle import seed
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', '{"a":{"sandbox":true,"conversation_ids":["123"],"admin_id":"42","token":"synthetic"}}')
    with Session(job_pg) as db:
        actor, _ = seed(db)
    with _runtime_session(job_pg, 'a') as db:
        draft = SupervisedActionDecision(tenant_id='a', conversation_id='c', action_type='upsell_note_draft', status='approved', subject='Note', body='Synthetic')
        db.add(draft)
        db.commit()
        p = actions.propose(db, 'a', actor, draft.id, '123', 'Synthetic internal note')
        pid, sha = p.id, p.payload_sha256
    def approve_once(_):
        with _runtime_session(job_pg, 'a') as db:
            try:
                actions.approve(db, 'a', actor, pid, sha, '123', 1, datetime.now(timezone.utc)+timedelta(minutes=5))
                return 'approved'
            except actions.ActionError as error:
                return str(error)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(approve_once, range(2))) == ['already_approved', 'approved']
    with _runtime_session(job_pg, 'a') as db:
        assert db.scalar(select(func.count()).select_from(ActionExecution)) == 1


def test_cb17_source_deletion_invalidates_unattempted_approval(job_pg, monkeypatch):
    from tests.test_live_ingest import install, event
    from tests.test_external_actions import proposal, approve, ACTOR
    from app.services import live_ingest as live, external_actions as actions
    from app.models.supervised_action import ActionProposal
    from app.models.lifecycle import AuditEvent
    monkeypatch.setenv('SIOONA_EXTERNAL_ACTIONS_SANDBOX_CONFIG', '{"a":{"sandbox":true,"conversation_ids":["123"],"admin_id":"42","token":"synthetic"}}')
    with Session(job_pg) as db:
        install(db)
        source = event()
        source.conversation.conversation_id = 'c'
        live.accept_event(db, 'a', source)
        db.commit()
        p = proposal(db)
        e = approve(db, p)
        pid, eid = p.id, e.id
    calls = []
    monkeypatch.setattr(actions, 'enabled', lambda: True)
    monkeypatch.setattr(actions, 'submit_note', lambda *args: calls.append(args))
    with _runtime_session(job_pg, 'a') as db:
        live.accept_event(db, 'a', event('delete', 101, kind='delete'))
        db.commit()
        assert db.get(ActionProposal, ('a', pid)).state == 'superseded'
        assert actions.execute(db, 'a', ACTOR, eid).state == 'failed'
        assert calls == []
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.operation.in_(['action_invalidated', 'action_failed']))))
        assert len(events) == 2
        assert all(row.actor_role == 'service' and row.reason_code == 'source_deleted' for row in events)
