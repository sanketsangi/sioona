from datetime import datetime, timezone
import pytest
from sqlalchemy import select
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.signal_prediction import SignalPrediction
from app.services.commercial_evidence import stated_amounts
from app.services.detection_runs import reconcile_detection, conversation_content_hash


@pytest.mark.parametrize("text,expected", [
    ("portfolio ₹1,50,000", [(150000, "₹1,50,000")]),
    ("INR 5 lakh", [(500000, "INR 5 lakh")]),
    ("2.5 crore", [(25000000, "2.5 crore")]),
    ("Fees Rs. 1000.50", [(1001, "Rs. 1000.50")]),
    ("50000 shares", []), ("INR", []), ("₹0", [(0, "₹0")]),
])
def test_stated_amount_spans(text, expected):
    assert stated_amounts(text) == expected


def test_rejects_invented_agent_and_cross_scope_amounts_before_superseding(db):
    now = datetime.now(timezone.utc)
    for tenant, cid in [("a", "c1"), ("b", "c1"), ("a", "other")]:
        db.add(Conversation(tenant_id=tenant, conversation_id=cid, channel="upload", started_at=now))
    db.flush()
    for tenant, cid, role, text in [("a", "c1", "customer", "Subscription INR 1000"),
        ("a", "c1", "agent", "INR 9000"), ("b", "c1", "customer", "INR 8000"),
        ("a", "other", "customer", "INR 7000")]:
        db.add(Message(tenant_id=tenant, conversation_id=cid, message_id=f"{tenant}-{cid}-{role}",
            role=role, content=text, timestamp=now))
    db.commit()
    def publish(identifier, amount):
        return reconcile_detection(db, tenant_id="a", run_id=identifier, conversation_id="c1",
            content_hash=conversation_content_hash(db, "a", "c1"), model_version="m1", prompt_version="p1",
            output=[{"signal_type": "retention", "confidence": .9, "summary": "Leaving with INR 9000",
                "evidence": ['quote: "Subscription INR 1000"'], "mentioned_value_inr": amount}])
    publish("valid", 1000)
    db.commit()
    original = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))
    for amount in [9000, 8000, 7000, 6000]:
        with pytest.raises(ValueError, match="Commercial amount"):
            publish(f"bad-{amount}", amount)
        db.rollback()
        db.refresh(original)
        assert original.active and original.mentioned_value_inr == 1000
    assert original.commercial_value_evidence == [{"message_id": "a-c1-customer", "quote": "INR 1000",
        "amount_inr": 1000, "category": "revenue_opportunity"}]
    assert publish("valid", 1000).run_id == "valid"


def test_extreme_amount_tokens_do_not_crash_publication_parser():
    assert stated_amounts("INR " + "9" * 10000) == []
