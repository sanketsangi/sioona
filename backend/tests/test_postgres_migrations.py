"""Production DDL checks against an explicitly dedicated disposable CI database."""
import os
import hashlib
import json
from datetime import datetime, timezone
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
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


def test_inference_ledger_upgrade_from_workspaces(monkeypatch):
    """021 is additive on 020. The §13.3 rollup matches inserted rows."""
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
        command.upgrade(cfg, "020_workspaces_memberships")
        assert "inference_attempts" not in set(inspect(engine).get_table_names())
        command.upgrade(cfg, "head")
        assert_inference_schema(inspect(engine))
        from app.schemas.inference_attempt import InferenceAttemptIn
        from app.services.inference_ledger import RUN_ROLLUP_SQL, record_attempts
        started = datetime(2026, 10, 8, 1, 0, tzinfo=timezone.utc)
        finished = datetime(2026, 10, 8, 1, 0, 1, tzinfo=timezone.utc)
        run_id = "ab" * 32

        def row(attempt_id: str, ordinal: int, usage: str, tokens: int | None):
            return InferenceAttemptIn(
                attempt_id=attempt_id, logical_operation_id="op", attempt_ordinal=ordinal,
                conversation_id="conv", detection_run_id=run_id, stage="detect",
                route_version="detect:test", provider="groq", model="m", prompt_version="p",
                status="timeout" if usage == "unknown" else "succeeded", usage_status=usage,
                input_tokens=tokens, output_tokens=tokens, latency_ms=10, started_at=started, finished_at=finished,
            )

        with Session(engine) as db:
            record_attempts(db, "tenant_a", [
                row("1", 1, "reported", 10),
                row("2", 2, "reported", 5),
                row("3", 3, "unknown", None),
            ])
            db.commit()
        with engine.connect() as conn:
            rolled = conn.execute(text(RUN_ROLLUP_SQL), {"tenant_id": "tenant_a", "run_id": run_id}).mappings().one()
        assert rolled["attempts"] == 3
        assert rolled["retries_or_fallbacks"] == 2
        assert rolled["input_tokens"] == 15
        assert rolled["output_tokens"] == 15
        assert rolled["unknown_usage"] == 1
        assert rolled["unknown_cost"] == 3
        assert rolled["estimated_cost_usd"] is None
    finally:
        get_settings.cache_clear()
        engine.dispose()


def assert_inference_schema(schema):
    assert "inference_attempts" in set(schema.get_table_names())
    columns = {column["name"] for column in schema.get_columns("inference_attempts")}
    banned = {"content", "transcript", "quote", "evidence", "summary", "message", "text", "prompt", "body"}
    assert columns.isdisjoint(banned)
    assert "prompt_version" in columns
    checks = {item["name"] for item in schema.get_check_constraints("inference_attempts")}
    assert {
        "ck_inference_attempts_status",
        "ck_inference_attempts_usage_status",
        "ck_inference_attempts_cost_status",
        "ck_inference_attempts_ordinal_positive",
        "ck_inference_attempts_tokens_nonnegative",
    } <= checks
    indexes = {item["name"] for item in schema.get_indexes("inference_attempts")}
    assert {"ix_inference_attempts_tenant_started", "ix_inference_attempts_tenant_run"} <= indexes


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
