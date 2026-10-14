"""Exact six-part cache identity and validated, expiring result reuse.

Only callers with a fenced job may publish/cache. Provider usage is never
copied into application-cache hits. Quotes are re-grounded on each lookup.
"""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import select, func
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


def lookup(db, key, chat):
    row = db.get(ClassificationCache, key)
    if row is None or jobs.utc(row.expires_at) <= jobs.now(db):
        return None
    try:
        # Normalize again; malformed stored JSON must behave as a miss.
        import json
        parsed = gateway.parse_classification(json.dumps(row.classification))
        output = gateway.classification_output(parsed, chat, chat.messages, key[3])
    except (ValueError, TypeError, KeyError):
        return None
    return parsed, output


def store(db, key, parsed, chat):
    gateway.classification_output(parsed, chat, chat.messages, key[3])
    values = dict(zip(KEY_FIELDS, key))
    values.update(classification=parsed, expires_at=jobs.now(db) + TTL)
    # Atomic upsert handles same-key workers on disjoint jobs without a failed
    # transaction. Existing validated classification may simply be refreshed.
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    db.execute(insert(ClassificationCache).values(**values).on_conflict_do_update(
        index_elements=list(KEY_FIELDS),
        set_={"classification": parsed, "expires_at": values["expires_at"]},
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
