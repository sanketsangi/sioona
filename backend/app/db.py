"""SQLAlchemy engine and session helpers."""

import os
from collections.abc import Generator
from contextvars import ContextVar
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import backend_root, get_settings
from app.models import Base

settings = get_settings()
_database_url = settings.database_url
_is_sqlite = _database_url.startswith("sqlite")


def _resolve_sqlite_url(url: str) -> str:
    """Anchor relative sqlite file paths to backend/, independent of process cwd."""
    prefix = "sqlite+pysqlite:///"
    if not url.startswith(prefix):
        return url
    rest = url[len(prefix) :]
    if rest in {":memory:", ""} or rest.startswith("/"):
        return url
    # Relative path like ./sioona_local.db
    abs_path = (backend_root() / Path(rest)).resolve()
    return f"{prefix}{abs_path}"


if _is_sqlite:
    _database_url = _resolve_sqlite_url(_database_url)
    # Local/dev fallback when Neon/Postgres is unavailable (matches test setup).
    engine = create_engine(
        _database_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
else:
    # Do not pass libpq `options` / `connect_timeout` here — they break Neon
    # SQLAlchemy connections (writes hang then return database_unavailable).
    engine = create_engine(
        _database_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_timeout=30,
        pool_recycle=300,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Transaction-local tenant for Postgres RLS. Unset context fails closed under
# the runtime role. Workers and scripts must call bind_tenant before queries.
_tenant_id: ContextVar[str | None] = ContextVar("sioona_rls_tenant_id", default=None)


def migration_database_url() -> str:
    """Owner URL for Alembic. Empty means Alembic keeps using DATABASE_URL."""
    return os.environ.get("MIGRATION_DATABASE_URL", "").strip()


def bind_tenant(db: Session, tenant_id: str) -> None:
    """Scope this session's Postgres transaction to one tenant.

    ``set_config(..., true)`` is local to the transaction, so a pooled
    connection cannot carry the previous request's tenant. SQLite ignores it.
    """
    cleaned = tenant_id.strip()
    if not cleaned:
        raise ValueError("tenant_id required")
    _tenant_id.set(cleaned)
    db.info["sioona_tenant_id"] = cleaned
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql" or not db.in_transaction():
        return
    db.execute(
        text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
        {"tenant_id": cleaned},
    )


def clear_tenant(db: Session | None = None) -> None:
    """Drop request tenant context. Does not change an open Postgres transaction."""
    _tenant_id.set(None)
    if db is not None:
        db.info.pop("sioona_tenant_id", None)


@event.listens_for(Session, "after_begin")
def _set_tenant_on_begin(_session, _transaction, connection) -> None:  # noqa: ANN001
    if connection.dialect.name == "postgresql":
        connection.execute(text("SELECT set_config('app.global_control_tenant', :tenant, true)"),
                           {"tenant": get_settings().sioona_global_control_tenant.strip()})
    tenant_id = _session.info.get("sioona_tenant_id") or _tenant_id.get()
    if not tenant_id or connection.dialect.name != "postgresql":
        return
    connection.execute(
        text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
        {"tenant_id": tenant_id},
    )


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped database session."""
    clear_tenant()
    db = SessionLocal()
    try:
        yield db
    finally:
        clear_tenant(db)
        db.close()
