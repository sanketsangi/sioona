"""Shadow Mode review-queue and tenant signal list endpoints."""

from typing import Annotated

from fastapi import Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.prediction import PredictionResponse, PredictionWithFeedbackResponse
from app.services.predictions import list_tenant_predictions
from app.services.review_queue import list_signals_needing_review

router = guarded_router(tags=["review-queue"])


@router.get(
    "/v1/tenants/{tenant_id}/signals",
    response_model=list[PredictionWithFeedbackResponse],
)
def get_tenant_signals(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    conversation_id: Annotated[list[str] | None, Query()] = None,
) -> list[PredictionWithFeedbackResponse]:
    """List this tenant's predictions with optional feedback (hydrate restore).

    Repeat ``conversation_id`` to scope Follow-up / Done to the active
    keep-set. Omitted → full tenant list.
    """
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        rows = list_tenant_predictions(
            db, tenant_id, conversation_ids=conversation_id
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [PredictionWithFeedbackResponse.model_validate(row) for row in rows]


@router.get(
    "/v1/tenants/{tenant_id}/signals/needs-review",
    response_model=list[PredictionResponse],
)
def get_signals_needing_review(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    conversation_id: Annotated[list[str] | None, Query()] = None,
) -> list[PredictionResponse]:
    """Return predictions that still need human review.

    ``limit`` is at most 100. Pass ``offset`` to continue, and repeat
    ``conversation_id`` so other packs do not fill the page.
    """
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        rows = list_signals_needing_review(
            db,
            tenant_id,
            limit=limit,
            offset=offset,
            conversation_ids=conversation_id,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="database_unavailable") from exc
    return [PredictionResponse.model_validate(row) for row in rows]

@router.get("/v1/tenants/{tenant_id}/signals/needs-review/page")
def get_review_page(tenant_id: str,
                    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                    db: Annotated[Session, Depends(get_db)],
                    limit: Annotated[int, Query(ge=1, le=100)] = 20,
                    after: Annotated[str | None, Query(max_length=36)] = None,
                    conversation_id: Annotated[list[str] | None, Query()] = None):
    from app.services.review_queue import page_signals_needing_review
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        rows, cursor = page_signals_needing_review(db, tenant_id, limit=limit,
            after=after, conversation_ids=conversation_id)
    except ValueError as exc:
        raise HTTPException(400, "invalid_review_cursor") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc
    return {"predictions": [PredictionResponse.model_validate(row) for row in rows], "next_cursor": cursor}


@router.get("/v1/tenants/{tenant_id}/signals/page")
def get_tenant_signal_page(tenant_id: str,
                          header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                          db: Annotated[Session, Depends(get_db)],
                          limit: Annotated[int, Query(ge=1, le=100)] = 100,
                          after: Annotated[str | None, Query(max_length=36)] = None,
                          conversation_id: Annotated[list[str] | None, Query()] = None):
    from uuid import UUID
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        rows = list_tenant_predictions(db, tenant_id, conversation_ids=conversation_id,
            limit=limit + 1, after=UUID(after) if after else None)
    except ValueError as exc:
        raise HTTPException(400, "invalid_signal_cursor") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc
    cursor = str(rows[limit - 1].id) if len(rows) > limit else None
    return {"predictions": [PredictionWithFeedbackResponse.model_validate(row) for row in rows[:limit]],
            "next_cursor": cursor}
