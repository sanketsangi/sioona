"""Unrevoked membership is the role authority for a workspace."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.models.base import Base

MEMBERSHIP_ROLES = frozenset({"admin", "reviewer", "demo"})


class Membership(Base):
    """One role per user per workspace. revoked_at set means the row no longer authorizes."""

    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint(
            "role IN ('admin', 'reviewer', 'demo')",
            name="ck_memberships_role",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.tenant_id", name="fk_memberships_workspace"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", name="fk_memberships_user"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
