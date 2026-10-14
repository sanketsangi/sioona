"""Real locking and fencing checks; schema is created directly, never via Alembic."""
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.exc import DBAPIError

from app.models.job import Job
from app.services.jobs import enqueue, claim, heartbeat, complete, fail, cancel, LeaseLost


@pytest.fixture
def pg():
    url = os.getenv("CB11_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Disposable CB11 Postgres required")
    parsed = make_url(url)
    assert parsed.host in {"127.0.0.1", "localhost", "::1"}
    assert parsed.database == "sioona_cb11_test"
    engine = create_engine(url)
    Job.__table__.create(engine)
    try:
        yield engine
    finally:
        Job.__table__.drop(engine)
        engine.dispose()


def seed(pg, tenant="a", upload="upload"):
    with Session(pg) as db, db.begin():
        return enqueue(db, tenant_id=tenant, upload_id=upload,
                       config_sha256="a" * 64, conversation_digest="b" * 64).id


def lease(pg, owner="w1", tenant="a"):
    with Session(pg) as db, db.begin():
        return claim(db, tenant_id=tenant, owner=owner)


def expire(pg, job):
    with pg.begin() as conn:
        conn.execute(text("UPDATE jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=:id"), {"id": job.id})


def test_two_workers_skip_locked_without_waiting(pg):
    seed(pg)
    seed(pg, upload="other")
    barrier = Barrier(2)
    def run(owner):
        with Session(pg) as db, db.begin():
            db.execute(text("SET LOCAL lock_timeout='1s'"))
            job = claim(db, tenant_id="a", owner=owner)
            barrier.wait(timeout=5)  # first worker's row is still locked
            return job.id
    with ThreadPoolExecutor(2) as pool:
        ids = list(pool.map(run, ["w1", "w2"]))
    assert len(set(ids)) == 2
    assert lease(pg) is None


def test_expiry_reclaim_fences_heartbeat_and_atomic_publication(pg):
    seed(pg)
    first = lease(pg)
    expire(pg, first)
    with Session(pg) as db, db.begin():
        assert not heartbeat(db, first)
        with pytest.raises(LeaseLost):
            complete(db, first, publish=lambda db: pytest.fail("expired publication"))
    # Recovery schedules a backoff; it must not immediately reclaim the crash.
    assert lease(pg, "w2") is None
    with pg.begin() as conn:
        conn.execute(text("UPDATE jobs SET run_after=clock_timestamp()-interval '1 second'"))
    second = lease(pg, "w2")
    assert second.lease_token > first.lease_token
    with Session(pg) as db, db.begin():
        with pytest.raises(LeaseLost):
            complete(db, first)
        assert heartbeat(db, second)
        complete(db, second, publish=lambda db: db.execute(text("SELECT 1")))


def test_retry_exhaustion_cancellation_and_tenant_scope(pg):
    jid = seed(pg)
    assert lease(pg, tenant="b") is None
    for attempt in range(1, 4):
        current = lease(pg)
        assert current.attempt_count == attempt
        with Session(pg) as db, db.begin():
            fail(db, current, category="handler_failed")
        with pg.begin() as conn:
            conn.execute(text("UPDATE jobs SET run_after=clock_timestamp()-interval '1 second'"))
    assert lease(pg) is None
    with Session(pg) as db:
        assert db.get(Job, ("a", jid)).status == "dead_lettered"
    seed(pg, upload="cancel")
    current = lease(pg)
    with Session(pg) as db, db.begin():
        assert not cancel(db, tenant_id="b", job_id=current.id)
        assert cancel(db, tenant_id="a", job_id=current.id)
        with pytest.raises(LeaseLost):
            complete(db, current)


def test_outbox_rollback_and_duplicate_identity(pg):
    from tests.test_postgres_migrations import assert_jobs_schema
    assert_jobs_schema(inspect(pg))
    with Session(pg) as db:
        enqueue(db, tenant_id="a", upload_id="rollback", config_sha256="a"*64, conversation_digest="b"*64)
        db.rollback()
    assert lease(pg) is None
    assert seed(pg) == seed(pg)


def test_failed_publication_rolls_back_completion(pg):
    seed(pg)
    current = lease(pg)
    def broken(db):
        raise RuntimeError("synthetic")
    with Session(pg) as db:
        with pytest.raises(RuntimeError):
            complete(db, current, publish=broken)
        db.rollback()
    with Session(pg) as db:
        assert db.get(Job, ("a", current.id)).status == "leased"


def test_crashed_final_attempt_dead_letters(pg):
    jid = seed(pg)
    for attempt in range(3):
        current = lease(pg)
        expire(pg, current)
        assert lease(pg) is None
        with pg.begin() as conn:
            conn.execute(text("UPDATE jobs SET run_after=clock_timestamp()-interval '1 second'"))
    with Session(pg) as db:
        assert db.get(Job, ("a", jid)).status == "dead_lettered"


def test_priority_run_after_and_non_retryable_failure(pg):
    seed(pg)
    with Session(pg) as db, db.begin():
        high = enqueue(db, tenant_id="a", upload_id="high", config_sha256="a"*64,
                       conversation_digest="b"*64, priority=10).id
    current = lease(pg)
    assert current.id == high
    with Session(pg) as db, db.begin():
        fail(db, current, category="handler_failed", retryable=False)
    current = lease(pg)
    with Session(pg) as db, db.begin():
        fail(db, current, category="provider_unavailable")
    assert lease(pg) is None


def test_runtime_rls_missing_context_and_cross_tenant_claim(pg):
    seed(pg)
    seed(pg, tenant="b")
    with pg.begin() as conn:
        conn.execute(text("CREATE ROLE sioona_cb11_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS"))
        conn.execute(text("GRANT USAGE ON SCHEMA public TO sioona_cb11_runtime"))
        conn.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO sioona_cb11_runtime"))
        conn.execute(text("ALTER TABLE jobs ENABLE ROW LEVEL SECURITY"))
        conn.execute(text("ALTER TABLE jobs FORCE ROW LEVEL SECURITY"))
        conn.execute(text("""CREATE POLICY tenant_isolation ON jobs
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"""))
    try:
        with Session(pg) as db, db.begin():
            db.execute(text("SET LOCAL ROLE sioona_cb11_runtime"))
            assert claim(db, tenant_id="a", owner="worker") is None
            db.execute(text("SELECT set_config('app.tenant_id', 'a', true)"))
            assert claim(db, tenant_id="b", owner="worker") is None
            assert claim(db, tenant_id="a", owner="worker") is not None
        with Session(pg) as db, db.begin():
            db.execute(text("SET LOCAL ROLE sioona_cb11_runtime"))
            assert db.query(Job).count() == 0  # transaction-local context forgotten
        with Session(pg) as db:
            db.execute(text("SET LOCAL ROLE sioona_cb11_runtime"))
            db.execute(text("SELECT set_config('app.tenant_id', 'a', true)"))
            with pytest.raises(DBAPIError) as denied:
                enqueue(db, tenant_id="b", upload_id="forged", config_sha256="a"*64, conversation_digest="b"*64)
            assert denied.value.orig.sqlstate == "42501"
            db.rollback()
    finally:
        with pg.begin() as conn:
            conn.execute(text("DROP OWNED BY sioona_cb11_runtime"))
            conn.execute(text("DROP ROLE sioona_cb11_runtime"))


def test_worker_heartbeat_pause_and_drain(pg):
    from sqlalchemy.orm import sessionmaker
    from app.worker import Worker
    from threading import Event
    jid = seed(pg)
    seed(pg, upload="remaining")
    paused = [True]
    def handler(current, lost, stop):
        Event().wait(.12)
        assert not lost.is_set()
        with Session(pg) as db:
            row = db.get(Job, ("a", jid))
            assert row.heartbeat_at > row.leased_at
        stop.set()  # drain this publication, then no further claims
        return lambda db: db.execute(text("SELECT 1"))
    worker = Worker(sessionmaker(pg), tenants=("a",), owner="worker", handler=handler,
                    paused=lambda: paused[0], heartbeat_seconds=.02)
    assert not worker.tick()
    paused[0] = False
    assert worker.tick()
    assert not worker.tick()
    with Session(pg) as db:
        assert db.get(Job, ("a", jid)).status == "succeeded"


def test_worker_failure_does_not_log_exception_or_succeed(pg, caplog):
    from sqlalchemy.orm import sessionmaker
    from app.worker import Worker
    jid = seed(pg)
    def broken(*args):
        raise RuntimeError("secret transcript must not leak")
    worker = Worker(sessionmaker(pg), tenants=("a",), owner="worker", handler=broken)
    assert worker.tick()
    assert "secret transcript" not in caplog.text
    with Session(pg) as db:
        row = db.get(Job, ("a", jid))
        assert row.status == "queued"
        assert row.last_error_category == "handler_failed"


def test_worker_default_inline_and_pause_need_no_database(monkeypatch):
    from app.config import get_settings
    from app.worker import main
    monkeypatch.delenv("SIOONA_DETECTION_EXECUTION", raising=False)
    monkeypatch.setenv("SIOONA_WORKER_PAUSE", "0")
    get_settings.cache_clear()
    try:
        assert get_settings().sioona_detection_execution == "inline"
        assert main() == 0
        monkeypatch.setenv("SIOONA_DETECTION_EXECUTION", "worker")
        get_settings.cache_clear()
        assert main() == 2  # no processor overlap before cutover wiring
        monkeypatch.setenv("SIOONA_WORKER_PAUSE", "1")
        get_settings.cache_clear()
        assert main() == 0
    finally:
        get_settings.cache_clear()


def test_worker_tick_rotates_busy_tenants(monkeypatch):
    """A tenant with an endless backlog cannot monopolize successive ticks."""
    from contextlib import nullcontext
    from app.worker import Worker
    from app.services.jobs import Lease

    class FakeSession:
        def __enter__(self):
            return self
        def __exit__(self, *_):
            pass
        def begin(self):
            return nullcontext()

    claimed = []
    def busy_claim(db, *, tenant_id, owner):
        claimed.append(tenant_id)
        return Lease(tenant_id, "job", owner, 1, 1, "upload", "a" * 64, "b" * 64, 0)

    worker = Worker(FakeSession, tenants=("a", "b", "c"), owner="worker",
                    handler=lambda *_: lambda db: None)
    monkeypatch.setattr(worker, "_session", lambda _: FakeSession())
    monkeypatch.setattr("app.worker.claim", busy_claim)
    monkeypatch.setattr("app.worker.complete", lambda *a, **kw: None)
    for _ in range(6):
        assert worker.tick()
    assert claimed == ["a", "b", "c", "a", "b", "c"]
