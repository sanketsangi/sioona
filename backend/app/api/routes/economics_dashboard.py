"""Admin-only tenant economics dashboard."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.actor import guarded_router
from app.db import get_db
from app.schemas.economics_dashboard import EconomicsDashboardResponse
from app.services.economics_dashboard import build_economics_dashboard

router = guarded_router(tags=["economics-dashboard"])


@router.get("/v1/tenants/{tenant_id}/economics-dashboard", response_model=EconomicsDashboardResponse)
def get_economics_dashboard(
    tenant_id: str,
    db: Annotated[Session, Depends(get_db)],
    from_ts: Annotated[datetime | None, Query(alias="from")] = None,
    to_ts: Annotated[datetime | None, Query(alias="to")] = None,
) -> EconomicsDashboardResponse:
    end = to_ts or datetime.now(timezone.utc)
    start = from_ts or end - timedelta(days=30)
    try:
        return build_economics_dashboard(db, tenant_id=tenant_id, from_ts=start, to_ts=end)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(503, "database_unavailable") from exc
