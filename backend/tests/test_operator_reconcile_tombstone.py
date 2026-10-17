"""Tests for operator_reconcile_tombstone CLI script."""

from __future__ import annotations

import json
from pathlib import Path
import uuid
import pytest

from scripts.operator_reconcile_tombstone import (
    ReconciliationError,
    validate_database_url,
    validate_trusted_receipt,
    run_reconciliation,
)


def test_validate_database_url():
    assert validate_database_url("postgresql://user:pass@localhost:5432/db")
    assert validate_database_url("postgresql+psycopg://user:pass@localhost:5432/db")
    assert validate_database_url("sqlite:///:memory:")

    with pytest.raises(ReconciliationError, match="database_url_required"):
        validate_database_url("")

    with pytest.raises(ReconciliationError, match="invalid_database_scheme"):
        validate_database_url("mysql://localhost/db")

    with pytest.raises(ReconciliationError, match="pooler_detected"):
        validate_database_url("postgresql://user:pass@localhost:6543/db")

    with pytest.raises(ReconciliationError, match="pooler_detected"):
        validate_database_url("postgresql://user:pass@ep-cool-pooler.neon.tech/db")


def test_validate_trusted_receipt(tmp_path: Path):
    receipt_path = tmp_path / "valid.json"
    valid_id = str(uuid.uuid4())
    receipt_data = {
        "id": valid_id,
        "tenant_id": "tenant_a",
        "state": "completed",
        "policy_version": "cb18.v1",
        "counts": {"messages": 10, "conversations": 1},
    }
    receipt_path.write_text(json.dumps(receipt_data))

    parsed = validate_trusted_receipt(receipt_path, "tenant_a")
    assert parsed["id"] == valid_id

    # Tenant mismatch
    with pytest.raises(ReconciliationError, match="tenant_mismatch"):
        validate_trusted_receipt(receipt_path, "tenant_b")

    # Incomplete state
    incomplete_path = tmp_path / "incomplete.json"
    incomplete_path.write_text(
        json.dumps({**receipt_data, "state": "confirmed"})
    )
    with pytest.raises(ReconciliationError, match="receipt_state_not_completed"):
        validate_trusted_receipt(incomplete_path, "tenant_a")

    # Invalid policy version
    bad_policy = tmp_path / "bad_policy.json"
    bad_policy.write_text(
        json.dumps({**receipt_data, "policy_version": "legacy"})
    )
    with pytest.raises(ReconciliationError, match="unsupported_receipt_policy_version"):
        validate_trusted_receipt(bad_policy, "tenant_a")

    # Negative counts
    bad_counts = tmp_path / "bad_counts.json"
    bad_counts.write_text(
        json.dumps({**receipt_data, "counts": {"messages": -5}})
    )
    with pytest.raises(ReconciliationError, match="invalid_receipt_counts"):
        validate_trusted_receipt(bad_counts, "tenant_a")


def test_reconciliation_e2e(db, tmp_path: Path):
    from tests.test_audit_lifecycle import seed
    from app.services import lifecycle
    from app.models import Conversation, SignalEvidence

    actor, _ = seed(db)
    tenant = "a"

    # Step 1: Request, confirm, and complete deletion
    req = lifecycle.request_deletion(db, tenant, actor)
    lifecycle.confirm_deletion(db, tenant, req.id, actor, f"DELETE {tenant}")
    while True:
        res = lifecycle.advance_deletion(db, tenant, req.id, actor, batch_size=250)
        if res.state == "completed":
            break

    receipt_data = lifecycle.receipt(res)
    assert receipt_data["state"] == "completed"

    # Step 2: Simulate restore of pre-deletion state (unfenced + restored rows)
    from datetime import datetime, timezone
    db.execute(lifecycle.delete(lifecycle.TenantDeletion).where(lifecycle.TenantDeletion.tenant_id == tenant))
    db.add(Conversation(tenant_id=tenant, conversation_id="restored_conv", channel="chat", started_at=datetime.now(timezone.utc)))
    db.commit()

    # Verify rows exist before reconciliation
    assert db.scalar(lifecycle.select(lifecycle.func.count()).select_from(Conversation).where(Conversation.tenant_id == tenant)) == 1

    # Step 3: Run operator reconciliation
    outcome = run_reconciliation(db, tenant, receipt_data, actor)
    assert outcome["state"] == "completed"
    assert outcome["verified_empty_tables"] > 0

    # Verify zero rows remain for tenant
    assert db.scalar(lifecycle.select(lifecycle.func.count()).select_from(Conversation).where(Conversation.tenant_id == tenant)) == 0
