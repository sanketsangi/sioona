"""Verified admin controls and narrow service-principal admission routes."""
from typing import Annotated
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.api.actor import guarded_router, _enforce
from app.db import get_db
from app.config import get_settings
from app.models.inference_budget import InferenceControl
from app.models.inference_attempt import InferenceAttempt
from datetime import datetime, timezone
from app.services.inference_budget import configure, reserve, settle, BudgetDenied
from app.services.lifecycle import audit

router = guarded_router(tags=["inference-controls"])

class ControlIn(BaseModel):
    enabled: bool
    daily_attempt_limit: int = Field(gt=0, le=1_000_000)
    run_attempt_limit: int = Field(gt=0, le=10_000)
    reason: str = Field(default="", max_length=200)

class ReserveIn(BaseModel):
    attempt_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    run_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    provider: str = Field(pattern=r"^groq$")
    model: str = Field(min_length=1, max_length=128)
    logical_operation_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    attempt_ordinal: int = Field(ge=1)
    conversation_id: str | None = Field(default=None, max_length=200)
    route_version: str = Field(min_length=1, max_length=64)
    prompt_version: str = Field(min_length=1, max_length=128)
    input_bytes: int = Field(default=0, ge=0, le=10_000_000)

DB = Annotated[Session, Depends(get_db)]
Assertion = Annotated[str | None, Header(alias="X-Sioona-Actor")]

def verified(tenant, assertion, db, permission, operation=None):
    if tenant == "global":
        raise HTTPException(400, "reserved_control_scope")
    # CB-07 never permits asserted legacy roles, even during off/shadow rollout.
    return _enforce(tenant, assertion, db, permission, operation)

@router.get("/v1/tenants/{tenant_id}/inference-controls")
def controls(tenant_id: str, db: DB, assertion: Assertion = None):
    verified(tenant_id, assertion, db, "read", "inference:preflight")
    row = db.get(InferenceControl, tenant_id)
    global_row = db.get(InferenceControl, "global")
    return {"enabled": bool(row and row.enabled and (not global_row or global_row.enabled)),
        "reason": "unconfigured" if row is None else ("paused" if global_row and not global_row.enabled else row.reason),
        "mode": "attempts", "daily_attempt_limit": row.daily_attempt_limit if row else None,
        "run_attempt_limit": row.run_attempt_limit if row else None}

@router.put("/v1/tenants/{tenant_id}/inference-controls")
def put_controls(tenant_id: str, body: ControlIn, db: DB, assertion: Assertion = None):
    actor = verified(tenant_id, assertion, db, "admin")
    try:
        configure(db, tenant_id, body.daily_attempt_limit, body.run_attempt_limit, body.enabled, body.reason, actor.user_id)
        audit(db, tenant_id, actor.user_id,
              "inference_enabled" if body.enabled else "inference_paused",
              "inference_control")
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "controls_unavailable")
    return {"ok": True}

@router.put("/v1/tenants/{tenant_id}/inference-controls/global")
def put_global(tenant_id: str, body: ControlIn, db: DB, assertion: Assertion = None):
    actor = verified(tenant_id, assertion, db, "admin")
    if tenant_id != get_settings().sioona_global_control_tenant:
        raise HTTPException(403, "global_control_forbidden")
    try:
        configure(db, "global", body.daily_attempt_limit, body.run_attempt_limit, body.enabled, body.reason, actor.user_id)
        audit(db, tenant_id, actor.user_id,
              "inference_enabled" if body.enabled else "inference_paused",
              "global_inference_control")
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "controls_unavailable")
    return {"ok": True}

@router.post("/v1/tenants/{tenant_id}/inference-reservations")
def post_reserve(tenant_id: str, body: ReserveIn, db: DB, assertion: Assertion = None):
    verified(tenant_id, assertion, db, "review", "inference:reserve")
    try:
        reserve(db, tenant_id, body.attempt_id, body.run_id, body.provider, body.model, input_bytes=body.input_bytes)
        db.add(InferenceAttempt(tenant_id=tenant_id, attempt_id=body.attempt_id, logical_operation_id=body.logical_operation_id,
            attempt_ordinal=body.attempt_ordinal, conversation_id=body.conversation_id, job_id=body.run_id,
            stage="detect", route_version=body.route_version, provider=body.provider, model=body.model,
            prompt_version=body.prompt_version, status="pending", usage_status="unknown", cost_status="unknown",
            started_at=datetime.now(timezone.utc)))
        db.commit()
        # Commit expires ORM rows; avoid a new RLS-scoped read to serialize the ID.
        return {"authorized": True, "attempt_id": body.attempt_id, "mode": "attempts"}
    except BudgetDenied as error:
        db.rollback()
        raise HTTPException(409, str(error))
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "budget_unavailable")

@router.post("/v1/tenants/{tenant_id}/inference-reservations/{attempt_id}/settle")
def post_settle(tenant_id: str, attempt_id: str, db: DB, assertion: Assertion = None):
    verified(tenant_id, assertion, db, "review", "inference:reserve")
    try:
        settle(db, tenant_id, attempt_id)
        db.commit()
        return {"ok": True}
    except BudgetDenied as error:
        db.rollback()
        raise HTTPException(409, str(error))
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "budget_unavailable")
