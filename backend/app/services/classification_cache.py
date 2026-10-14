"""Exact six-part cache identity and validated, expiring result reuse.

Only callers with a fenced job may publish/cache. Provider usage is never
copied into application-cache hits. Quotes are re-grounded on each lookup.
"""
import json
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import select, func, delete
from app.ai import gateway
from app.models.classification_cache import ClassificationCache
from app.models.inference_attempt import InferenceAttempt
from app.services import jobs

KEY_FIELDS = ("tenant_id", "content_sha256", "prompt_version", "model_id", "route_version", "taxonomy_hash")
TTL = timedelta(days=7)


def context_hash(chat):
    # IDs are excluded: identical inputs may occur in separate conversations.
    # Full ordered source is included, not just the truncated/redacted prompt.
    return jobs.digest({
        "customer_name": chat.customer_name, "channel": chat.channel,
        "messages": [[m.role, m.content] for m in chat.messages],
    })


def identity(tenant, chat, model, overrides):
    return (tenant, context_hash(chat),
            gateway.PROMPT_VERSION + ":" + jobs.digest([gateway.PROMPT_SHA256, gateway.PORT_SHA256]),
            model, gateway.route_version(), jobs.digest({"base": gateway.HEURISTICS, "overrides": overrides}))


def purge_expired(db, tenant):
    db.execute(delete(ClassificationCache).where(
        ClassificationCache.tenant_id == tenant,
        ClassificationCache.expires_at <= jobs.now(db)).execution_options(synchronize_session="fetch"))


def sanitized(parsed, chat, model):
    """Keep grounded quotes and scalar classification, never provider free text.

    Empty summary deliberately selects the gateway's deterministic display text
    on reuse. Grounding does not establish that a model's prose is PII-free.
    """
    parsed = gateway.parse_classification(json.dumps(parsed))
    if parsed is None:
        raise ValueError("invalid_classification")
    gateway.classification_output(parsed, chat, chat.messages, model)
    source = "\n".join(m.content.strip() for m in chat.messages
                       if m.role == "customer" and m.content.strip())
    quotes = [] if parsed["type"] == "none" else list(dict.fromkeys(
        quote for raw in parsed["quotes"]
        if (quote := gateway.grounded_quote(raw, source))))[:2]
    return {"type": parsed["type"], "confidence": parsed["confidence"],
            "summary": "", "quotes": quotes}


def lookup(db, key, chat):
    purge_expired(db, key[0])
    row = db.get(ClassificationCache, key)
    if row is None or jobs.utc(row.expires_at) <= jobs.now(db):
        return None
    try:
        # Normalize again; malformed stored JSON must behave as a miss.
        parsed = gateway.parse_classification(json.dumps(row.classification))
        parsed = sanitized(parsed, chat, key[3])
        output = gateway.classification_output(parsed, chat, chat.messages, key[3])
    except (ValueError, TypeError, KeyError):
        return None
    # Also remove rejected text from entries written by older workers.
    row.classification = parsed
    return parsed, output


def store(db, key, parsed, chat):
    parsed = sanitized(parsed, chat, key[3])
    purge_expired(db, key[0])
    values = dict(zip(KEY_FIELDS, key))
    values.update(classification=parsed, expires_at=jobs.now(db) + TTL)
    # Keep the first result for an unexpired identity. Concurrent standard
    # calls can return different JSON even at temperature zero; a losing writer
    # must not change the result reused by subsequent conversations.
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    db.execute(insert(ClassificationCache).values(**values).on_conflict_do_update(
        index_elements=list(KEY_FIELDS),
        set_={"classification": parsed, "expires_at": values["expires_at"]},
        where=ClassificationCache.expires_at <= jobs.now(db),
    ))


def record_hit(db, lease, chat, key):
    row = jobs.fenced(db, lease, corpus=True)
    jobs.worker_authority(lease.tenant_id, "inference:reserve")
    ordinal = 1 + (db.scalar(select(func.count()).select_from(InferenceAttempt).where(
        InferenceAttempt.tenant_id == lease.tenant_id, InferenceAttempt.job_id == row.id,
        InferenceAttempt.conversation_id == chat.conversation_id)) or 0)
    clock = jobs.now(db)
    db.add(InferenceAttempt(
        tenant_id=lease.tenant_id, attempt_id=uuid4().hex,
        logical_operation_id=jobs.digest([row.id, chat.conversation_id]), attempt_ordinal=ordinal,
        conversation_id=chat.conversation_id, detection_run_id=row.id, job_id=row.id,
        stage="detect", route_version=key[4], provider="groq", model=key[3],
        prompt_version=gateway.PROMPT_VERSION, cache_hit=True, status="succeeded",
        usage_status="reported", input_tokens=0, output_tokens=0, cached_input_tokens=0,
        reasoning_tokens=0, latency_ms=0, started_at=clock, finished_at=clock,
        estimated_cost_usd=Decimal("0"), cost_status="reconciled",
    ))
