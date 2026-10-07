"""User identity. The assertion subject is uuid5(namespace, normalized email)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.models.base import Base

# Shared with web/src/lib/actor-assertion.ts. Do not change without both tests.
ACTOR_NAMESPACE = uuid.UUID("6f1b9c0e-7a2d-4c31-9e4a-cb0300000001")
# Frozen vector: reviewer@example.test → this id. Both suites assert it.
ACTOR_USER_ID_VECTOR_EMAIL = "reviewer@example.test"
ACTOR_USER_ID_VECTOR = uuid.UUID("4f79ac56-3a83-5f2a-b143-dafc406b7c28")
DEMO_ACTOR_EMAIL = "demo@sioona.ai"


def actor_user_id(email: str) -> uuid.UUID:
    """Stable user id. Password material never enters the hash input."""
    normalized = email.strip().lower()
    if not normalized:
        raise ValueError("email_required")
    return uuid.uuid5(ACTOR_NAMESPACE, normalized)


class User(Base):
    """A person who can hold memberships. Email is unique; id is the assertion sub."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
