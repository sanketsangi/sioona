"""Anchor resolution stays in Python and follows the validator's match order."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.services.evidence_anchors import (
    customer_turns,
    reconstruct,
    resolve_anchor,
    text_sha256,
)


def _resolve(quote: str, turns: list[tuple[str, str]]):
    return resolve_anchor(quote, turns)


def test_latest_turn_wins_and_records_candidate_count():
    turns = [("early", "please close the account"), ("late", "please close the account")]
    anchor = _resolve("please close the account", turns)
    assert anchor is not None
    assert anchor.message_id == "late"
    assert anchor.candidate_turns == 2
    assert anchor.start == 0
    assert reconstruct("please close the account", start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == "please close the account"


def test_first_occurrence_inside_the_latest_turn():
    anchor = _resolve("close", [("only", "close now, then close again")])
    assert anchor is not None
    assert (anchor.start, anchor.end) == (0, 5)


def test_tie_breaks_on_message_id_after_equal_timestamps(db: Session):
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=now))
    db.flush()
    for message_id in ("m-b", "m-a"):
        db.add(Message(tenant_id="a", conversation_id="c1", message_id=message_id, role="customer",
                       content="please close the account", timestamp=now, content_sha256=text_sha256("please close the account")))
    db.commit()
    anchor = _resolve("please close the account", customer_turns(db, "a", "c1"))
    assert anchor is not None and anchor.message_id == "m-b" and anchor.candidate_turns == 2


def test_emoji_astral_combining_marks_and_hindi():
    emoji = "I am leaving 👍 today"
    anchor = _resolve("leaving 👍 today", [("m", emoji)])
    assert anchor is not None
    assert reconstruct(emoji, start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == "leaving 👍 today"
    assert len("👍") == 1

    combining = "cafe\u0301 account"
    anchor = _resolve("cafe\u0301", [("m", combining)])
    assert anchor is not None
    assert anchor.end - anchor.start == len("cafe\u0301")
    assert reconstruct(combining, start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == "cafe\u0301"

    hindi = "मुझे अपना खाता बंद करना है"
    anchor = _resolve("खाता बंद", [("m", hindi)])
    assert anchor is not None
    assert reconstruct(hindi, start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == "खाता बंद"

    hinglish = "paisa nikalna hai, Zerodha pe shift kar raha hoon"
    anchor = _resolve("Zerodha pe shift", [("m", hinglish)])
    assert anchor is not None
    assert reconstruct(hinglish, start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == "Zerodha pe shift"


def test_crlf_repeated_spaces_and_whitespace_collapse_span():
    content = "please\r\n\r\nclose   the account"
    anchor = _resolve("please close the account", [("m", content)])
    assert anchor is not None
    restored = reconstruct(content, start=anchor.start, end=anchor.end, digest=anchor.text_sha256)
    assert restored == content
    assert " ".join(restored.split()) == "please close the account"


def test_literal_ellipsis_matches_before_truncation():
    content = "I will wait… then close the account"
    anchor = _resolve("wait…", [("m", content)])
    assert anchor is not None
    assert reconstruct(content, start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == "wait…"
    assert _resolve("wait…", [("m", "I will wait then close")]) is None


def test_clipped_quote_uses_prefix_only_after_exact_miss():
    body = "please close the account " + ("because fees are high " * 6)
    prefix = body[:70].rstrip()
    assert len(prefix) >= 60
    anchor = _resolve(prefix + "…", [("m", body)])
    assert anchor is not None
    restored = reconstruct(body, start=anchor.start, end=anchor.end, digest=anchor.text_sha256)
    assert restored == body[: anchor.end]
    assert "…" not in (restored or "")
    assert _resolve("short…", [("m", body)]) is None


def test_redacted_token_resolves_as_literal_text():
    content = "Account [REDACTED] should be closed"
    anchor = _resolve("Account [REDACTED] should be closed", [("m", content)])
    assert anchor is not None
    assert reconstruct(content, start=anchor.start, end=anchor.end, digest=anchor.text_sha256) == content


def test_reconstruct_rejects_missing_stale_and_out_of_range_spans():
    content = "please close the account"
    digest = text_sha256(content)
    assert reconstruct(None, start=0, end=6, digest=digest) is None
    assert reconstruct("please close the account!", start=0, end=6, digest=digest) is None
    assert reconstruct(content, start=-1, end=6, digest=digest) is None
    assert reconstruct(content, start=0, end=len(content) + 1, digest=digest) is None
    assert reconstruct(content, start=4, end=4, digest=digest) is None
    assert reconstruct(content, start=0, end=6, digest=digest) == "please"


def test_same_message_id_stays_inside_the_tenant(db: Session):
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    for tenant, text in (("a", "close my account"), ("b", "open a new account")):
        db.add(Conversation(tenant_id=tenant, conversation_id="c1", channel="upload", started_at=now))
        db.flush()
        db.add(Message(tenant_id=tenant, conversation_id="c1", message_id="m1", role="customer",
                       content=text, timestamp=now, content_sha256=text_sha256(text)))
    db.commit()
    own = _resolve("close my account", customer_turns(db, "a", "c1"))
    other = _resolve("close my account", customer_turns(db, "b", "c1"))
    assert own is not None and own.message_id == "m1"
    assert other is None
    assert reconstruct("close my account", start=own.start, end=own.end, digest=own.text_sha256) == "close my account"


def test_all_displayed_quotes_reconstruct(client):
    """Every surfaced quote matches persisted text, and at least one is valid."""
    import hashlib
    import json
    from app.db import get_db
    from app.models.signal_evidence import SignalEvidence
    from app.models.signal_prediction import SignalPrediction
    from sqlalchemy import func, select

    headers = {"X-Tenant-Id": "a"}
    content = "Please pause my SIP this month"
    message = {"message_id": "m-valid", "role": "customer", "content": content, "timestamp": "2026-10-08T00:00:00Z"}
    digest = hashlib.sha256(json.dumps([["m-valid", "customer", content]], separators=(",", ":")).encode()).hexdigest()
    published = client.put("/v1/tenants/a/ingestions/anchored", headers=headers, json={
        "source": "synthetic.csv", "replace": False, "conversations": [{
            "conversation_id": "valid", "channel": "upload", "started_at": message["timestamp"], "messages": [message],
        }], "detections": [{
            "conversation_id": "valid", "content_hash": digest, "model_version": "m1", "prompt_version": "p1",
            "output": [{"signal_type": "retention", "confidence": 0.9, "summary": "Leaving",
                        "evidence": [f'quote: "{content}"']}],
        }],
    })
    assert published.status_code == 200, published.text
    legacy = client.post("/v1/predictions", headers=headers, json={
        "conversation_id": "legacy", "signal_type": "lead", "confidence": 0.4, "summary": "No anchor",
    })
    assert legacy.status_code == 201
    assert legacy.json()["evidence_status"] == "unresolved"
    assert legacy.json()["evidence_spans"] == []

    changed = "Please pause my SIP next month"
    assert client.post("/v1/conversations", headers=headers, json={
        "conversation_id": "stale", "channel": "upload", "started_at": message["timestamp"],
        "messages": [{**message, "message_id": "m-stale", "content": content}],
    }).status_code == 201
    stale_digest = hashlib.sha256(json.dumps([["m-stale", "customer", content]], separators=(",", ":")).encode()).hexdigest()
    assert client.post("/v1/tenants/a/detection-runs/stale", headers=headers, json={"conversations": [{
        "conversation_id": "stale", "content_hash": stale_digest, "model_version": "m1", "prompt_version": "p1",
        "output": [{"signal_type": "upsell", "confidence": 0.5, "summary": "Later",
                    "evidence": [f'quote: "{content}"']}],
    }]}).status_code == 200
    assert client.post("/v1/conversations", headers=headers, json={
        "conversation_id": "stale", "channel": "upload", "started_at": message["timestamp"],
        "messages": [{**message, "message_id": "m-stale", "content": changed}],
    }).status_code == 201

    other = client.post("/v1/conversations", headers={"X-Tenant-Id": "b"}, json={
        "conversation_id": "valid", "channel": "upload", "started_at": message["timestamp"],
        "messages": [{**message, "message_id": "m-valid", "content": "Other tenant secret quote"}],
    })
    assert other.status_code == 201

    session_source = client.app.dependency_overrides[get_db]()
    db = next(session_source)
    before = db.scalar(select(func.count()).select_from(SignalEvidence))
    stored = {
        (row.conversation_id, row.message_id): row.content
        for row in db.scalars(select(Message).where(Message.tenant_id == "a")).all()
    }
    session_source.close()

    listed = client.get("/v1/tenants/a/signals", headers=headers)
    pending = client.get("/v1/tenants/a/signals/needs-review?limit=100", headers=headers)
    page = client.get("/v1/tenants/a/signals/needs-review/page?limit=100", headers=headers)
    signal_page = client.get("/v1/tenants/a/signals/page?limit=100", headers=headers)
    snapshot = client.get("/v1/tenants/a/uploads/anchored/snapshot", headers=headers)
    assert listed.status_code == pending.status_code == page.status_code == signal_page.status_code == 200
    assert snapshot.status_code == 200, snapshot.text
    for det in snapshot.json()["detections"]:
        for out in det.get("output", []):
            assert out.get("evidence") == []
    bodies = listed.json() + pending.json() + page.json()["predictions"] + signal_page.json()["predictions"]
    bodies += snapshot.json()["predictions"]
    quotes = []
    for row in bodies:
        if row["tenant_id"] != "a":
            raise AssertionError(row["tenant_id"])
        assert "Other tenant secret quote" not in json.dumps(row)
        if row["conversation_id"] == "valid":
            assert row["evidence_status"] == "valid" and row["evidence_reason"] is None
            assert row["evidence_spans"][0]["quote"] == content
            assert row["evidence_spans"][0]["message_id"] == "m-valid"
        elif row["conversation_id"] == "stale":
            assert row["evidence_status"] == "stale"
            assert row["evidence_reason"] == "source_changed"
            assert all(span["quote"] is None for span in row["evidence_spans"])
        elif row["conversation_id"] == "legacy":
            assert row["evidence_status"] == "unresolved"
            assert row["evidence_reason"] == "unresolved"
            assert row["evidence_spans"] == []
        for span in row["evidence_spans"]:
            if span["quote"] is None:
                continue
            source = stored[(row["conversation_id"], span["message_id"])]
            assert source[span["start"]:span["end"]] == span["quote"]
            quotes.append(span["quote"])
    assert quotes
    hidden = client.get("/v1/tenants/b/signals", headers={"X-Tenant-Id": "b"})
    assert hidden.status_code == 200
    assert all("Please pause my SIP this month" not in json.dumps(row) or row["conversation_id"] != "valid" for row in hidden.json())
    assert all(row["conversation_id"] != "stale" for row in hidden.json())

    session_source = client.app.dependency_overrides[get_db]()
    db = next(session_source)
    after = db.scalar(select(func.count()).select_from(SignalEvidence))
    assert after == before
    stale = db.scalar(select(SignalPrediction).where(
        SignalPrediction.tenant_id == "a", SignalPrediction.conversation_id == "stale"))
    assert stale.evidence_status == "stale"
    session_source.close()


def test_read_reconstruct_failure_shows_stale_without_mutating_db_status(client):
    """Display-only stale on mismatch; evidence_status in the row is not rewritten on GET."""
    import hashlib
    import json
    from app.db import get_db
    from app.models.message import Message
    from app.models.signal_prediction import SignalPrediction
    from sqlalchemy import select

    headers = {"X-Tenant-Id": "a"}
    content = "Please pause my SIP this month"
    message = {
        "message_id": "m-tamper",
        "role": "customer",
        "content": content,
        "timestamp": "2026-10-08T00:00:00Z",
    }
    digest = hashlib.sha256(
        json.dumps([["m-tamper", "customer", content]], separators=(",", ":")).encode()
    ).hexdigest()
    assert client.put(
        "/v1/tenants/a/ingestions/tamper",
        headers=headers,
        json={
            "source": "synthetic.csv",
            "replace": False,
            "conversations": [{
                "conversation_id": "tamper",
                "channel": "upload",
                "started_at": message["timestamp"],
                "messages": [message],
            }],
            "detections": [{
                "conversation_id": "tamper",
                "content_hash": digest,
                "model_version": "m1",
                "prompt_version": "p1",
                "output": [{
                    "signal_type": "retention",
                    "confidence": 0.9,
                    "summary": "Leaving",
                    "evidence": [f'quote: "{content}"'],
                }],
            }],
        },
    ).status_code == 200

    session_source = client.app.dependency_overrides[get_db]()
    db = next(session_source)
    row = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.tenant_id == "a",
            SignalPrediction.conversation_id == "tamper",
        )
    )
    assert row is not None and row.evidence_status == "valid"
    msg = db.scalar(
        select(Message).where(
            Message.tenant_id == "a",
            Message.conversation_id == "tamper",
            Message.message_id == "m-tamper",
        )
    )
    msg.content = "Tampered customer text without stale mark"
    db.commit()
    session_source.close()

    listed = client.get("/v1/tenants/a/signals", headers=headers)
    assert listed.status_code == 200
    payload = next(r for r in listed.json() if r["conversation_id"] == "tamper")
    assert payload["evidence_status"] == "stale"
    assert payload["evidence_reason"] == "source_changed"
    assert all(span["quote"] is None for span in payload["evidence_spans"])

    session_source = client.app.dependency_overrides[get_db]()
    db = next(session_source)
    row = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.tenant_id == "a",
            SignalPrediction.conversation_id == "tamper",
        )
    )
    assert row.evidence_status == "valid"
    session_source.close()
