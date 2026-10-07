"""Upsert workspaces, users, and memberships from a SIOONA_PILOT_USERS JSON array.

Stdout is counts only. Password fields are discarded and never printed.
A revoked membership stays revoked. A human runs this against a database they choose.
Operators who run Reset Demo under enforce need an admin row on tenant_demo in this
stdin payload, not only on their partner tenant.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from sqlalchemy.orm import Session

from app.models.membership import MEMBERSHIP_ROLES, Membership
from app.models.user import User, actor_user_id
from app.models.workspace import Workspace


def seed_memberships(db: Session, rows: list[Any]) -> dict[str, int]:
    """Idempotent upsert. Raises ValueError('invalid_row') without row contents."""
    if not isinstance(rows, list):
        raise ValueError("invalid_row")
    upserted = 0
    skipped_revoked = 0
    for raw in rows:
        if not isinstance(raw, dict):
            raise ValueError("invalid_row")
        email = raw.get("email")
        role = raw.get("role")
        tenant_id = raw.get("tenantId")
        if not isinstance(email, str) or not isinstance(tenant_id, str) or role not in MEMBERSHIP_ROLES:
            raise ValueError("invalid_row")
        email = email.strip().lower()
        tenant_id = tenant_id.strip()
        if not email or "@" not in email or not tenant_id:
            raise ValueError("invalid_row")
        user_id = actor_user_id(email)
        if db.get(Workspace, tenant_id) is None:
            db.add(Workspace(tenant_id=tenant_id, name=tenant_id))
            db.flush()
        if db.get(User, user_id) is None:
            db.add(User(id=user_id, email=email))
            db.flush()
        membership = db.get(Membership, (tenant_id, user_id))
        if membership is not None and membership.revoked_at is not None:
            skipped_revoked += 1
            continue
        if membership is None:
            db.add(Membership(tenant_id=tenant_id, user_id=user_id, role=role))
        else:
            membership.role = role
        upserted += 1
    db.commit()
    return {"upserted": upserted, "skipped_revoked": skipped_revoked}


def main() -> int:
    raw = sys.stdin.read()
    try:
        parsed = json.loads(raw) if raw.strip() else []
    except json.JSONDecodeError:
        print(json.dumps({"error": "invalid_json"}))
        return 2
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        counts = seed_memberships(db, parsed)
    except ValueError:
        db.rollback()
        print(json.dumps({"error": "invalid_row"}))
        return 2
    except Exception:
        db.rollback()
        print(json.dumps({"error": "database_unavailable"}))
        return 1
    finally:
        db.close()
    print(json.dumps(counts, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
