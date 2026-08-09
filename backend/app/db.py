"""SQLAlchemy engine and session helpers."""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
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
    engine = create_engine(
        _database_url,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
