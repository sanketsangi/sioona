"""Concurrency/read-only checks in an explicitly disposable test database."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select, func, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.api.routes import pilot_requests
from app.models.pilot_request import PilotRequest
from scripts.lookup_pilot_request import lookup_receipt

URL = os.environ.get("PG_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Dedicated PostgreSQL test database required")


def test_cross_worker_global_cap_and_read_only_receipt(monkeypatch):
    assert URL and make_url(URL).database == "sioona_migration_test", "Refusing a non-test database"
    engine = create_engine(URL)
    schema = "intake_test_" + uuid.uuid4().hex
    scoped = engine.execution_options(schema_translate_map={None: schema})
    monkeypatch.setattr(pilot_requests, "get_settings", lambda: SimpleNamespace(pilot_intake_daily_limit=2))
    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        PilotRequest.__table__.create(scoped)
        barrier = Barrier(4)

        def submit(index):
            key = f"postgres-pilot-request-{index:04}"
            body = pilot_requests.Intake(name="Synthetic", email=f"synthetic{index}@example.test", company="Test")
            with Session(scoped) as db:
                barrier.wait(timeout=10)
                try:
                    return 200, key, body, pilot_requests.accept_request(body, key, db)
                except HTTPException as error:
                    return error.status_code, key, body, None

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(submit, range(4)))
        assert sorted(row[0] for row in results) == [200, 200, 429, 429]
        _, key, body, acknowledged = next(row for row in results if row[0] == 200)
        with Session(scoped) as db:
            assert db.scalar(select(func.count()).select_from(PilotRequest)) == 2
            assert pilot_requests.accept_request(body, key, db) == acknowledged
        with Session(scoped.execution_options(postgresql_readonly=True)) as reader:
            assert lookup_receipt(reader, key)["receipt_id"] == key
            assert lookup_receipt(reader, key, include_contact=True)["email"] == body.email
            with pytest.raises(DBAPIError):
                reader.execute(text(f'DELETE FROM "{schema}".pilot_requests'))
            reader.rollback()
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        engine.dispose()
