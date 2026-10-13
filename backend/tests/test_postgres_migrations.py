"""Production DDL checks against an explicitly dedicated disposable CI database."""
import os
import hashlib
import json
from datetime import datetime, timezone
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session
from app.models.conversation import Conversation
from app.services.uploads import publish_upload
from app.services.tenant_data import wipe_tenant_data

URL = os.getenv("PG_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Dedicated PostgreSQL test database required")


@pytest.mark.parametrize("prior", [None, "011_signal_urgency_value"])
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
        assert heads == ["025_detection_resume"]
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
            )).scalar() == 0
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
            )).scalar() == len(RLS_TABLES)
    finally:
        clear_tenant()
        get_settings.cache_clear()
        engine.dispose()


def _seed_two_tenants(conn) -> None:
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


def _assert_runtime_isolation(engine) -> None:
    from app.db import bind_tenant, clear_tenant
    with engine.connect() as conn:
        for table in RLS_TABLES:
            seen = conn.execute(text(f"SELECT tenant_id FROM {table}")).scalars().all()
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
        seen = conn.execute(text(f"SELECT DISTINCT tenant_id FROM {table} ORDER BY tenant_id")).scalars().all()
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
