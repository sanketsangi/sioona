from datetime import datetime, timezone
from sqlalchemy import select
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.signal_prediction import SignalPrediction
from app.services.detection_runs import reconcile_detection, conversation_content_hash
from app.services.feedback import record_feedback
from app.services.signal_score import calculate_signal_score
from app.services.review_queue import list_signals_needing_review


def test_complete_output_supersedes_none_and_keeps_historical_feedback(db):
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=datetime.now(timezone.utc)))
    db.flush()
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="intent", role="customer",
        content="Close my account and open a new account", timestamp=datetime.now(timezone.utc)))
    db.commit()
    def run(identifier, output):
        result = reconcile_detection(db, tenant_id="a", run_id=identifier, conversation_id="c1", content_hash=conversation_content_hash(db, "a", "c1"),
            model_version="model-v1", prompt_version="prompt-v1", output=output)
        db.commit()
        return result
    output = [{"signal_type": "retention", "confidence": .9, "summary": "Leaving", "evidence": ['quote: "Close my account"']} ]
    run("r1", output)
    old = db.scalar(select(SignalPrediction).where(SignalPrediction.active.is_(True)))
    record_feedback(db, tenant_id="a", signal_id=old.id, feedback="correct", reviewed_by="reviewer")
    assert calculate_signal_score(db, "a").reviewed_count == 1
    run("r2", [])
    assert calculate_signal_score(db, "a").reviewed_count == 0
    assert list_signals_needing_review(db, "a") == []
    db.refresh(old)
    assert old.active is False
    assert old.feedback.feedback == "correct"
    run("r3", [{"signal_type": "lead", "confidence": .8, "summary": "Opening", "evidence": ['quote: "open a new account"']}])
    queued = list_signals_needing_review(db, "a")
    assert len(queued) == 1 and queued[0].signal_type == "lead"
    assert queued[0].feedback is None
    assert run("r3", [{"signal_type": "lead", "confidence": .8, "summary": "Opening", "evidence": ['quote: "open a new account"']}]).status == "active"


def test_api_rejects_stale_batch_atomically_and_replays_prior_result(client):
    import hashlib
    headers = {"X-Tenant-Id": "a"}
    for cid in ["c1", "c2"]:
        assert client.post("/v1/conversations", headers=headers, json={
            "conversation_id": cid, "channel": "upload", "started_at": "2026-10-01T00:00:00Z"}).status_code == 201
    item = {"conversation_id": "c1", "content_hash": hashlib.sha256(b"[]").hexdigest(),
            "model_version": "m1", "prompt_version": "p1", "output": []}
    url = "/v1/tenants/a/detection-runs/run1"
    bad = {**item, "conversation_id": "c2", "content_hash": "0" * 64}
    assert client.post(url, headers=headers, json={"conversations": [item, bad]}).status_code == 409
    assert client.get(url, headers=headers).status_code == 404
    assert client.post(url, headers=headers, json={"conversations": [item]}).status_code == 200
    assert client.post(url, headers=headers, json={"conversations": [item]}).status_code == 200
    assert client.post(url, headers=headers, json={"conversations": [{**item, "prompt_version": "p2"}]}).status_code == 409
    historic = client.get(url, headers=headers).json()["conversations"][0]
    assert historic["output"] == [] and historic["prompt_version"] == "p1"
    assert client.get(url, headers={"X-Tenant-Id": "b"}).status_code == 403


def test_legacy_writes_cannot_mutate_versioned_none_or_add_new_type(client):
    import hashlib
    headers = {"X-Tenant-Id": "a"}
    client.post("/v1/conversations", headers=headers, json={"conversation_id": "c1", "channel": "upload", "started_at": "2026-10-01T00:00:00Z"})
    response = client.post("/v1/tenants/a/detection-runs/none", headers=headers, json={"conversations": [{
        "conversation_id": "c1", "content_hash": hashlib.sha256(b"[]").hexdigest(),
        "model_version": "m1", "prompt_version": "p1", "output": []}]})
    assert response.status_code == 200
    prediction = {"conversation_id": "c1", "signal_type": "lead", "confidence": .9, "summary": "Stale opening"}
    assert client.post("/v1/predictions", headers=headers, json=prediction).status_code == 409
    bulk = {"predictions": [{**prediction, "conversation_id": "legacy"}, prediction]}
    assert client.post("/v1/predictions/bulk", headers=headers, json=bulk).status_code == 409
    # Complete none output and the rejected batch remain unchanged.
    assert client.get("/v1/tenants/a/detection-runs/none", headers=headers).json()["conversations"][0]["output"] == []
    assert client.post("/v1/predictions", headers=headers, json={**prediction, "conversation_id": "legacy"}).status_code == 201


def test_legacy_upsert_preserves_published_prediction_and_feedback(db):
    import pytest
    from app.services.predictions import record_prediction, VersionedPredictionConflict
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=datetime.now(timezone.utc)))
    db.flush()
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="intent", role="customer",
        content="Close my account and open a new account", timestamp=datetime.now(timezone.utc)))
    db.commit()
    reconcile_detection(db, tenant_id="a", run_id="reviewed", conversation_id="c1",
        content_hash=conversation_content_hash(db, "a", "c1"), model_version="m1", prompt_version="p1",
        output=[{"signal_type": "lead", "confidence": .9, "summary": "Published opening", "evidence": ['quote: "open a new account"']}])
    db.commit()
    row = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))
    record_feedback(db, tenant_id="a", signal_id=row.id, feedback="correct", reviewed_by="reviewer")
    with pytest.raises(VersionedPredictionConflict):
        record_prediction(db, tenant_id="a", conversation_id="c1", signal_type="lead", confidence=.1, summary="Stale rewrite")
    db.rollback()
    db.refresh(row)
    assert row.summary == "Published opening" and row.confidence == .9
    assert row.feedback.feedback == "correct"


def test_versioned_output_persists_commercial_metadata_and_keeps_old_shape():
    from app.schemas.detection_run import DetectionOutput
    old = {"signal_type": "lead", "confidence": .9, "summary": "Opening", "evidence": []}
    assert DetectionOutput.model_validate(old).model_dump() == old


def test_commercial_metadata_survives_publication(db):
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=datetime.now(timezone.utc)))
    from app.models.message import Message
    db.flush()
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="amount", role="customer",
        content="My portfolio is INR 5 lakh", timestamp=datetime.now(timezone.utc)))
    db.commit()
    output = {"signal_type": "lead", "confidence": .9, "summary": "Opening", "evidence": ['quote: "My portfolio is INR 5 lakh"'],
        "urgency": "high", "urgency_timeframe": "this week", "mentioned_value_inr": 500000}
    reconcile_detection(db, tenant_id="a", run_id="commercial", conversation_id="c1",
        content_hash=conversation_content_hash(db, "a", "c1"), model_version="m1", prompt_version="p1", output=[output])
    db.commit()
    row = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))
    assert (row.urgency, row.urgency_timeframe, row.mentioned_value_inr) == ("high", "this week", 500000)

    assert row.commercial_value_evidence == [{"message_id": "amount", "quote": "INR 5 lakh", "amount_inr": 500000, "category": "asset"}]


def test_grounded_evidence_checks_customer_role_scope_and_preserves_revision(db):
    import pytest
    from app.models.message import Message
    from app.models.detection_run import DetectionRun
    now = datetime.now(timezone.utc)
    for tenant, cid, role, text in [
        ("a", "c1", "customer", "I  want\nto close my account today"),
        ("a", "c1", "agent", "Open a new investment account"),
        ("b", "c1", "customer", "Upgrade my plan"),
        ("a", "other", "customer", "Transfer my portfolio"),
    ]:
        if db.scalar(select(Conversation).where(Conversation.tenant_id == tenant, Conversation.conversation_id == cid)) is None:
            db.add(Conversation(tenant_id=tenant, conversation_id=cid, channel="upload", started_at=now))
            db.flush()
        db.add(Message(tenant_id=tenant, conversation_id=cid, message_id=f"{tenant}-{cid}-{role}",
                       role=role, content=text, timestamp=now))
    db.commit()
    content_hash = conversation_content_hash(db, "a", "c1")
    def publish(run_id, evidence):
        return reconcile_detection(db, tenant_id="a", run_id=run_id, conversation_id="c1",
            content_hash=content_hash, model_version="m1", prompt_version="p1",
            output=[{"signal_type": "retention", "confidence": .9, "summary": "Leaving",
                     "evidence": evidence}])
    publish("grounded", ['quote: "want to close my account"', "llm: model"])
    db.commit()
    original = db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a"))
    record_feedback(db, tenant_id="a", signal_id=original.id, feedback="correct", reviewed_by="reviewer")
    for index, evidence in enumerate([
        [],
        ['quote: "Open a new investment account"'],
        ['quote: "Upgrade my plan"'], ['quote: "Transfer my portfolio"'],
        ['quote: "I want to open my account today"'],
        ['quote: "want…"'], ["llm: model", 'keyword: "close"'],
        ['quote: "want to close my account"', 'quote: "fabricated"'],
    ]):
        with pytest.raises(ValueError, match="evidence"):
            publish(f"invalid-{index}", evidence)
        db.rollback()
        db.refresh(original)
        assert original.active and original.feedback.feedback == "correct"
        assert db.get(DetectionRun, ("a", f"invalid-{index}", "c1")) is None


def test_grounded_evidence_accepts_unicode_and_explicit_long_quote_clipping(db):
    from app.models.message import Message
    now = datetime.now(timezone.utc)
    text = "मुझे अपना खाता बंद करना है " + "customer context " * 20
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=now))
    db.flush()
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="m1", role="customer", content=text, timestamp=now))
    db.commit()
    run = reconcile_detection(db, tenant_id="a", run_id="unicode", conversation_id="c1",
        content_hash=conversation_content_hash(db, "a", "c1"), model_version="m1", prompt_version="p1",
        output=[{"signal_type": "retention", "confidence": .9, "summary": "Leaving",
                 "evidence": [f'quote: "{text[:139].rstrip()}…"']}])
    db.commit()
    assert run.status == "active"


def test_none_coverage_is_durable_immutable_and_validated(client):
    import hashlib
    import json
    headers = {"X-Tenant-Id": "a"}
    messages = [{"message_id": f"m{i}", "role": "customer", "content": "Thanks",
                 "timestamp": "2026-10-01T00:00:00Z"} for i in range(9)]
    client.post("/v1/conversations", headers=headers, json={"conversation_id": "c1", "channel": "upload",
                "started_at": "2026-10-01T00:00:00Z", "messages": messages})
    corpus = [[m["message_id"], m["role"], m["content"]] for m in messages]
    content_hash = hashlib.sha256(json.dumps(corpus, separators=(",", ":")).encode()).hexdigest()
    coverage = {"included_turns": 2, "omitted_turns": 7, "truncated": True,
                "token_upper_bound": 100, "token_budget": 2400}
    item = {"conversation_id": "c1", "content_hash": content_hash,
            "model_version": "m1", "prompt_version": "p1", "output": [], "coverage": coverage}
    url = "/v1/tenants/a/detection-runs/coverage"
    assert client.post(url, headers=headers, json={"conversations": [item]}).status_code == 200
    assert client.get(url, headers=headers).json()["conversations"][0]["coverage"] == coverage
    assert client.post(url, headers=headers, json={"conversations": [item]}).status_code == 200
    changed = {**item, "coverage": {**coverage, "omitted_turns": 8}}
    assert client.post(url, headers=headers, json={"conversations": [changed]}).status_code == 409
    for invalid in [{**coverage, "truncated": False}, {**coverage, "token_upper_bound": 2401},
                    {**coverage, "included_turns": -1}]:
        assert client.post(url, headers=headers, json={"conversations": [{**item, "coverage": invalid}]}).status_code == 422
    mismatch_url = "/v1/tenants/a/detection-runs/mismatchedcoverage"
    assert client.post(mismatch_url, headers=headers, json={"conversations": [changed]}).status_code == 409
    assert client.get(mismatch_url, headers=headers).status_code == 404


def test_missing_evidence_rolls_back_whole_detection_batch(client):
    import hashlib
    import json
    headers = {"X-Tenant-Id": "a"}
    items = []
    for cid in ["c1", "c2"]:
        message = {"message_id": f"{cid}-m1", "role": "customer", "content": "Close my account",
                   "timestamp": "2026-10-01T00:00:00Z"}
        assert client.post("/v1/conversations", headers=headers, json={"conversation_id": cid,
            "channel": "upload", "started_at": message["timestamp"], "messages": [message]}).status_code == 201
        digest = hashlib.sha256(json.dumps([[message["message_id"], "customer", message["content"]]],
            separators=(",", ":")).encode()).hexdigest()
        items.append({"conversation_id": cid, "content_hash": digest, "model_version": "m1",
            "prompt_version": "p1", "output": [{"signal_type": "retention", "confidence": .9,
                "summary": "Leaving", "evidence": ['quote: "Close my account"']}]})
    url = "/v1/tenants/a/detection-runs/groundedbatch"
    assert client.post(url, headers=headers, json={"conversations": items}).status_code == 200
    # c1 reconciles first; c2's second positive output has no supporting quote.
    items[1]["output"].append({"signal_type": "lead", "confidence": .8, "summary": "Opening"})
    rejected = "/v1/tenants/a/detection-runs/unsupportedbatch"
    response = client.post(rejected, headers=headers, json={"conversations": items})
    assert response.status_code == 409 and "customer quote" in response.text
    assert client.get(rejected, headers=headers).status_code == 404
    assert all(row["status"] == "active" for row in client.get(url, headers=headers).json()["conversations"])


def test_every_validator_accepted_quote_resolves_and_replay_does_not_duplicate(db):
    from app.models.signal_evidence import SignalEvidence

    now = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)
    early = "I want to close my account"
    late = "I want to close my account and I want to close my account again"
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=now))
    db.flush()
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="early", role="customer",
                   content=early, timestamp=now))
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="late", role="customer",
                   content=late, timestamp=datetime(2026, 10, 8, 12, 1, tzinfo=timezone.utc)))
    db.commit()
    output = [{"signal_type": "retention", "confidence": .9, "summary": "Leaving",
               "evidence": ['quote: "I want to close my account"', "llm: model",
                            'quote: "I want to close my account"']}]
    first = reconcile_detection(db, tenant_id="a", run_id="anchored", conversation_id="c1",
        content_hash=conversation_content_hash(db, "a", "c1"), model_version="m1", prompt_version="p1",
        output=output)
    db.commit()
    row = db.scalar(select(SignalPrediction).where(SignalPrediction.active.is_(True)))
    anchors = list(db.scalars(select(SignalEvidence).where(SignalEvidence.prediction_id == row.id)).all())
    assert row.evidence_status == "valid"
    assert len(anchors) == 1
    assert anchors[0].message_id == "late"
    assert anchors[0].candidate_turns == 2
    assert late[anchors[0].start_cp:anchors[0].end_cp] == "I want to close my account"
    replay = reconcile_detection(db, tenant_id="a", run_id="anchored", conversation_id="c1",
        content_hash=first.content_hash, model_version="m1", prompt_version="p1", output=output)
    db.commit()
    assert replay.run_id == first.run_id
    assert len(list(db.scalars(select(SignalEvidence).where(SignalEvidence.tenant_id == "a")).all())) == 1


def test_anchor_publication_failure_rolls_back(db, monkeypatch):
    import pytest
    from app.models.detection_run import DetectionRun
    from app.models.signal_evidence import SignalEvidence
    from app.services import evidence_anchors

    now = datetime.now(timezone.utc)
    db.add(Conversation(tenant_id="a", conversation_id="c1", channel="upload", started_at=now))
    db.flush()
    db.add(Message(tenant_id="a", conversation_id="c1", message_id="m1", role="customer",
                   content="Close my account", timestamp=now))
    db.commit()
    monkeypatch.setattr(evidence_anchors, "resolve_anchor", lambda quote, turns: None)
    with pytest.raises(ValueError, match="not grounded"):
        reconcile_detection(db, tenant_id="a", run_id="broken", conversation_id="c1",
            content_hash=conversation_content_hash(db, "a", "c1"), model_version="m1", prompt_version="p1",
            output=[{"signal_type": "retention", "confidence": .9, "summary": "Leaving",
                     "evidence": ['quote: "Close my account"']}])
    db.rollback()
    assert db.get(DetectionRun, ("a", "broken", "c1")) is None
    assert db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a")) is None
    assert db.scalar(select(SignalEvidence).where(SignalEvidence.tenant_id == "a")) is None


def test_existing_unsupported_immutable_run_remains_replayable(db):
    from app.models.detection_run import DetectionRun
    db.add(Conversation(tenant_id="a", conversation_id="legacy", channel="upload",
                        started_at=datetime.now(timezone.utc)))
    db.flush()
    old_output = [{"signal_type": "lead", "confidence": .9, "summary": "Historic", "evidence": []}]
    digest = conversation_content_hash(db, "a", "legacy")
    db.add(DetectionRun(tenant_id="a", run_id="legacy", conversation_id="legacy", content_hash=digest,
        model_version="m1", prompt_version="p1", status="superseded", output=old_output))
    db.commit()
    replay = reconcile_detection(db, tenant_id="a", run_id="legacy", conversation_id="legacy",
        content_hash=digest, model_version="m1", prompt_version="p1", output=old_output)
    assert replay.status == "superseded" and replay.output == old_output
    assert db.scalar(select(SignalPrediction).where(SignalPrediction.tenant_id == "a")) is None
