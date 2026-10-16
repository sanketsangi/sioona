"""Persist and aggregate inference attempts. Never stores prompt or transcript text."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.inference_attempt import (
    FINALIZED_INFERENCE_STATUSES,
    InferenceAttempt,
)
from app.schemas.inference_attempt import (
    DetectionRunInferenceResponse,
    GroupBy,
    InferenceAttemptBatchResult,
    InferenceAttemptIn,
    InferenceAttemptOut,
    InferenceUsageBucket,
    InferenceUsageResponse,
)
from app.services.inference_rates import estimate_cost, lookup_rate


class InferenceLedgerError(ValueError):
    """Base error for ledger writes."""


class CrossTenantAttemptError(InferenceLedgerError):
    """A batch row targeted a different tenant than the route."""


class FinalizedRevertError(InferenceLedgerError):
    """A finalized row must not revert to pending."""


def _cost_fields(row: InferenceAttemptIn) -> tuple[str | None, Decimal | None, str]:
    if row.usage_status != "reported":
        return None, None, "unknown"
    rate = lookup_rate(row.provider, row.model, at=row.started_at.date())
    cost, status = estimate_cost(
        rate,
        row.input_tokens,
        row.cached_input_tokens,
        row.output_tokens,
    )
    return (rate.version if rate and status == "estimated" else None), cost, status


def _apply_payload(row: InferenceAttempt, payload: InferenceAttemptIn) -> None:
    rate_version, estimated_cost, cost_status = _cost_fields(payload)
    row.logical_operation_id = payload.logical_operation_id
    row.attempt_ordinal = payload.attempt_ordinal
    row.conversation_id = payload.conversation_id
    row.detection_run_id = payload.detection_run_id
    row.job_id = payload.job_id
    row.stage = payload.stage
    row.route_version = payload.route_version
    row.provider = payload.provider
    row.model = payload.model
    row.prompt_version = payload.prompt_version
    row.cache_hit = payload.cache_hit
    row.status = payload.status
    row.error_category = payload.error_category
    row.http_status = payload.http_status
    row.provider_request_id = payload.provider_request_id
    row.usage_status = payload.usage_status
    row.input_tokens = payload.input_tokens
    row.cached_input_tokens = payload.cached_input_tokens
    row.output_tokens = payload.output_tokens
    row.reasoning_tokens = payload.reasoning_tokens
    row.latency_ms = payload.latency_ms
    row.started_at = payload.started_at
    row.finished_at = payload.finished_at
    row.rate_version = rate_version
    row.estimated_cost_usd = estimated_cost
    row.cost_status = cost_status


def upsert_inference_attempts(
    db: Session,
    *,
    tenant_id: str,
    attempts: list[InferenceAttemptIn],
) -> InferenceAttemptBatchResult:
    """Idempotent batch upsert on (tenant_id, attempt_id).

    Replay of an identical finalized row is a no-op. A finalized row never
    reverts to pending. Cross-tenant rows reject the whole batch.
    """
    if any(item.tenant_id != tenant_id for item in attempts):
        raise CrossTenantAttemptError("cross_tenant_attempt")

    attempt_ids = [item.attempt_id for item in attempts]
    existing = {
        row.attempt_id: row
        for row in db.scalars(
            select(InferenceAttempt).where(
                InferenceAttempt.tenant_id == tenant_id,
                InferenceAttempt.attempt_id.in_(attempt_ids),
            )
        ).all()
    }

    inserted = 0
    unchanged = 0
    results: list[InferenceAttempt] = []

    for payload in attempts:
        current = existing.get(payload.attempt_id)
        if current is None:
            row = InferenceAttempt(tenant_id=tenant_id, attempt_id=payload.attempt_id)
            _apply_payload(row, payload)
            db.add(row)
            existing[payload.attempt_id] = row
            inserted += 1
            results.append(row)
            continue

        if (
            current.status in FINALIZED_INFERENCE_STATUSES
            and payload.status == "pending"
        ):
            raise FinalizedRevertError("finalized_cannot_revert_to_pending")

        if current.status in FINALIZED_INFERENCE_STATUSES:
            # Replay of a finalized row is a no-op (idempotent).
            unchanged += 1
            results.append(current)
            continue

        _apply_payload(current, payload)
        results.append(current)

    db.flush()
    return InferenceAttemptBatchResult(
        accepted=len(attempts),
        inserted=inserted,
        unchanged=unchanged,
        attempts=[InferenceAttemptOut.model_validate(row) for row in results],
    )


def _status_counts(rows: list[InferenceAttempt]) -> dict[str, int]:
    counts = {
        "attempts": len(rows),
        "cache_hits": sum(bool(row.cache_hit) for row in rows),
        "succeeded": 0,
        "failed": 0,
        "timeout": 0,
        "cancelled": 0,
        "pending": 0,
    }
    for row in rows:
        if row.status in counts:
            counts[row.status] += 1
    return counts


def _usage_totals(rows: list[InferenceAttempt]) -> dict[str, int | Decimal | None]:
    reported_input = 0
    reported_output = 0
    has_reported = False
    unknown_usage = 0
    estimated_cost = Decimal("0")
    has_estimated = False
    unknown_cost = 0
    for row in rows:
        if row.usage_status == "reported":
            has_reported = True
            reported_input += int(row.input_tokens or 0)
            reported_output += int(row.output_tokens or 0)
        else:
            unknown_usage += 1
        if row.cost_status in {"estimated", "reconciled"} and row.estimated_cost_usd is not None:
            has_estimated = True
            estimated_cost += Decimal(row.estimated_cost_usd)
        else:
            unknown_cost += 1
    return {
        "reported_input_tokens": reported_input if has_reported else None,
        "reported_output_tokens": reported_output if has_reported else None,
        "unknown_usage_count": unknown_usage,
        "estimated_cost_usd": estimated_cost if has_estimated else None,
        "unknown_cost_count": unknown_cost,
    }


def _bucket_key(row: InferenceAttempt, group_by: GroupBy) -> str:
    if group_by == "day":
        return row.started_at.astimezone().date().isoformat()
    if group_by == "model":
        return f"{row.provider}:{row.model}"
    if group_by == "stage":
        return row.stage
    return row.detection_run_id or "none"


def query_inference_usage(
    db: Session,
    *,
    tenant_id: str,
    from_ts: datetime,
    to_ts: datetime,
    group_by: GroupBy,
) -> InferenceUsageResponse:
    rows = list(
        db.scalars(
            select(InferenceAttempt)
            .where(
                InferenceAttempt.tenant_id == tenant_id,
                InferenceAttempt.started_at >= from_ts,
                InferenceAttempt.started_at < to_ts,
            )
            .order_by(InferenceAttempt.started_at, InferenceAttempt.attempt_id)
        ).all()
    )
    buckets: dict[str, list[InferenceAttempt]] = {}
    for row in rows:
        buckets.setdefault(_bucket_key(row, group_by), []).append(row)

    out: list[InferenceUsageBucket] = []
    for key in sorted(buckets):
        group = buckets[key]
        counts = _status_counts(group)
        totals = _usage_totals(group)
        out.append(
            InferenceUsageBucket(
                key=key,
                attempts=counts["attempts"],
                cache_hits=counts["cache_hits"],
                succeeded=counts["succeeded"],
                failed=counts["failed"],
                timeout=counts["timeout"],
                cancelled=counts["cancelled"],
                pending=counts["pending"],
                reported_input_tokens=totals["reported_input_tokens"],  # type: ignore[arg-type]
                reported_output_tokens=totals["reported_output_tokens"],  # type: ignore[arg-type]
                unknown_usage_count=int(totals["unknown_usage_count"] or 0),
                estimated_cost_usd=totals["estimated_cost_usd"],  # type: ignore[arg-type]
                unknown_cost_count=int(totals["unknown_cost_count"] or 0),
            )
        )
    return InferenceUsageResponse.model_validate(
        {
            "tenant_id": tenant_id,
            "group_by": group_by,
            "from": from_ts,
            "to": to_ts,
            "buckets": out,
        }
    )


def query_detection_run_inference(
    db: Session,
    *,
    tenant_id: str,
    detection_run_id: str,
) -> DetectionRunInferenceResponse:
    rows = list(
        db.scalars(
            select(InferenceAttempt)
            .where(
                InferenceAttempt.tenant_id == tenant_id,
                InferenceAttempt.detection_run_id == detection_run_id,
            )
            .order_by(InferenceAttempt.attempt_ordinal, InferenceAttempt.attempt_id)
        ).all()
    )
    counts = _status_counts(rows)
    totals = _usage_totals(rows)
    return DetectionRunInferenceResponse(
        tenant_id=tenant_id,
        detection_run_id=detection_run_id,
        attempts=counts["attempts"],
        cache_hits=counts["cache_hits"],
        succeeded=counts["succeeded"],
        failed=counts["failed"],
        timeout=counts["timeout"],
        cancelled=counts["cancelled"],
        pending=counts["pending"],
        reported_input_tokens=totals["reported_input_tokens"],  # type: ignore[arg-type]
        reported_output_tokens=totals["reported_output_tokens"],  # type: ignore[arg-type]
        unknown_usage_count=int(totals["unknown_usage_count"] or 0),
        estimated_cost_usd=totals["estimated_cost_usd"],  # type: ignore[arg-type]
        unknown_cost_count=int(totals["unknown_cost_count"] or 0),
        rows=[InferenceAttemptOut.model_validate(row) for row in rows],
    )


def ledger_is_reachable(db: Session, tenant_id: str | None = None) -> bool:
    """Cheap readiness probe used by the web preflight before LLM calls."""
    if tenant_id is None:
        db.execute(text("SELECT 1"))
        return True
    from time import perf_counter
    from app.services.operational_telemetry import record_sample
    started = perf_counter()
    db.execute(select(InferenceAttempt.attempt_id).where(InferenceAttempt.tenant_id == tenant_id).limit(1)).first()
    elapsed = min(3600000, max(0, (perf_counter() - started) * 1000))
    record_sample(db, tenant_id, "database_query", duration_ms=elapsed)
    db.commit()
    return True
