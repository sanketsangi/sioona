"""Inference attempt ledger routes. Aggregates and metadata only — never text."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Path, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.inference_attempt import (
    DetectionRunInferenceResponse,
    InferenceAttemptBatch,
    InferenceAttemptBatchResult,
    InferenceUsageResponse,
)
from app.services.inference_ledger import (
    CrossTenantAttemptError,
    FinalizedRevertError,
    ledger_is_reachable,
    query_detection_run_inference,
    query_inference_usage,
    upsert_inference_attempts,
)

router = guarded_router(tags=["inference"])


@router.get("/v1/tenants/{tenant_id}/inference-attempts/preflight")
def preflight_inference_ledger(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, bool]:
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        ledger_is_reachable(db)
    except SQLAlchemyError as exc:
        raise HTTPException(503, "ledger_unavailable") from exc
    return {"ok": True}


@router.post(
    "/v1/tenants/{tenant_id}/inference-attempts",
    response_model=InferenceAttemptBatchResult,
)
def post_inference_attempts(
    tenant_id: str,
    body: InferenceAttemptBatch,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> InferenceAttemptBatchResult:
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        result = upsert_inference_attempts(
            db, tenant_id=tenant_id, attempts=body.attempts
        )
        db.commit()
        return result
    except CrossTenantAttemptError as exc:
        db.rollback()
        raise HTTPException(422, "cross_tenant_attempt") from exc
    except FinalizedRevertError as exc:
        db.rollback()
        raise HTTPException(409, "finalized_cannot_revert_to_pending") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "database_unavailable") from exc


@router.get(
    "/v1/tenants/{tenant_id}/inference-usage",
    response_model=InferenceUsageResponse,
)
def get_inference_usage(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    from_ts: Annotated[datetime, Query(alias="from")],
    to_ts: Annotated[datetime, Query(alias="to")],
    group_by: Annotated[
        Literal["day", "model", "stage", "run"], Query()
    ] = "day",
) -> InferenceUsageResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    if to_ts <= from_ts:
        raise HTTPException(422, "invalid_time_range")
    try:
        return query_inference_usage(
            db,
            tenant_id=tenant_id,
            from_ts=from_ts,
            to_ts=to_ts,
            group_by=group_by,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc


@router.get(
    "/v1/tenants/{tenant_id}/detection-runs/{run_id}/inference",
    response_model=DetectionRunInferenceResponse,
)
def get_detection_run_inference(
    tenant_id: str,
    run_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
) -> DetectionRunInferenceResponse:
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        return query_detection_run_inference(
            db, tenant_id=tenant_id, detection_run_id=run_id
        )
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc
