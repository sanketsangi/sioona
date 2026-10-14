"""Transactional complete-output reconciliation; none is an explicit empty output."""
import hashlib
import json
import re
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from app.services.tenant_lock import lock_tenant_corpus
from app.models.detection_run import DetectionRun
from app.models.signal_prediction import SignalPrediction


def reconcile_detection(db: Session, *, tenant_id: str, run_id: str, conversation_id: str,
                        content_hash: str, model_version: str, prompt_version: str,
                        output: list[dict], coverage: dict | None = None, lease_token: int | None = None) -> DetectionRun:
    """Caller commits. Historical prediction feedback remains on superseded IDs."""
    lock_tenant_corpus(db, tenant_id)
    from app.models.job import Job
    from app.config import get_settings
    job = db.get(Job, (tenant_id, run_id))
    if job is not None:
        if lease_token is None or job.status != "leased" or job.lease_token != lease_token:
            raise ValueError("Fenced job publication required")
    else:
        if get_settings().sioona_detection_execution == "worker":
            raise ValueError("Inline detection publication disabled")
        for active_job in db.scalars(select(Job).where(Job.tenant_id == tenant_id, Job.status.in_(["queued", "leased", "failed"]))):
            from app.services.jobs import job_ids
            if conversation_id in set(job_ids(db, active_job)):
                raise ValueError("Conversation has a durable processor")
    key = (tenant_id, run_id, conversation_id)
    types = [row["signal_type"] for row in output]
    if len(set(types)) != len(types) or any(kind not in {"lead", "retention", "upsell"} for kind in types):
        raise ValueError("Invalid complete detection output")
    # Serialize publication per conversation on PostgreSQL.
    from app.models.conversation import Conversation
    conversation = db.scalar(select(Conversation).where(Conversation.tenant_id == tenant_id,
        Conversation.conversation_id == conversation_id).with_for_update())
    if conversation is None:
        raise ValueError("Conversation must be persisted before detection")
    prior = db.get(DetectionRun, key)
    if prior:
        if (prior.content_hash, prior.model_version, prior.prompt_version, prior.output, prior.coverage) != (content_hash, model_version, prompt_version, output, coverage):
            raise ValueError("Detection run identity conflict")
        return prior
    if conversation_content_hash(db, tenant_id, conversation_id) != content_hash:
        raise ValueError("Conversation changed since classification")
    if coverage is not None:
        from app.models.message import Message
        turns = db.scalars(select(Message.content).where(Message.tenant_id == tenant_id,
            Message.conversation_id == conversation_id, Message.role == "customer")).all()
        if coverage["included_turns"] + coverage["omitted_turns"] != sum(bool(text.strip()) for text in turns):
            raise ValueError("Transcript coverage does not match customer turns")
    validate_customer_evidence(db, tenant_id, conversation_id, output)
    from app.services.commercial_evidence import ground_commercial_values
    commercial_evidence = ground_commercial_values(db, tenant_id, conversation_id, output)

    db.execute(update(DetectionRun).where(DetectionRun.tenant_id == tenant_id,
        DetectionRun.conversation_id == conversation_id, DetectionRun.status == "active").values(status="superseded"))
    db.execute(update(SignalPrediction).where(SignalPrediction.tenant_id == tenant_id,
        SignalPrediction.conversation_id == conversation_id, SignalPrediction.active.is_(True)).values(active=False))
    db.flush()
    run = DetectionRun(tenant_id=tenant_id, run_id=run_id, conversation_id=conversation_id,
        content_hash=content_hash, model_version=model_version, prompt_version=prompt_version,
        status="active", output=output, coverage=coverage)
    db.add(run)
    pending = []
    for item in output:
        row = SignalPrediction(tenant_id=tenant_id, conversation_id=conversation_id,
            detection_run_id=run_id, active=True, signal_type=item["signal_type"],
            confidence=item["confidence"], summary=item["summary"],
            urgency=item.get("urgency"), urgency_timeframe=item.get("urgency_timeframe"),
            mentioned_value_inr=item.get("mentioned_value_inr"),
            commercial_value_evidence=commercial_evidence.get(item["signal_type"]))
        db.add(row)
        pending.append((row, item))
    db.flush()
    from app.services.evidence_anchors import attach_anchors
    for row, item in pending:
        attach_anchors(db, tenant_id=tenant_id, conversation_id=conversation_id,
            prediction=row, evidence=item.get("evidence") or [])
    db.flush()
    return run


def validate_customer_evidence(db: Session, tenant_id: str, conversation_id: str,
                               output: list[dict]) -> None:
    """Validate quoted spans against individual customer turns before any writes.

    Match the UI's whitespace normalization and explicit trailing truncation.
    Existing immutable runs remain readable and replayable; new positive outputs
    require evidence. Empty complete outputs represent none and need no quote.
    Taxonomy/model labels are annotations, never supporting customer evidence.
    """
    from app.models.message import Message
    if not output:
        return
    texts = db.scalars(select(Message.content).where(Message.tenant_id == tenant_id,
        Message.conversation_id == conversation_id, Message.role == "customer")).all()
    normalized = [" ".join(text.split()) for text in texts]
    for item in output:
        evidence = item.get("evidence", [])
        if not evidence:
            raise ValueError("Detection evidence must include a customer quote")
        quotes = []
        for entry in evidence:
            match = re.fullmatch(r'quote: "(.*)"', entry, flags=re.DOTALL)
            if match:
                quotes.append(match.group(1))
            elif not entry.startswith(("llm: ", "keyword: ", "phrase: ", "suppressed: ")):
                quotes.append(entry)
        if not quotes:
            raise ValueError("Detection evidence must include a customer quote")
        for quote in quotes:
            span = " ".join(quote.split())
            if span and any(span in text for text in normalized):
                continue
            # The frontend clips at 140 UTF-16 units; a truncation marker must
            # represent a substantial prefix, not an arbitrary short fragment.
            prefix = span[:-1].rstrip() if span.endswith("…") else ""
            if len(prefix) >= 60 and any(prefix in text for text in normalized):
                continue
            raise ValueError("Detection evidence is not grounded in customer text")


def conversation_content_hash(db: Session, tenant_id: str, conversation_id: str) -> str:
    from app.models.message import Message
    rows = db.scalars(select(Message).where(Message.tenant_id == tenant_id,
        Message.conversation_id == conversation_id).order_by(Message.message_id)).all()
    corpus = [[row.message_id, row.role, row.content] for row in rows]
    return hashlib.sha256(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
