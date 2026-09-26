"""Service for recording and listing signal predictions."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.signal_feedback import FEEDBACK_CORRECT
from app.models.signal_prediction import SignalPrediction
from app.services.feedback import SignalNotFoundError


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


def record_prediction(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    signal_type: str,
    confidence: float,
    summary: str,
) -> SignalPrediction:
    """Insert or update the prediction for tenant + conversation + type.

    Re-detect / Partner Demo reuse the same Neon row so feedback stays attached.
    """
    existing = db.scalar(
        select(SignalPrediction).where(
            SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.conversation_id == conversation_id,
            SignalPrediction.signal_type == signal_type,
        )
    )
    if existing is not None:
        existing.confidence = confidence
        existing.summary = summary
        db.commit()
        db.refresh(existing)
        return existing

    prediction = SignalPrediction(
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        signal_type=signal_type,
        confidence=confidence,
        summary=summary,
    )
    db.add(prediction)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = db.scalar(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
                SignalPrediction.conversation_id == conversation_id,
                SignalPrediction.signal_type == signal_type,
            )
        )
        if raced is None:
            raise
        raced.confidence = confidence
        raced.summary = summary
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
        }

    conversation_ids = list({key[0] for key in ordered_keys})
    existing_rows = list(
        db.scalars(
            select(SignalPrediction).where(
                SignalPrediction.tenant_id == tenant_id,
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
            updated += 1
            items.append(PredictionUpsertItem(prediction=row, created=False))
            continue

        prediction = SignalPrediction(
            tenant_id=tenant_id,
            conversation_id=str(payload["conversation_id"]),
            signal_type=str(payload["signal_type"]),
            confidence=float(payload["confidence"]),  # type: ignore[arg-type]
            summary=str(payload["summary"]),
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
) -> list[SignalPrediction]:
    """Return this tenant's predictions with feedback loaded. Newest first."""
    stmt = (
        select(SignalPrediction)
        .options(joinedload(SignalPrediction.feedback))
        .where(SignalPrediction.tenant_id == tenant_id)
        .order_by(SignalPrediction.created_at.desc())
    )
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
