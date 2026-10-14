import pytest
from sqlalchemy.orm import Session

from app.api.routes.pilot_requests import Intake, accept_request
from scripts.lookup_pilot_request import lookup_receipt


def test_lookup_reconstructs_committed_intake_without_default_pii(db):
    key = "persisted-receipt-test-0001"
    result = accept_request(Intake(name=" Reviewer ", email="REVIEWER@example.test",
                                  company="Company", message="Review this request"), key, db)
    assert result == {"ok": True, "receipt": key}
    # A separate session proves the lookup reads committed storage.
    with Session(db.get_bind()) as reader:
        receipt = lookup_receipt(reader, key)
        assert set(receipt) == {"receipt_id", "created_at"}
        assert receipt["receipt_id"] == key
        full = lookup_receipt(reader, key, include_contact=True)
        assert full["name"] == "Reviewer"
        assert full["email"] == "reviewer@example.test"
        assert full["message"] == "Review this request"
        assert "payload_hash" not in full
        assert lookup_receipt(reader, "missing-receipt-test-0001") is None


def test_lookup_rejects_invalid_identity(db):
    with pytest.raises(ValueError, match="invalid_receipt"):
        lookup_receipt(db, "invalid")
