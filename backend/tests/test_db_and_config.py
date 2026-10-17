"""Unit tests for database URL normalization, Settings validation, and tenant_scope."""

import threading
import pytest
from sqlalchemy.orm import Session

from app.config import Settings, normalize_pg_url
from app.db import (
    SessionLocal,
    _tenant_id,
    clear_tenant,
    migration_database_url,
    tenant_scope,
)


def test_normalize_pg_url():
    assert (
        normalize_pg_url("postgresql://user:pass@localhost:5432/db")
        == "postgresql+psycopg://user:pass@localhost:5432/db"
    )
    assert (
        normalize_pg_url("  postgres://user:pass@localhost:5432/db  ")
        == "postgresql+psycopg://user:pass@localhost:5432/db"
    )
    assert (
        normalize_pg_url("postgresql+psycopg://user:pass@localhost:5432/db")
        == "postgresql+psycopg://user:pass@localhost:5432/db"
    )
    assert normalize_pg_url("sqlite:///local.db") == "sqlite:///local.db"


def test_settings_normalizes_database_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@neon.tech/sioona")
    s = Settings()
    assert s.database_url == "postgresql+psycopg://user:pass@neon.tech/sioona"


def test_migration_database_url_normalization(monkeypatch):
    monkeypatch.delenv("MIGRATION_DATABASE_URL", raising=False)
    assert migration_database_url() == ""

    monkeypatch.setenv(
        "MIGRATION_DATABASE_URL", "postgresql://owner:pass@ep.neon.tech/sioona"
    )
    assert (
        migration_database_url()
        == "postgresql+psycopg://owner:pass@ep.neon.tech/sioona"
    )


def test_tenant_scope_with_session():
    clear_tenant()
    db = SessionLocal()
    try:
        assert _tenant_id.get() is None
        assert "sioona_tenant_id" not in db.info

        with tenant_scope("tenant_test_a", db):
            assert _tenant_id.get() == "tenant_test_a"
            assert db.info.get("sioona_tenant_id") == "tenant_test_a"

        # Assert clean exit
        assert _tenant_id.get() is None
        assert "sioona_tenant_id" not in db.info
    finally:
        db.close()
        clear_tenant()


def test_tenant_scope_exception_cleanup():
    clear_tenant()
    db = SessionLocal()
    try:
        with pytest.raises(RuntimeError, match="deliberate_failure"):
            with tenant_scope("tenant_fail", db):
                assert _tenant_id.get() == "tenant_fail"
                raise RuntimeError("deliberate_failure")

        assert _tenant_id.get() is None
        assert "sioona_tenant_id" not in db.info
    finally:
        db.close()
        clear_tenant()


def test_tenant_scope_without_session():
    clear_tenant()
    assert _tenant_id.get() is None

    with tenant_scope("tenant_standalone"):
        assert _tenant_id.get() == "tenant_standalone"

    assert _tenant_id.get() is None


def test_tenant_scope_rejects_empty():
    with pytest.raises(ValueError, match="tenant_id required"):
        with tenant_scope("   "):
            pass


def test_worker_thread_cleans_tenant():
    """Verify that thread worker operations leave no dangling tenant context."""
    clear_tenant()
    observed_in_thread = []

    def thread_task():
        db = SessionLocal()
        try:
            with tenant_scope("tenant_thread", db):
                observed_in_thread.append(_tenant_id.get())
        finally:
            db.close()
            # Explicit cleanup check
            clear_tenant()
            observed_in_thread.append(_tenant_id.get())

    t = threading.Thread(target=thread_task)
    t.start()
    t.join(timeout=5)

    assert observed_in_thread == ["tenant_thread", None]
    assert _tenant_id.get() is None
