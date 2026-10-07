"""Shared fixtures for actor-auth tests. SQLite only."""

from collections.abc import Generator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import Base, Membership, User, Workspace
from app.models.user import actor_user_id
from tests.test_actor_token import KEY, sign_like_web

MARKER = "MARKER-A-ONLY"


@pytest.fixture()
def api(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "enforce")
    monkeypatch.setenv("SIOONA_ACTOR_KEY", KEY)
    monkeypatch.setenv("SIOONA_ENV", "development")
    monkeypatch.delenv("SIOONA_SERVICE_TOKEN", raising=False)
    get_settings.cache_clear()
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, connection_record) -> None:  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, factory
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        get_settings.cache_clear()


def add_member(factory: sessionmaker, email: str, tenant: str, role: str, *, revoked: bool = False) -> str:
    db: Session = factory()
    try:
        if db.get(Workspace, tenant) is None:
            db.add(Workspace(tenant_id=tenant, name=tenant))
            db.flush()
        user_id = actor_user_id(email)
        if db.get(User, user_id) is None:
            db.add(User(id=user_id, email=email.strip().lower()))
            db.flush()
        row = db.get(Membership, (tenant, user_id))
        if row is None:
            db.add(
                Membership(
                    tenant_id=tenant,
                    user_id=user_id,
                    role=role,
                    revoked_at=datetime.now(timezone.utc) if revoked else None,
                )
            )
        else:
            row.role = role
            row.revoked_at = datetime.now(timezone.utc) if revoked else None
        db.commit()
        return str(user_id)
    finally:
        db.close()


def actor_headers(sub: str, tenant: str, *, header_tenant: str | None = None, **token_kwargs) -> dict[str, str]:
    return {
        "X-Tenant-Id": header_tenant if header_tenant is not None else tenant,
        "X-Sioona-Actor": sign_like_web(sub, tenant, **token_kwargs),
    }
