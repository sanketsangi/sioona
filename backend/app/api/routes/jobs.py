"""Durable enqueue/status/cancel always requires verified actor authority."""

from typing import Annotated
from fastapi import Header, Depends, HTTPException, Path
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.api.actor import guarded_router, _enforce
from app.db import get_db, bind_tenant
from app.models.job import Job
from app.schemas.job import JobUpload, DetectJobIn, HistoricalDetectJobIn
from app.services import jobs

router = guarded_router(tags=["jobs"])
DB = Annotated[Session, Depends(get_db)]
Assertion = Annotated[str | None, Header(alias="X-Sioona-Actor")]
Identity = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


def verified(db, tenant, assertion, operation, permission="review"):
    bind_tenant(db, tenant)
    return _enforce(tenant, assertion, db, permission, operation)


def mutate(db, fn):
    try:
        row = fn()
        db.commit()
        return jobs.job_view(row)
    except jobs.JobError as error:
        db.rollback()
        raise HTTPException(409, str(error)) from None
    except (SQLAlchemyError, ValueError):
        db.rollback()
        raise HTTPException(503, "job_unavailable") from None


@router.put("/v1/tenants/{tenant_id}/jobs/uploads/{upload_id}", status_code=202)
def upload(
    tenant_id: str,
    upload_id: Identity,
    body: JobUpload,
    db: DB,
    assertion: Assertion = None,
):
    verified(db, tenant_id, assertion, "job:enqueue")
    return mutate(db, lambda: jobs.enqueue_upload(db, tenant_id, upload_id, body))


@router.post("/v1/tenants/{tenant_id}/jobs/detect", status_code=202)
def detect(tenant_id: str, body: DetectJobIn, db: DB, assertion: Assertion = None):
    verified(db, tenant_id, assertion, "job:enqueue")
    return mutate(
        db,
        lambda: jobs.enqueue_detect(
            db, tenant_id, body.request_id, body.conversation_ids
        ),
    )


@router.post("/v1/tenants/{tenant_id}/jobs/historical", status_code=202)
def historical(tenant_id: str, body: HistoricalDetectJobIn, db: DB, assertion: Assertion = None):
    verified(db, tenant_id, assertion, "job:enqueue")
    return mutate(db, lambda: jobs.enqueue_historical(db, tenant_id, body.request_id, body.conversation_ids))


@router.get("/v1/tenants/{tenant_id}/jobs/{job_id}")
def status(tenant_id: str, job_id: Identity, db: DB, assertion: Assertion = None):
    verified(db, tenant_id, assertion, "job:read", "read")
    row = db.get(Job, (tenant_id, job_id))
    if row is None:
        raise HTTPException(404, "job_not_found")
    return jobs.job_view(row)


@router.post("/v1/tenants/{tenant_id}/jobs/{job_id}/cancel")
def cancel(tenant_id: str, job_id: Identity, db: DB, assertion: Assertion = None):
    verified(db, tenant_id, assertion, "job:cancel")
    return mutate(db, lambda: jobs.cancel(db, tenant_id, job_id))
