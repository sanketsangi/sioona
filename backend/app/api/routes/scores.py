"""SignalScore retrieval endpoints."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.schemas.signal_score import SignalScoreByType, SignalScoreResponse
from app.services.signal_score import calculate_signal_score

router = APIRouter(tags=["signal-score"])


@router.get(
    "/v1/tenants/{tenant_id}/signal-score",
    response_model=SignalScoreResponse,
)
def get_signal_score(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    date_from: Annotated[datetime | None, Query()] = None,
    date_to: Annotated[datetime | None, Query()] = None,
    signal_type: Annotated[str | None, Query()] = None,
    conversation_id: Annotated[list[str] | None, Query()] = None,
) -> SignalScoreResponse:
    """Return overall and per-type SignalScore for a tenant.

    ``date_from`` / ``date_to`` filter by feedback ``reviewed_at`` (inclusive).
    Repeat ``conversation_id`` to scope to a keep-set (Eval / Insights pass
    JSON store ids). Omitted → Neon conversations if any, else tenant-wide.
    Present but empty (``conversation_id=``) → 0 reviewed, not tenant-wide.
    """
    assert_tenant_match(tenant_id, header_tenant_id)
    try:
        result = calculate_signal_score(
            db,
            tenant_id,
            date_from=date_from,
            date_to=date_to,
            signal_type=signal_type,
            conversation_ids=conversation_id,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return SignalScoreResponse(
        tenant_id=result.tenant_id,
        signal_score=result.signal_score,
        reviewed_count=result.reviewed_count,
        correct_count=result.correct_count,
        incorrect_count=result.incorrect_count,
        partially_correct_count=result.partially_correct_count,
        by_signal_type=[
            SignalScoreByType(
                signal_type=bucket.signal_type,
                signal_score=bucket.signal_score,
                reviewed_count=bucket.reviewed_count,
                correct_count=bucket.correct_count,
                incorrect_count=bucket.incorrect_count,
                partially_correct_count=bucket.partially_correct_count,
            )
            for bucket in result.by_signal_type
        ],
    )