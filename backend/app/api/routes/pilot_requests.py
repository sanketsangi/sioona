"""Service-authenticated durable inbound contact intake."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router
from app.db import get_db
from app.models.pilot_request import PilotRequest

router = guarded_router(tags=["pilot-intake"])


class Intake(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
    company: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=120)
    platform: str = Field(default="", max_length=120)
    message: str = Field(default="", max_length=2000)

    @field_validator("name", "email", "company", "role", "platform", "message", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


@router.post("/v1/pilot-requests")
def accept_request(body: Intake,
                   idempotency_key: Annotated[str, Header(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")],
                   db: Annotated[Session, Depends(get_db)]):
    payload = body.model_dump()
    payload["email"] = payload["email"].lower()
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    try:
        if db.bind.dialect.name == "postgresql":
            # Serialize both retry identity and recipient rate checks across workers.
            for lock in sorted([idempotency_key, payload["email"]]):
                db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int.from_bytes(hashlib.sha256(lock.encode()).digest()[:8], "big", signed=True)})
        existing = db.get(PilotRequest, idempotency_key)
        if existing:
            if existing.payload_hash != digest:
                raise HTTPException(409, "idempotency_key_conflict")
            return {"ok": True, "receipt": existing.receipt_id}
        recent = db.scalar(select(func.count()).select_from(PilotRequest).where(
            PilotRequest.email == payload["email"],
            PilotRequest.created_at >= datetime.now(timezone.utc) - timedelta(days=1)))
        if recent >= 3:
            raise HTTPException(429, "Too many requests. Please retry tomorrow.")
        db.add(PilotRequest(receipt_id=idempotency_key, payload_hash=digest, **payload))
        db.commit()
        return {"ok": True, "receipt": idempotency_key}
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "idempotency_key_conflict") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "intake_unavailable") from exc
