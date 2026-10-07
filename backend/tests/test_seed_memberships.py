"""Seed script: idempotent memberships, no password output, revoked rows stay revoked."""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.models.membership import Membership
from app.models.user import User, actor_user_id
from app.models.workspace import Workspace
from scripts.seed_memberships import seed_memberships

SECRET = "super-secret-password-value"
ROW = {
    "email": "Reviewer@Example.Test",
    "role": "reviewer",
    "tenantId": "tenant_partner",
    "password": SECRET,
    "passwordHash": "scrypt$not-printed",
}


def test_seed_is_idempotent_and_can_change_role(db) -> None:
    first = seed_memberships(db, [ROW, {**ROW, "role": "demo", "tenantId": "tenant_demo", "email": "demo@sioona.ai"}])
    assert first == {"upserted": 2, "skipped_revoked": 0}
    user_id = actor_user_id("reviewer@example.test")
    assert db.get(User, user_id).email == "reviewer@example.test"
    assert db.get(Workspace, "tenant_partner").name == "tenant_partner"
    assert db.get(Membership, ("tenant_partner", user_id)).role == "reviewer"

    second = seed_memberships(db, [{**ROW, "role": "admin"}])
    assert second["upserted"] == 1
    assert db.get(Membership, ("tenant_partner", user_id)).role == "admin"
    assert db.query(Membership).count() == 2


def test_seed_does_not_reactivate_revoked_membership(db) -> None:
    seed_memberships(db, [ROW])
    user_id = actor_user_id("reviewer@example.test")
    row = db.get(Membership, ("tenant_partner", user_id))
    row.revoked_at = datetime.now(timezone.utc)
    row.role = "reviewer"
    db.commit()

    counts = seed_memberships(db, [{**ROW, "role": "admin"}])
    assert counts == {"upserted": 0, "skipped_revoked": 1}
    kept = db.get(Membership, ("tenant_partner", user_id))
    assert kept.role == "reviewer"
    assert kept.revoked_at is not None


def test_seed_rejects_unknown_role_without_echoing_the_secret(db) -> None:
    with pytest.raises(ValueError, match="invalid_row"):
        seed_memberships(db, [{**ROW, "role": "owner"}])
    assert db.get(Workspace, "tenant_partner") is None


def test_cli_prints_counts_only(tmp_path: Path) -> None:
    database = tmp_path / "seed.db"
    completed = subprocess.run(
        [sys.executable, "scripts/seed_memberships.py"],
        input=json.dumps([ROW]),
        text=True,
        capture_output=True,
        check=False,
        env={
            "DATABASE_URL": f"sqlite+pysqlite:///{database}",
            "PYTHONPATH": str(Path(__file__).resolve().parents[1]),
            "PATH": "/usr/bin:/bin",
        },
        cwd=Path(__file__).resolve().parents[1],
    )
    assert completed.returncode == 0
    assert SECRET not in completed.stdout
    assert SECRET not in completed.stderr
    assert "scrypt$not-printed" not in completed.stdout
    assert completed.stdout.strip() == '{"upserted":1,"skipped_revoked":0}'
    second = subprocess.run(
        [sys.executable, "scripts/seed_memberships.py"],
        input=json.dumps([ROW]),
        text=True,
        capture_output=True,
        check=False,
        env={
            "DATABASE_URL": f"sqlite+pysqlite:///{database}",
            "PYTHONPATH": str(Path(__file__).resolve().parents[1]),
            "PATH": "/usr/bin:/bin",
        },
        cwd=Path(__file__).resolve().parents[1],
    )
    assert second.returncode == 0
    assert second.stdout.strip() == '{"upserted":1,"skipped_revoked":0}'
