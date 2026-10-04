"""Service for recording and listing signal predictions."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.detection_run import DetectionRun
from app.services.tenant_lock import lock_tenant_corpus
from app.models.conversation import Conversation
from app.models.signal_feedback import FEEDBACK_CORRECT
from app.models.signal_prediction import SignalPrediction
from app.services.feedback import SignalNotFoundError


class VersionedPredictionConflict(ValueError):
    """Legacy writes cannot change a conversation with durable detection history."""


def reject_versioned_legacy_write(db: Session, tenant_id: str, conversation_ids: list[str]):
    lock_tenant_corpus(db, tenant_id)
    if db.scalar(select(DetectionRun.run_id).where(DetectionRun.tenant_id == tenant_id,
            DetectionRun.conversation_id.in_(conversation_ids)).limit(1)) is not None:
        raise VersionedPredictionConflict("Use complete detection publication for versioned conversations")


def _looks_like_fk_violation(exc: IntegrityError) -> bool:
    text = str(getattr(exc, "orig", exc)).lower()
    return "foreign key" in text or "fk_signal_predictions" in text


def ensure_conversation_stub(
    db: Session, *, tenant_id: str, conversation_id: str
) -> None:
    """Insert a placeholder chat so a Postgres FK can accept the prediction."""
    existing = db.scalar(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.conversation_id == conversation_id,
        )
    )
    if existing is not None:
        return
    now = datetime.now(timezone.utc)
    db.add(
        Conversation(
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            channel="unknown",
            customer_name=None,
            started_at=now,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


class PredictionNotReviewedError(Exception):
    """Raised when Acted is set without Correct feedback."""


@dataclass(frozen=True)
class PredictionUpsertItem:
    """One upserted prediction plus whether it was newly created."""

    prediction: SignalPrediction
    created: bool


@dataclass(frozen=True)
class PredictionBulkResult:
    """Bulk upsert result with rows and create/update counts."""

    items: list[PredictionUpsertItem]
    created: int
    updated: int


def _prediction_key(conversation_id: str, signal_type: str) -> tuple[str, str]:
    return (conversation_id, signal_type)


def _optional_str(raw: object) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _optional_inr(raw: object) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None


def record_prediction(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    signal_type: str,
    confidence: float,
    summary: str,
    urgency: str | None = None,
    urgency_timeframe: str | None = None,
    mentioned_value_inr: int | None = None,
    _fk_retried: bool = False,
) -> SignalPrediction:
    """Insert or update the prediction for tenant + conversation + type.

    Re-detect / Partner Demo reuse the same Neon row so feedback stays attached.
    """
    reject_versioned_legacy_write(db, tenant_id, [conversation_id])
    existing = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
            SignalPrediction.conversation_id == conversation_id,
            SignalPrediction.signal_type == signal_type,
        )
    )
    if existing is not None:
        existing.confidence = confidence
        existing.summary = summary
        existing.urgency = urgency
        existing.urgency_timeframe = urgency_timeframe
        existing.mentioned_value_inr = mentioned_value_inr
        db.commit()
        db.refresh(existing)
        return existing

    prediction = SignalPrediction(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        signal_type=signal_type,
        confidence=confidence,
        summary=summary,
        urgency=urgency,
        urgency_timeframe=urgency_timeframe,
        mentioned_value_inr=mentioned_value_inr,
    )
    db.add(prediction)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _looks_like_fk_violation(exc) and not _fk_retried:
            ensure_conversation_stub(
                db, tenant_id=tenant_id, conversation_id=conversation_id
            )
            return record_prediction(
                db,
                tenant_id=tenant_id,
                conversation_id=conversation_id,
                signal_type=signal_type,
                confidence=confidence,
                summary=summary,
                urgency=urgency,
                urgency_timeframe=urgency_timeframe,
                mentioned_value_inr=mentioned_value_inr,
                _fk_retried=True,
            )
        reject_versioned_legacy_write(db, tenant_id, [conversation_id])
        raced = db.scalar(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
                SignalPrediction.conversation_id == conversation_id,
                SignalPrediction.signal_type == signal_type,
            )
        )
        if raced is None:
            raise
        raced.confidence = confidence
        raced.summary = summary
        raced.urgency = urgency
        raced.urgency_timeframe = urgency_timeframe
        raced.mentioned_value_inr = mentioned_value_inr
        db.commit()
        db.refresh(raced)
        return raced

    db.refresh(prediction)
    return prediction


def record_predictions_bulk(
    db: Session,
    *,
    tenant_id: str,
    payloads: list[dict[str, object]],
) -> PredictionBulkResult:
    """Upsert many predictions in one round-trip.

    Last payload wins for duplicate (conversation_id, signal_type) keys.
    Existing rows are loaded in one query; inserts/updates share one commit.
    """
    if not payloads:
        return PredictionBulkResult(items=[], created=0, updated=0)

    ordered_keys: list[tuple[str, str]] = []
    by_key: dict[tuple[str, str], dict[str, object]] = {}
    for raw in payloads:
        conversation_id = str(raw["conversation_id"])
        signal_type = str(raw["signal_type"])
        key = _prediction_key(conversation_id, signal_type)
        if key not in by_key:
            ordered_keys.append(key)
        by_key[key] = {
            "conversation_id": conversation_id,
            "signal_type": signal_type,
            "confidence": float(raw["confidence"]),  # type: ignore[arg-type]
            "summary": str(raw["summary"]),
            "urgency": _optional_str(raw.get("urgency")),
            "urgency_timeframe": _optional_str(raw.get("urgency_timeframe")),
            "mentioned_value_inr": _optional_inr(raw.get("mentioned_value_inr")),
        }

    conversation_ids = list({key[0] for key in ordered_keys})
    reject_versioned_legacy_write(db, tenant_id, conversation_ids)
    existing_rows = list(
        db.scalars(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
                SignalPrediction.conversation_id.in_(conversation_ids),
            )
        ).all()
    )
    existing = {
        _prediction_key(row.conversation_id, row.signal_type): row
        for row in existing_rows
    }

    created = 0
    updated = 0
    items: list[PredictionUpsertItem] = []
    for key in ordered_keys:
        payload = by_key[key]
        row = existing.get(key)
        if row is not None:
            row.confidence = float(payload["confidence"])  # type: ignore[arg-type]
            row.summary = str(payload["summary"])
            row.urgency = _optional_str(payload.get("urgency"))
            row.urgency_timeframe = _optional_str(payload.get("urgency_timeframe"))
            row.mentioned_value_inr = _optional_inr(payload.get("mentioned_value_inr"))
            updated += 1
            items.append(PredictionUpsertItem(prediction=row, created=False))
            continue

        prediction = SignalPrediction(
            tenant_id=tenant_id,
            conversation_id=str(payload["conversation_id"]),
            signal_type=str(payload["signal_type"]),
            confidence=float(payload["confidence"]),  # type: ignore[arg-type]
            summary=str(payload["summary"]),
            urgency=_optional_str(payload.get("urgency")),
            urgency_timeframe=_optional_str(payload.get("urgency_timeframe")),
            mentioned_value_inr=_optional_inr(payload.get("mentioned_value_inr")),
        )
        db.add(prediction)
        existing[key] = prediction
        created += 1
        items.append(PredictionUpsertItem(prediction=prediction, created=True))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Rebuild map after race, then fall back to per-key upsert.
        raced_rows = list(
            db.scalars(
                select(SignalPrediction).where(
                    SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
                    SignalPrediction.conversation_id.in_(conversation_ids),
                )
            ).all()
        )
        raced = {
            _prediction_key(row.conversation_id, row.signal_type): row
            for row in raced_rows
        }
        recovered: list[PredictionUpsertItem] = []
        created = 0
        updated = 0
        for key in ordered_keys:
            payload = by_key[key]
            prior = raced.get(key)
            row = record_prediction(
                db,
                tenant_id=tenant_id,
                conversation_id=str(payload["conversation_id"]),
                signal_type=str(payload["signal_type"]),
                confidence=float(payload["confidence"]),  # type: ignore[arg-type]
                summary=str(payload["summary"]),
                urgency=_optional_str(payload.get("urgency")),
                urgency_timeframe=_optional_str(payload.get("urgency_timeframe")),
                mentioned_value_inr=_optional_inr(payload.get("mentioned_value_inr")),
            )
            if prior is not None:
                updated += 1
                recovered.append(PredictionUpsertItem(prediction=row, created=False))
            else:
                created += 1
                recovered.append(PredictionUpsertItem(prediction=row, created=True))
        return PredictionBulkResult(
            items=recovered, created=created, updated=updated
        )

    # One reload for all upserted rows (same pattern as conversation bulk).
    reloaded = {
        _prediction_key(row.conversation_id, row.signal_type): row
        for row in db.scalars(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
                SignalPrediction.conversation_id.in_(conversation_ids),
            )
        ).all()
    }
    refreshed: list[PredictionUpsertItem] = []
    for item in items:
        key = _prediction_key(
            item.prediction.conversation_id, item.prediction.signal_type
        )
        live = reloaded.get(key, item.prediction)
        refreshed.append(PredictionUpsertItem(prediction=live, created=item.created))

    return PredictionBulkResult(items=refreshed, created=created, updated=updated)


def list_tenant_predictions(
    db: Session,
    tenant_id: str,
    conversation_ids: Sequence[str] | None = None,
    *, limit: int | None = None, after: UUID | None = None,
) -> list[SignalPrediction]:
    """Return this tenant's predictions with feedback loaded. Newest first.

    ``conversation_ids`` scopes Follow-up / Done to the active keep-set.
    Omitted → full tenant list (hydrate). Present but empty / blank → [].
    """
    stmt = (
        select(SignalPrediction)
        .options(joinedload(SignalPrediction.feedback))
        .where(SignalPrediction.tenant_id == tenant_id).where(SignalPrediction.active.is_(True))

    )
    if conversation_ids is not None:
        keep = [cid for cid in conversation_ids if cid]
        if not keep:
            return []
        stmt = stmt.where(SignalPrediction.conversation_id.in_(keep))
    if limit is not None:
        if not 1 <= limit <= 101:
            raise ValueError("Prediction page limit must be 1..101")
        stmt = stmt.order_by(SignalPrediction.id).limit(limit)
        if after is not None:
            stmt = stmt.where(SignalPrediction.id > after)
    else:
        stmt = stmt.order_by(SignalPrediction.created_at.desc())
    return list(db.scalars(stmt).unique().all())


def set_prediction_acted(
    db: Session,
    *,
    tenant_id: str,
    signal_id: UUID,
    acted: bool,
) -> SignalPrediction:
    """Set or clear Acted. Marking acted requires Correct feedback. Tenant-scoped."""
    prediction = db.scalar(
        select(SignalPrediction)
        .options(joinedload(SignalPrediction.feedback))
        .where(
            SignalPrediction.id == signal_id,
            SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
        )
    )
    if prediction is None:
        raise SignalNotFoundError(f"Signal {signal_id} not found for tenant")
    if prediction.feedback is None or (
        acted and prediction.feedback.feedback != FEEDBACK_CORRECT
    ):
        raise PredictionNotReviewedError(
            "Signal must be reviewed before marking acted"
        )

    prediction.acted = acted
    db.commit()
    db.refresh(prediction)
    return prediction


def set_prediction_outcome(
    db: Session,
    *,
    tenant_id: str,
    signal_id: UUID,
    outcome: str,
    value_inr: float | None,
    recorded_on: date | None,
) -> SignalPrediction:
    """Record what happened after a reviewed signal. Tenant-scoped."""
    prediction = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.id == signal_id,
            SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.active.is_(True),
        )
    )
    if prediction is None:
        raise SignalNotFoundError(f"Signal {signal_id} not found for tenant")
    if recorded_on is None:
        recorded_at = datetime.now(timezone.utc)
    else:
        recorded_at = datetime.combine(recorded_on, time.min, tzinfo=timezone.utc)
    prediction.outcome = outcome
    prediction.outcome_value_inr = value_inr
    prediction.outcome_recorded_at = recorded_at
    db.commit()
    db.refresh(prediction)
    return prediction
