"""SQLite shape of workspaces, users, and memberships. Postgres proves the DDL."""

from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.membership import Membership
from app.models.user import ACTOR_USER_ID_VECTOR, ACTOR_USER_ID_VECTOR_EMAIL, User, actor_user_id
from app.models.workspace import Workspace


def test_actor_user_id_matches_the_shared_vector() -> None:
    assert actor_user_id(ACTOR_USER_ID_VECTOR_EMAIL) == ACTOR_USER_ID_VECTOR
    assert actor_user_id("  Reviewer@Example.Test ") == ACTOR_USER_ID_VECTOR


def test_membership_tables_reject_duplicate_and_bad_role(db) -> None:
    db.add(Workspace(tenant_id="tenant_a", name="A"))
    db.add(User(id=ACTOR_USER_ID_VECTOR, email=ACTOR_USER_ID_VECTOR_EMAIL))
    db.commit()
    db.add(Membership(tenant_id="tenant_a", user_id=ACTOR_USER_ID_VECTOR, role="reviewer"))
    db.commit()

    db.add(Membership(
        tenant_id="tenant_a",
        user_id=ACTOR_USER_ID_VECTOR,
        role="admin",
        revoked_at=datetime.now(timezone.utc),
    ))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    db.add(Membership(tenant_id="tenant_a", user_id=ACTOR_USER_ID_VECTOR, role="owner"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    row = db.get(Membership, ("tenant_a", ACTOR_USER_ID_VECTOR))
    assert row is not None
    assert row.revoked_at is None
    row.revoked_at = datetime.now(timezone.utc)
    db.commit()
    assert db.get(Membership, ("tenant_a", ACTOR_USER_ID_VECTOR)).revoked_at is not None
