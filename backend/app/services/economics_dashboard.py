"""Tenant-scoped economics aggregation over canonical, text-free tables."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.detection_run import DetectionRun
from app.models.inference_attempt import InferenceAttempt
from app.models.job import Job
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.schemas.economics_dashboard import (
    CostProjection,
    DashboardAlert,
    EconomicsDashboardResponse,
    EconomicsPanel,
    FunnelPanel,
    QualityByType,
    QualityPanel,
    ReliabilityPanel,
    UnavailableMetric,
)

IST = ZoneInfo("Asia/Kolkata")
ZERO = Decimal("0")
MONEY = Decimal("0.00000001")
POSITIVE_OUTCOMES = {"retained", "converted"}


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator > 0 else None


def _percentile(values: list[int], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return float(ordered[lower] + (ordered[upper] - ordered[lower]) * fraction)


def _cost_per(cost: Decimal, denominator: int) -> Decimal | None:
    if denominator <= 0:
        return None
    return (cost / Decimal(denominator)).quantize(MONEY, rounding=ROUND_HALF_UP)


def _unavailable(reason: str) -> UnavailableMetric:
    return UnavailableMetric(reason=reason)


def _alerts(*, attempts: list[InferenceAttempt], jobs: list[Job], predictions: list[SignalPrediction], now: datetime, spend_anomaly: bool | None) -> list[DashboardAlert]:
    unknown = sum(a.usage_status == "unknown" or a.cost_status == "unknown" for a in attempts)
    old_pending = sum(a.status == "pending" and now - _utc(a.started_at) > timedelta(minutes=15) for a in attempts)
    dead = sum(j.status == "dead_lettered" for j in jobs)
    queued = [j for j in jobs if j.status in {"queued", "leased"}]
    old_queue = any(now - _utc(j.created_at) > timedelta(minutes=15) for j in queued)
    bursts = sum(a.http_status == 429 for a in attempts)
    invalid = sum(p.evidence_status in {"unresolved", "stale"} for p in predictions)
    rows = [
        DashboardAlert(key="unknown_usage", label="Unknown usage or cost", status="warning" if unknown else "ok", owner="AI Platform", runbook="Reconcile provider receipts and preserve NULL unknowns.", detail=f"{unknown} attempt(s) have unknown usage or cost."),
        DashboardAlert(key="unfinished_attempts", label="Unfinished attempts", status="alert" if old_pending else "ok", owner="Backend", runbook="Inspect pending ledger rows older than 15 minutes before retrying work.", detail=f"{old_pending} pending attempt(s) are older than 15 minutes."),
        DashboardAlert(key="queue_age", label="Queue age", status="alert" if old_queue else "ok", owner="Worker", runbook="Check worker health, leases, and tenant rotation; do not replay blindly.", detail="The oldest queued or leased job exceeds 15 minutes." if old_queue else "No queued or leased job exceeds 15 minutes."),
        DashboardAlert(key="dead_letters", label="Dead-lettered jobs", status="alert" if dead else "ok", owner="Worker", runbook="Inspect bounded error categories and resume only after the cause is fixed.", detail=f"{dead} job(s) are dead-lettered."),
        DashboardAlert(key="http_429", label="Provider 429 responses", status="alert" if bursts else "ok", owner="AI Platform", runbook="Pause or reduce concurrency and verify Retry-After handling.", detail=f"{bursts} provider attempt(s) returned 429."),
        DashboardAlert(key="invalid_evidence", label="Invalid evidence", status="warning" if invalid else "ok", owner="Trust", runbook="Quarantine stale or unresolved evidence and reconstruct from persisted source.", detail=f"{invalid} active signal(s) have stale or unresolved evidence."),
        DashboardAlert(key="spend_anomaly", label="Spend anomaly", status="alert" if spend_anomaly else ("ok" if spend_anomaly is False else "unavailable"), owner="AI Economics", runbook="Compare route, retries, cache usage, and measured daily cost per processed conversation.", detail="Latest populated IST day exceeds 2× the preceding median." if spend_anomaly else ("Latest populated IST day is within the threshold." if spend_anomaly is False else "At least three preceding populated days are required.")),
    ]
    unavailable = {
        "ledger_flush_failures": ("AI Platform", "Add durable flush telemetry before alerting."),
        "reservation_drift": ("AI Economics", "Reconcile reservations outside this five-table dashboard boundary."),
        "database_latency": ("Backend", "Add durable database latency telemetry before alerting."),
        "connector_errors": ("Integrations", "Add canonical connector attempt telemetry before alerting."),
    }
    rows.extend(DashboardAlert(key=key, label=key.replace("_", " ").title(), status="unavailable", owner=owner, runbook=runbook, detail="The approved canonical source tables do not contain this telemetry.") for key, (owner, runbook) in unavailable.items())
    return rows


def build_economics_dashboard(db: Session, *, tenant_id: str, from_ts: datetime, to_ts: datetime, now: datetime | None = None) -> EconomicsDashboardResponse:
    """Aggregate one tenant and half-open UTC window; never selects text columns."""
    start, end = _utc(from_ts), _utc(to_ts)
    current = _utc(now or datetime.now(timezone.utc))
    if start >= end:
        raise ValueError("invalid_window")
    if end - start > timedelta(days=366):
        raise ValueError("window_too_large")

    # Select only metric-bearing columns. In particular, do not load detection
    # output, signal summaries/evidence, feedback notes, or job error text into
    # the dashboard process even though none of them are serialized.
    attempts = list(db.execute(select(
        InferenceAttempt.status,
        InferenceAttempt.http_status,
        InferenceAttempt.usage_status,
        InferenceAttempt.input_tokens,
        InferenceAttempt.cached_input_tokens,
        InferenceAttempt.output_tokens,
        InferenceAttempt.latency_ms,
        InferenceAttempt.started_at,
        InferenceAttempt.attempt_ordinal,
        InferenceAttempt.estimated_cost_usd,
        InferenceAttempt.cost_status,
    ).where(InferenceAttempt.tenant_id == tenant_id, InferenceAttempt.started_at >= start, InferenceAttempt.started_at < end)).all())
    runs = list(db.execute(select(
        DetectionRun.run_id,
        DetectionRun.conversation_id,
        DetectionRun.status,
        DetectionRun.created_at,
    ).where(DetectionRun.tenant_id == tenant_id, DetectionRun.created_at >= start, DetectionRun.created_at < end)).all())
    predictions = list(db.execute(select(
        SignalPrediction.id,
        SignalPrediction.detection_run_id,
        SignalPrediction.signal_type,
        SignalPrediction.evidence_status,
        SignalPrediction.acted,
        SignalPrediction.outcome,
        SignalPrediction.outcome_value_inr,
        SignalPrediction.created_at,
    ).where(SignalPrediction.tenant_id == tenant_id, SignalPrediction.active.is_(True), SignalPrediction.created_at >= start, SignalPrediction.created_at < end)).all())
    feedback = list(db.execute(select(
        SignalFeedback.signal_id,
        SignalFeedback.feedback,
        SignalFeedback.reviewed_at,
    ).where(SignalFeedback.tenant_id == tenant_id, SignalFeedback.reviewed_at >= start, SignalFeedback.reviewed_at < end)).all())
    jobs = list(db.execute(select(
        Job.job_type,
        Job.status,
        Job.attempt_count,
        Job.conversation_count,
        Job.created_at,
    ).where(Job.tenant_id == tenant_id, Job.created_at >= start, Job.created_at < end)).all())

    ingested = sum(j.conversation_count for j in jobs if j.job_type == "upload")
    completed_runs = [r for r in runs if r.status in {"complete", "completed", "succeeded"}]
    processed = len({r.conversation_id for r in completed_runs})
    surfaced = len(predictions)
    prediction_by_id = {p.id: p for p in predictions}
    scoped_feedback = [f for f in feedback if f.signal_id in prediction_by_id]
    reviewed = len(scoped_feedback)
    correct = sum(f.feedback == "correct" for f in scoped_feedback)
    incorrect = sum(f.feedback == "incorrect" for f in scoped_feedback)
    partial = sum(f.feedback == "partially_correct" for f in scoped_feedback)
    acted = sum(p.acted for p in predictions)
    positive = sum(p.outcome in POSITIVE_OUTCOMES for p in predictions)
    influenced = sum((Decimal(str(p.outcome_value_inr)) for p in predictions if p.outcome in POSITIVE_OUTCOMES and p.outcome_value_inr is not None), ZERO)

    type_counts: dict[str, Counter] = defaultdict(Counter)
    for item in scoped_feedback:
        type_counts[prediction_by_id[item.signal_id].signal_type][item.feedback] += 1
    by_type = []
    for signal_type, counts in sorted(type_counts.items()):
        total = sum(counts.values())
        by_type.append(QualityByType(signal_type=signal_type, reviewed=total, correct=counts["correct"], acceptance_rate=_ratio(counts["correct"], total)))
    evidence_valid = sum(p.evidence_status == "valid" for p in predictions)
    evidence_unresolved = sum(p.evidence_status == "unresolved" for p in predictions)
    evidence_stale = sum(p.evidence_status == "stale" for p in predictions)
    evidence_measured = evidence_valid + evidence_unresolved + evidence_stale
    surfaced_runs = {p.detection_run_id for p in predictions if p.detection_run_id}
    abstained = sum(r.run_id not in surfaced_runs for r in completed_runs)

    attempt_status = Counter(a.status for a in attempts)
    job_status = Counter(j.status for j in jobs)
    queued = [j for j in jobs if j.status in {"queued", "leased"}]
    oldest_age = max((int((current - _utc(j.created_at)).total_seconds()) for j in queued), default=None)
    retry_count = sum(a.attempt_ordinal > 1 for a in attempts)
    error_count = sum(a.status in {"failed", "timeout", "cancelled"} for a in attempts)
    latencies = [a.latency_ms for a in attempts if a.latency_ms is not None and a.latency_ms >= 0]

    unknown_usage = sum(a.usage_status == "unknown" for a in attempts)
    unknown_cost = sum(a.cost_status == "unknown" or a.estimated_cost_usd is None for a in attempts)
    known = [a for a in attempts if a.cost_status != "unknown" and a.estimated_cost_usd is not None]
    estimated = sum((Decimal(a.estimated_cost_usd) for a in known if a.cost_status == "estimated"), ZERO)
    reconciled = sum((Decimal(a.estimated_cost_usd) for a in known if a.cost_status == "reconciled"), ZERO)
    known_cost = estimated + reconciled
    base_cost = _cost_per(known_cost, processed)
    projections = [CostProjection(conversations=volume, estimated_cost_usd=(base_cost * volume).quantize(MONEY) if base_cost is not None else None, status="available" if base_cost is not None else "unavailable", incomplete=unknown_cost > 0) for volume in (10_000, 50_000, 100_000)]

    daily_cost: dict[object, Decimal] = defaultdict(lambda: ZERO)
    daily_processed: Counter = Counter()
    for a in known:
        daily_cost[_utc(a.started_at).astimezone(IST).date()] += Decimal(a.estimated_cost_usd or ZERO)
    for r in completed_runs:
        daily_processed[_utc(r.created_at).astimezone(IST).date()] += 1
    daily_rates = [(day, daily_cost[day] / count) for day, count in daily_processed.items() if count and day in daily_cost]
    daily_rates.sort()
    spend_anomaly: bool | None = None
    if len(daily_rates) >= 4:
        history = [float(rate) for _, rate in daily_rates[:-1]]
        spend_anomaly = float(daily_rates[-1][1]) > 2 * median(history)

    unavailable_reason = "Not derivable from the five approved canonical tables."
    funnel = FunnelPanel(ingested=ingested, processed=processed, surfaced=surfaced, reviewed=reviewed, correct=correct, acted=acted, positive_outcomes=positive, influenced_value_inr=influenced, denominators={
        "ingested": None, "processed": ingested, "surfaced": processed,
        "reviewed": surfaced, "correct": reviewed, "acted": surfaced,
        "positive_outcomes": acted, "influenced_value_inr": positive,
    }, definitions={
        "ingested": "Sum of upload-job conversation_count by job created_at.", "processed": "Distinct conversations with a completed detection run by run created_at.", "surfaced": "Active predictions by prediction created_at.", "reviewed": "Feedback within the window joined to surfaced predictions.", "correct": "Canonical correct feedback in reviewed.", "acted": "Surfaced predictions marked acted.", "positive_outcomes": "Surfaced predictions with retained or converted outcome.", "influenced_value_inr": "Customer-recorded value for positive outcomes; not incremental revenue.",
    })
    quality = QualityPanel(signal_score=_ratio(correct, reviewed), reviewed=reviewed, correct=correct, incorrect=incorrect, partially_correct=partial, false_positive_rate=_ratio(incorrect, reviewed), evidence_valid=evidence_valid, evidence_unresolved=evidence_unresolved, evidence_stale=evidence_stale, evidence_failure_rate=_ratio(evidence_unresolved + evidence_stale, evidence_measured), abstained=abstained, abstention_rate=_ratio(abstained, len(completed_runs)), by_signal_type=by_type, gold_set_precision=_unavailable(unavailable_reason), gold_set_recall=_unavailable(unavailable_reason), calibration=_unavailable(unavailable_reason))
    reliability = ReliabilityPanel(jobs_by_status=dict(job_status), recovered_jobs=sum(j.attempt_count > 1 for j in jobs), queue_depth=len(queued), oldest_queue_age_seconds=oldest_age, attempts_by_status=dict(attempt_status), retry_or_fallback_attempts=retry_count, retry_rate=_ratio(retry_count, len(attempts)), http_429_attempts=sum(a.http_status == 429 for a in attempts), error_rate=_ratio(error_count, len(attempts)), unfinished_attempts=attempt_status["pending"], p50_latency_ms=_percentile(latencies, .5), p95_latency_ms=_percentile(latencies, .95), ledger_flush_failures=_unavailable(unavailable_reason), reservation_drift=_unavailable(unavailable_reason), database_latency=_unavailable(unavailable_reason), connector_errors=_unavailable(unavailable_reason))
    economics = EconomicsPanel(attempts=len(attempts), input_tokens=sum(a.input_tokens or 0 for a in attempts if a.usage_status != "unknown"), cached_input_tokens=sum(a.cached_input_tokens or 0 for a in attempts if a.usage_status != "unknown"), output_tokens=sum(a.output_tokens or 0 for a in attempts if a.usage_status != "unknown"), unknown_usage_count=unknown_usage, unknown_usage_rate=_ratio(unknown_usage, len(attempts)), unknown_cost_count=unknown_cost, unknown_cost_rate=_ratio(unknown_cost, len(attempts)), known_cost_coverage=_ratio(len(known), len(attempts)), estimated_cost_usd=estimated, reconciled_cost_usd=reconciled, known_cost_usd=known_cost, cost_per_processed_conversation_usd=base_cost, cost_per_surfaced_signal_usd=_cost_per(known_cost, surfaced), cost_per_correct_signal_usd=_cost_per(known_cost, correct), cost_per_acted_signal_usd=_cost_per(known_cost, acted), projections=projections)
    return EconomicsDashboardResponse(tenant_id=tenant_id, from_ts=start, to_ts=end, funnel=funnel, quality=quality, reliability=reliability, economics=economics, alerts=_alerts(attempts=attempts, jobs=jobs, predictions=predictions, now=current, spend_anomaly=spend_anomaly))
