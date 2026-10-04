"""Atomic complete-output publication with transcript revision checks."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.api.deps import assert_tenant_match, require_tenant_id
from app.db import get_db
from app.models.detection_run import DetectionRun
from app.models.signal_prediction import SignalPrediction
from app.services.detection_runs import reconcile_detection
from app.schemas.detection_run import DetectionPublication

router = APIRouter(tags=["detection-runs"])


@router.post("/v1/tenants/{tenant_id}/detection-runs/{run_id}")
def publish_detection(tenant_id: str, run_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")],
                      body: DetectionPublication, header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                      db: Annotated[Session, Depends(get_db)]):
    assert_tenant_match(tenant_id, header_tenant_id)
    ids = [item.conversation_id for item in body.conversations]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "duplicate_conversation_ids")
    try:
        # Stable lock ordering prevents overlapping publications from deadlocking.
        for item in sorted(body.conversations, key=lambda row: row.conversation_id):
            reconcile_detection(db, tenant_id=tenant_id, run_id=run_id, **item.model_dump())
        db.commit()
        rows = db.scalars(select(SignalPrediction).where(SignalPrediction.tenant_id == tenant_id,
            SignalPrediction.detection_run_id == run_id, SignalPrediction.conversation_id.in_(ids))).all()
        return {"run_id": run_id, "predictions": [{"id": str(row.id), "conversation_id": row.conversation_id,
            "signal_type": row.signal_type, "active": row.active} for row in rows]}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "database_unavailable") from exc


@router.get("/v1/tenants/{tenant_id}/detection-runs/{run_id}")
def get_detection(tenant_id: str, run_id: str,
                  header_tenant_id: Annotated[str, Depends(require_tenant_id)],
                  db: Annotated[Session, Depends(get_db)]):
    assert_tenant_match(tenant_id, header_tenant_id)
    rows = db.scalars(select(DetectionRun).where(DetectionRun.tenant_id == tenant_id,
        DetectionRun.run_id == run_id).order_by(DetectionRun.conversation_id)).all()
    if not rows:
        raise HTTPException(404, "detection_run_not_found")
    return {"run_id": run_id, "conversations": [{"conversation_id": row.conversation_id,
        "content_hash": row.content_hash, "model_version": row.model_version,
        "prompt_version": row.prompt_version, "status": row.status, "output": row.output, "coverage": row.coverage} for row in rows]}
