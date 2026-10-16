"""Tenant-scoped economics aggregation over canonical, text-free tables."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from statistics import median
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, union_all
from sqlalchemy.orm import Session

from app.models.detection_run import DetectionRun
from app.models.inference_attempt import InferenceAttempt
from app.models.job import Job
from app.models.inference_budget import InferenceBudget, InferenceReservation
from app.models.live_ingest import LiveEvent
from app.models.supervised_action import ActionExecution
from app.models.operational_telemetry import OperationalSample
from app.models.signal_feedback import SignalFeedback
from app.models.signal_prediction import SignalPrediction
from app.schemas.economics_dashboard import (
    CostProjection,
    MeasuredMetric,
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


def _alerts(*, attempts: list[InferenceAttempt], pending_attempts: list[InferenceAttempt], jobs: list[Job], live_jobs: list[Job], predictions: list[SignalPrediction], now: datetime, spend_anomaly: bool | None, telemetry: dict) -> list[DashboardAlert]:
    unknown = sum(a.usage_status == "unknown" or a.cost_status == "unknown" for a in attempts)
    old_pending = sum(now - _utc(a.started_at) > timedelta(minutes=15) for a in pending_attempts)
    dead = sum(j.status == "dead_lettered" for j in jobs)
    old_queue = any(now - _utc(j.created_at) > timedelta(minutes=15) for j in live_jobs)
    bursts = sum(a.http_status == 429 for a in attempts)
    invalid = sum(p.evidence_status in {"unresolved", "stale"} for p in predictions)
    rows = [
        DashboardAlert(key="unknown_usage", label="Unknown usage or cost", status="warning" if unknown else "ok", owner="Sanket", runbook="Reconcile provider receipts and preserve NULL unknowns.", detail=f"{unknown} attempt(s) have unknown usage or cost."),
        DashboardAlert(key="unfinished_attempts", label="Unfinished attempts", status="alert" if old_pending else "ok", owner="Sanket", runbook="Inspect pending ledger rows older than 15 minutes before retrying work.", detail=f"{old_pending} pending attempt(s) are older than 15 minutes."),
        DashboardAlert(key="queue_age", label="Queue age", status="alert" if old_queue else "ok", owner="Sanket", runbook="Check worker health, leases, and tenant rotation; do not replay blindly.", detail="The oldest queued or leased job exceeds 15 minutes." if old_queue else "No queued or leased job exceeds 15 minutes."),
        DashboardAlert(key="dead_letters", label="Dead-lettered jobs", status="alert" if dead else "ok", owner="Sanket", runbook="Inspect bounded error categories and resume only after the cause is fixed.", detail=f"{dead} job(s) are dead-lettered."),
        DashboardAlert(key="http_429", label="Provider 429 responses", status="alert" if bursts else "ok", owner="Sanket", runbook="Pause or reduce concurrency and verify Retry-After handling.", detail=f"{bursts} provider attempt(s) returned 429."),
        DashboardAlert(key="invalid_evidence", label="Invalid evidence", status="warning" if invalid else "ok", owner="Sanket", runbook="Quarantine stale or unresolved evidence and reconstruct from persisted source.", detail=f"{invalid} active signal(s) have stale or unresolved evidence."),
        DashboardAlert(key="spend_anomaly", label="Spend anomaly", status="alert" if spend_anomaly else ("ok" if spend_anomaly is False else "unavailable"), owner="Sanket", runbook="Compare route, retries, cache usage, and measured daily cost per processed conversation.", detail="Latest populated IST day exceeds 2× the preceding median." if spend_anomaly else ("Latest populated IST day is within the threshold." if spend_anomaly is False else "At least three preceding populated days are required.")),
    ]
    runbooks = {
        "ledger_flush_failures": "Reconcile pending attempts and restore ledger delivery; missing receipts during a DB outage are not zero failures.",
        "reservation_drift": "Compare daily reserved USD with authorized reservations; never refund ambiguous attempts automatically.",
        "database_latency": "Inspect ledger preflight query timing and database health; this is not whole-database APM.",
        "connector_errors": "Inspect live event dead letters and failed/unknown external actions; reconcile unknown writes without retry.",
    }
    for key, metric in telemetry.items():
        threshold = 500 if key == "database_latency" else 0
        status = "unavailable" if metric.status == "unavailable" else ("alert" if metric.value > threshold else "ok")
        rows.append(DashboardAlert(key=key, label=key.replace("_", " ").title(), status=status, owner="Sanket", runbook=runbooks[key], detail=metric.reason))
    return rows


def _operational_metrics(db, tenant_id, start, end):
    counter = OperationalSample
    totals = db.execute(select(
        counter.kind, func.count().label("samples"), func.avg(counter.duration_ms).label("mean_ms"),
    ).where(counter.tenant_id == tenant_id, counter.observed_at >= start, counter.observed_at < end).group_by(counter.kind)).all()
    by_kind = {row.kind: row for row in totals}
    failures = by_kind.get("ledger_flush_failure")
    timing = by_kind.get("database_query")
    # Snapshot across all retained budget days (not a historical window): an
    # authorized reservation may predate this report. Settled rows do not count.
    budgets = select(InferenceBudget.budget_day.label("day"), InferenceBudget.reserved_usd.label("amount")).where(InferenceBudget.tenant_id == tenant_id)
    reservations = select(InferenceReservation.budget_day.label("day"), (-InferenceReservation.reserved_usd).label("amount")).where(InferenceReservation.tenant_id == tenant_id, InferenceReservation.status == "authorized")
    entries = union_all(budgets, reservations).subquery()
    drift_days = select(func.sum(entries.c.amount).label("delta")).group_by(entries.c.day).subquery()
    drift, days = db.execute(select(func.coalesce(func.sum(func.abs(drift_days.c.delta)), 0), func.count()).select_from(drift_days)).one()
    events = db.scalar(select(func.count()).select_from(LiveEvent).where(LiveEvent.tenant_id == tenant_id, LiveEvent.state == "dead_lettered", LiveEvent.received_at >= start, LiveEvent.received_at < end)) or 0
    actions = db.scalar(select(func.count()).select_from(ActionExecution).where(ActionExecution.tenant_id == tenant_id, ActionExecution.state.in_(("failed", "unknown")), ActionExecution.created_at >= start, ActionExecution.created_at < end)) or 0
    failed = failures.samples if failures else 0
    return {
        "ledger_flush_failures": MeasuredMetric(value=failed, samples=failed, unit="failures", reason=f"{failed} durable exhausted-flush receipts in window; receipts unavailable during DB outages may undercount."),
        "reservation_drift": MeasuredMetric(value=float(drift), samples=days, unit="USD", reason=f"Current sum of absolute per-day reserved USD minus authorized reservation USD: {drift}. Attempt allowance is not refunded."),
        "database_latency": MeasuredMetric(value=timing.mean_ms, samples=timing.samples, unit="ms", reason=f"Mean tenant-scoped ledger preflight SELECT latency from {timing.samples} durable samples in window.") if timing else _unavailable("No durable ledger preflight query timing samples in this window."),
        "connector_errors": MeasuredMetric(value=events+actions, samples=events+actions, unit="records", reason=f"{events} currently dead-lettered live events by received_at; {actions} failed/unknown actions by created_at in window; not lifetime transition counts."),
    }


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
        Job.updated_at,
    ).where(Job.tenant_id == tenant_id, Job.created_at >= start, Job.created_at < end)).all())
    live_jobs = list(db.execute(select(
        Job.status,
        Job.created_at,
    ).where(Job.tenant_id == tenant_id, Job.status.in_(("queued", "leased")))).all())
    live_pending_attempts = list(db.execute(select(
        InferenceAttempt.status,
        InferenceAttempt.started_at,
    ).where(InferenceAttempt.tenant_id == tenant_id, InferenceAttempt.status == "pending")).all())

    ingested = sum(j.conversation_count for j in jobs if j.job_type == "upload")
    completed_runs = [r for r in runs if r.status in {"complete", "completed", "succeeded"}]
    processed = len({r.conversation_id for r in completed_runs})
    surfaced = len(predictions)
    reviewed_prediction_ids = {f.signal_id for f in feedback}
    reviewed_predictions = list(db.execute(select(
        SignalPrediction.id,
        SignalPrediction.signal_type,
    ).where(
        SignalPrediction.tenant_id == tenant_id,
        SignalPrediction.id.in_(reviewed_prediction_ids),
    )).all()) if reviewed_prediction_ids else []
    reviewed_prediction_by_id = {p.id: p for p in reviewed_predictions}
    scoped_feedback = [f for f in feedback if f.signal_id in reviewed_prediction_by_id]
    reviewed = len(scoped_feedback)
    correct = sum(f.feedback == "correct" for f in scoped_feedback)
    incorrect = sum(f.feedback == "incorrect" for f in scoped_feedback)
    partial = sum(f.feedback == "partially_correct" for f in scoped_feedback)
    acted = sum(p.acted for p in predictions)
    positive = sum(p.outcome in POSITIVE_OUTCOMES for p in predictions)
    influenced = sum((Decimal(str(p.outcome_value_inr)) for p in predictions if p.outcome in POSITIVE_OUTCOMES and p.outcome_value_inr is not None), ZERO)

    type_counts: dict[str, Counter] = defaultdict(Counter)
    for item in scoped_feedback:
        type_counts[reviewed_prediction_by_id[item.signal_id].signal_type][item.feedback] += 1
    by_type = []
    for signal_type, counts in sorted(type_counts.items()):
        total = sum(counts.values())
        by_type.append(QualityByType(signal_type=signal_type, reviewed=total, correct=counts["correct"], acceptance_rate=_ratio(counts["correct"], total)))
    evidence_valid = sum(p.evidence_status == "valid" for p in predictions)
    evidence_unresolved = sum(p.evidence_status == "unresolved" for p in predictions)
    evidence_stale = sum(p.evidence_status == "stale" for p in predictions)
    evidence_measured = evidence_valid + evidence_unresolved + evidence_stale
    # Superseding a prediction does not turn its completed run into an abstention.
    surfaced_runs = set(db.scalars(select(SignalPrediction.detection_run_id).where(
        SignalPrediction.tenant_id == tenant_id,
        SignalPrediction.detection_run_id.in_(select(DetectionRun.run_id).where(
            DetectionRun.tenant_id == tenant_id,
            DetectionRun.created_at >= start, DetectionRun.created_at < end,
            DetectionRun.status.in_(("complete", "completed", "succeeded")),
        )),
    )))
    abstained = sum(r.run_id not in surfaced_runs for r in completed_runs)

    attempt_status = Counter(a.status for a in attempts)
    job_status = Counter(j.status for j in jobs)
    queued = live_jobs
    oldest_age = max((max(0, int((current - _utc(j.created_at)).total_seconds())) for j in queued), default=None)
    retry_count = sum(a.attempt_ordinal > 1 for a in attempts)
    error_count = sum(a.status in {"failed", "timeout", "cancelled"} for a in attempts)
    latencies = [a.latency_ms for a in attempts if a.latency_ms is not None and a.latency_ms >= 0]
    processing_latencies = [
        max(0, int((_utc(j.updated_at) - _utc(j.created_at)).total_seconds() * 1000))
        for j in jobs
        if j.status in {"succeeded", "failed", "cancelled", "dead_lettered"}
    ]

    unknown_usage = sum(a.usage_status == "unknown" for a in attempts)
    unknown_cost = sum(a.cost_status == "unknown" or a.estimated_cost_usd is None for a in attempts)
    known = [a for a in attempts if a.cost_status != "unknown" and a.estimated_cost_usd is not None]
    estimated = sum((Decimal(a.estimated_cost_usd) for a in known if a.cost_status == "estimated"), ZERO)
    reconciled = sum((Decimal(a.estimated_cost_usd) for a in known if a.cost_status == "reconciled"), ZERO)
    known_cost = estimated + reconciled
    completed_run_ids = {r.run_id for r in completed_runs}
    cohort_attempts = list(db.execute(select(
        InferenceAttempt.estimated_cost_usd,
        InferenceAttempt.cost_status,
    ).where(
        InferenceAttempt.tenant_id == tenant_id,
        InferenceAttempt.detection_run_id.in_(completed_run_ids),
        InferenceAttempt.stage.in_(("screen", "detect", "verify")),
    )).all()) if completed_run_ids else []
    known_cohort_attempts = [a for a in cohort_attempts if a.cost_status != "unknown" and a.estimated_cost_usd is not None]
    cohort_cost = sum((Decimal(a.estimated_cost_usd) for a in known_cohort_attempts), ZERO)
    unknown_cohort_cost = sum(a.cost_status == "unknown" or a.estimated_cost_usd is None for a in cohort_attempts)
    base_cost = _cost_per(cohort_cost, processed) if known_cohort_attempts else None
    projections = [CostProjection(conversations=volume, estimated_cost_usd=(cohort_cost * volume / Decimal(processed)).quantize(MONEY, rounding=ROUND_HALF_UP) if base_cost is not None else None, status="available" if base_cost is not None else "unavailable", incomplete=unknown_cohort_cost > 0) for volume in (10_000, 50_000, 100_000)]

    daily_cost: dict[object, Decimal] = defaultdict(lambda: ZERO)
    daily_processed: dict[object, set[str]] = defaultdict(set)
    for a in known:
        daily_cost[_utc(a.started_at).astimezone(IST).date()] += Decimal(a.estimated_cost_usd or ZERO)
    for r in completed_runs:
        daily_processed[_utc(r.created_at).astimezone(IST).date()].add(r.conversation_id)
    daily_rates = [(day, daily_cost[day] / len(conversations)) for day, conversations in daily_processed.items() if conversations and day in daily_cost]
    daily_rates.sort()
    spend_anomaly: bool | None = None
    if len(daily_rates) >= 4:
        history = [float(rate) for _, rate in daily_rates[:-1]]
        spend_anomaly = float(daily_rates[-1][1]) > 2 * median(history)

    telemetry = _operational_metrics(db, tenant_id, start, end)
    unavailable_reason = "Not derivable from the five approved canonical tables."
    funnel = FunnelPanel(ingested=ingested, processed=processed, surfaced=surfaced, reviewed=reviewed, correct=correct, acted=acted, positive_outcomes=positive, influenced_value_inr=influenced, denominators={
        "ingested": None, "processed": ingested, "surfaced": processed,
        "reviewed": surfaced, "correct": reviewed, "acted": surfaced,
        "positive_outcomes": acted, "influenced_value_inr": positive,
    }, definitions={
        "ingested": "Sum of upload-job conversation_count by job created_at.", "processed": "Distinct conversations with a completed detection run by run created_at.", "surfaced": "Active predictions by prediction created_at.", "reviewed": "Feedback within the window joined to surfaced predictions.", "correct": "Canonical correct feedback in reviewed.", "acted": "Surfaced predictions marked acted.", "positive_outcomes": "Surfaced predictions with retained or converted outcome.", "influenced_value_inr": "Customer-recorded value for positive outcomes; not incremental revenue.",
    })
    quality = QualityPanel(signal_score=_ratio(correct, reviewed), reviewed=reviewed, correct=correct, incorrect=incorrect, partially_correct=partial, false_positive_rate=_ratio(incorrect, reviewed), evidence_valid=evidence_valid, evidence_unresolved=evidence_unresolved, evidence_stale=evidence_stale, evidence_failure_rate=_ratio(evidence_unresolved + evidence_stale, evidence_measured), abstained=abstained, abstention_rate=_ratio(abstained, len(completed_runs)), by_signal_type=by_type, gold_set_precision=_unavailable(unavailable_reason), gold_set_recall=_unavailable(unavailable_reason), calibration=_unavailable(unavailable_reason))
    reliability = ReliabilityPanel(jobs_by_status=dict(job_status), recovered_jobs=sum(j.attempt_count > 1 for j in jobs), queue_depth=len(queued), oldest_queue_age_seconds=oldest_age, attempts_by_status=dict(attempt_status), retry_or_fallback_attempts=retry_count, retry_rate=_ratio(retry_count, len(attempts)), http_429_attempts=sum(a.http_status == 429 for a in attempts), error_rate=_ratio(error_count, len(attempts)), unfinished_attempts=len(live_pending_attempts), p50_latency_ms=_percentile(latencies, .5), p95_latency_ms=_percentile(latencies, .95), p50_processing_latency_ms=_percentile(processing_latencies, .5), p95_processing_latency_ms=_percentile(processing_latencies, .95), **telemetry)
    unit_cost = lambda denominator: _cost_per(cohort_cost, denominator) if known_cohort_attempts else None
    economics = EconomicsPanel(attempts=len(attempts), input_tokens=sum(a.input_tokens or 0 for a in attempts if a.usage_status != "unknown"), cached_input_tokens=sum(a.cached_input_tokens or 0 for a in attempts if a.usage_status != "unknown"), output_tokens=sum(a.output_tokens or 0 for a in attempts if a.usage_status != "unknown"), unknown_usage_count=unknown_usage, unknown_usage_rate=_ratio(unknown_usage, len(attempts)), unknown_cost_count=unknown_cost, unknown_cost_rate=_ratio(unknown_cost, len(attempts)), known_cost_coverage=_ratio(len(known), len(attempts)), estimated_cost_usd=estimated, reconciled_cost_usd=reconciled, known_cost_usd=known_cost, cost_per_processed_conversation_usd=base_cost, cost_per_surfaced_signal_usd=unit_cost(surfaced), cost_per_correct_signal_usd=unit_cost(correct), cost_per_acted_signal_usd=unit_cost(acted), projections=projections)
    return EconomicsDashboardResponse(tenant_id=tenant_id, from_ts=start, to_ts=end, funnel=funnel, quality=quality, reliability=reliability, economics=economics, alerts=_alerts(attempts=attempts, pending_attempts=live_pending_attempts, jobs=jobs, live_jobs=live_jobs, predictions=predictions, now=current, spend_anomaly=spend_anomaly, telemetry=telemetry))
