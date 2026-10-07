"""Persist and aggregate inference attempts. Rejects a bad batch as a whole."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.inference_attempt import FINAL_ATTEMPT_STATUSES, LEDGER_COLUMNS, InferenceAttempt
from app.schemas.inference_attempt import InferenceAttemptIn, InferenceUsageGroup
from app.services.inference_rates import estimate_cost, rate_for

IST = ZoneInfo("Asia/Kolkata")
DEFAULT_USAGE_WINDOW = timedelta(days=30)

RUN_ROLLUP_SQL = """
SELECT provider, model, stage,
       count(*) AS attempts,
       count(*) FILTER (WHERE attempt_ordinal > 1) AS retries_or_fallbacks,
       sum(input_tokens) AS input_tokens,
       sum(output_tokens) AS output_tokens,
       count(*) FILTER (WHERE usage_status = 'unknown') AS unknown_usage,
       sum(latency_ms) AS total_latency_ms,
       sum(estimated_cost_usd) AS estimated_cost_usd,
       count(*) FILTER (WHERE cost_status = 'unknown') AS unknown_cost
FROM inference_attempts
WHERE tenant_id = :tenant_id AND detection_run_id = :run_id
GROUP BY provider, model, stage
ORDER BY provider, model, stage
"""


class InferenceLedgerError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def record_attempts(db: Session, tenant_id: str, attempts: list[InferenceAttemptIn]) -> dict[str, int]:
    ids = [item.attempt_id for item in attempts]
    if len(ids) != len(set(ids)):
        raise InferenceLedgerError("duplicate_attempt_ids")
    for item in attempts:
        if item.tenant_id is not None and item.tenant_id != tenant_id:
            raise InferenceLedgerError("cross_tenant")
    existing = {
        row.attempt_id: row
        for row in db.scalars(
            select(InferenceAttempt).where(
                InferenceAttempt.tenant_id == tenant_id,
                InferenceAttempt.attempt_id.in_(ids),
            )
        ).all()
    } if ids else {}
    for item in attempts:
        row = existing.get(item.attempt_id)
        if row is not None and row.status in FINAL_ATTEMPT_STATUSES and item.status == "pending":
            raise InferenceLedgerError("finalized_pending_demotion")
    inserted = 0
    replayed = 0
    for item in attempts:
        row = existing.get(item.attempt_id)
        if row is not None:
            # First-write-wins once finalized: later flushes ACK as replayed and do not rewrite tokens.
            if row.status == "pending" and item.status in FINAL_ATTEMPT_STATUSES:
                _apply(row, item)
            replayed += 1
            continue
        created = InferenceAttempt(id=uuid.uuid4(), tenant_id=tenant_id, attempt_id=item.attempt_id,
                                   logical_operation_id=item.logical_operation_id, attempt_ordinal=item.attempt_ordinal,
                                   status=item.status)
        _apply(created, item)
        db.add(created)
        inserted += 1
    db.flush()
    return {"inserted": inserted, "replayed": replayed}


def _apply(row: InferenceAttempt, item: InferenceAttemptIn) -> None:
    started = _aware(item.started_at)
    rate = rate_for(item.provider, item.model, started.date())
    cost, cost_status = estimate_cost(rate, item.input_tokens, item.cached_input_tokens, item.output_tokens)
    row.logical_operation_id = item.logical_operation_id
    row.attempt_ordinal = item.attempt_ordinal
    row.conversation_id = item.conversation_id
    row.detection_run_id = item.detection_run_id
    row.job_id = item.job_id
    row.stage = item.stage
    row.route_version = item.route_version
    row.provider = item.provider
    row.model = item.model
    row.prompt_version = item.prompt_version
    row.status = item.status
    row.error_category = item.error_category
    row.http_status = item.http_status
    row.provider_request_id = item.provider_request_id
    row.usage_status = item.usage_status
    row.input_tokens = item.input_tokens if item.usage_status != "unknown" else None
    row.cached_input_tokens = item.cached_input_tokens if item.usage_status != "unknown" else None
    row.output_tokens = item.output_tokens if item.usage_status != "unknown" else None
    row.reasoning_tokens = item.reasoning_tokens if item.usage_status != "unknown" else None
    row.latency_ms = item.latency_ms
    row.started_at = started
    row.finished_at = _aware(item.finished_at) if item.finished_at else None
    row.rate_version = rate.version if rate is not None and cost_status != "unknown" else None
    row.estimated_cost_usd = cost
    row.cost_status = cost_status


def run_usage_groups(db: Session, tenant_id: str, detection_run_id: str) -> list[InferenceUsageGroup]:
    """Cookbook §13.3 rollup in SQL so a single run cannot load every ledger row."""
    rows = db.execute(
        text(RUN_ROLLUP_SQL),
        {"tenant_id": tenant_id, "run_id": detection_run_id},
    ).mappings().all()
    return [
        InferenceUsageGroup(
            provider=row["provider"],
            model=row["model"],
            stage=row["stage"],
            detection_run_id=detection_run_id,
            attempts=int(row["attempts"] or 0),
            retries_or_fallbacks=int(row["retries_or_fallbacks"] or 0),
            input_tokens=int(row["input_tokens"]) if row["input_tokens"] is not None else None,
            output_tokens=int(row["output_tokens"]) if row["output_tokens"] is not None else None,
            unknown_usage=int(row["unknown_usage"] or 0),
            total_latency_ms=int(row["total_latency_ms"]) if row["total_latency_ms"] is not None else None,
            estimated_cost_usd=str(row["estimated_cost_usd"]) if row["estimated_cost_usd"] is not None else None,
            unknown_cost=int(row["unknown_cost"] or 0),
        )
        for row in rows
    ]


def usage_groups(
    db: Session,
    tenant_id: str,
    *,
    group_by: str,
    started_from: datetime | None,
    started_to: datetime | None,
    detection_run_id: str | None = None,
) -> list[InferenceUsageGroup]:
    if detection_run_id is not None and group_by == "run":
        return run_usage_groups(db, tenant_id, detection_run_id)
    # Unbounded tenant scans are refused; default the last 30 days when callers omit bounds.
    if started_from is None and started_to is None and detection_run_id is None:
        started_from = datetime.now(timezone.utc) - DEFAULT_USAGE_WINDOW
    stmt = select(InferenceAttempt).where(InferenceAttempt.tenant_id == tenant_id)
    if started_from is not None:
        stmt = stmt.where(InferenceAttempt.started_at >= _aware(started_from))
    if started_to is not None:
        stmt = stmt.where(InferenceAttempt.started_at < _aware(started_to))
    if detection_run_id is not None:
        stmt = stmt.where(InferenceAttempt.detection_run_id == detection_run_id)
    buckets: dict[tuple, list[InferenceAttempt]] = {}
    for row in db.scalars(stmt).all():
        buckets.setdefault(_key(row, group_by), []).append(row)
    return [_group(key, rows, group_by) for key, rows in sorted(buckets.items(), key=lambda item: item[0])]


def assert_no_text_columns() -> None:
    banned = {"content", "transcript", "quote", "evidence", "summary", "message", "text", "prompt", "body"}
    assert LEDGER_COLUMNS.isdisjoint(banned)
    assert "prompt_version" in LEDGER_COLUMNS


def _key(row: InferenceAttempt, group_by: str) -> tuple:
    if group_by == "day":
        started = row.started_at if row.started_at.tzinfo else row.started_at.replace(tzinfo=timezone.utc)
        return (started.astimezone(IST).date().isoformat(),)
    if group_by == "model":
        return (row.provider, row.model)
    if group_by == "stage":
        return (row.stage,)
    if group_by == "run":
        return (row.detection_run_id or "", row.provider, row.model, row.stage)
    return (row.provider, row.model, row.stage)


def _group(key: tuple, rows: list[InferenceAttempt], group_by: str) -> InferenceUsageGroup:
    reported_in = [row.input_tokens for row in rows if row.usage_status != "unknown" and row.input_tokens is not None]
    reported_out = [row.output_tokens for row in rows if row.usage_status != "unknown" and row.output_tokens is not None]
    costs = [row.estimated_cost_usd for row in rows if row.cost_status != "unknown" and row.estimated_cost_usd is not None]
    latencies = [row.latency_ms for row in rows if row.latency_ms is not None]
    provider = model = stage = run_id = day = None
    if group_by == "day":
        day = key[0]
    elif group_by == "model":
        provider, model = key
    elif group_by == "stage":
        stage = key[0]
    elif group_by == "run":
        run_id, provider, model, stage = key
    else:
        provider, model, stage = key
    return InferenceUsageGroup(
        provider=provider,
        model=model,
        stage=stage,
        detection_run_id=run_id,
        day=day,
        attempts=len(rows),
        retries_or_fallbacks=sum(1 for row in rows if row.attempt_ordinal > 1),
        input_tokens=sum(reported_in) if reported_in else None,
        output_tokens=sum(reported_out) if reported_out else None,
        unknown_usage=sum(1 for row in rows if row.usage_status == "unknown"),
        total_latency_ms=sum(latencies) if latencies else None,
        estimated_cost_usd=str(sum(costs)) if costs else None,
        unknown_cost=sum(1 for row in rows if row.cost_status == "unknown"),
    )


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
