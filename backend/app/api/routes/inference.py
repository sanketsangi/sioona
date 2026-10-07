"""Tenant inference ledger. Aggregates only; never returns prompt or transcript text."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router, keep_header_gate
from app.api.deps import require_tenant_id
from app.db import get_db
from app.schemas.inference_attempt import (
    InferenceAttemptBatch,
    InferenceAttemptWriteResult,
    InferenceUsageResponse,
)
from app.services.inference_ledger import InferenceLedgerError, record_attempts, run_usage_groups, usage_groups

router = guarded_router(tags=["inference"])

_ERRORS = {
    "cross_tenant": 403,
    "finalized_pending_demotion": 409,
    "duplicate_attempt_ids": 422,
}


@router.post("/v1/tenants/{tenant_id}/inference-attempts", response_model=InferenceAttemptWriteResult)
def post_inference_attempts(
    tenant_id: str,
    body: InferenceAttemptBatch,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
):
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        result = record_attempts(db, tenant_id, body.attempts)
        db.commit()
        return result
    except InferenceLedgerError as exc:
        db.rollback()
        raise HTTPException(_ERRORS[exc.code], exc.code) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "database_unavailable") from exc


@router.get("/v1/tenants/{tenant_id}/inference-usage", response_model=InferenceUsageResponse)
def get_inference_usage(
    tenant_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
    group_by: Annotated[Literal["day", "model", "stage", "run"], Query()] = "day",
    started_from: Annotated[datetime | None, Query(alias="from")] = None,
    started_to: Annotated[datetime | None, Query(alias="to")] = None,
):
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        groups = usage_groups(db, tenant_id, group_by=group_by, started_from=started_from, started_to=started_to)
        return {"tenant_id": tenant_id, "groups": groups}
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc


@router.get("/v1/tenants/{tenant_id}/detection-runs/{run_id}/inference", response_model=InferenceUsageResponse)
def get_detection_run_inference(
    tenant_id: str,
    run_id: str,
    header_tenant_id: Annotated[str, Depends(require_tenant_id)],
    db: Annotated[Session, Depends(get_db)],
):
    keep_header_gate(tenant_id, header_tenant_id)
    try:
        return {"tenant_id": tenant_id, "groups": run_usage_groups(db, tenant_id, run_id)}
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc
