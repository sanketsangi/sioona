"""Durable metadata only. Never accepts SQL, exceptions, transcripts or labels."""
from datetime import datetime, timezone
from math import isfinite
from uuid import uuid4
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models.operational_telemetry import OperationalSample


def record_sample(db, tenant_id, kind, *, sample_id=None, duration_ms=0, observed_at=None):
    if kind not in {"ledger_flush_failure", "database_query"} or not isfinite(duration_ms) or not 0 <= duration_ms <= 3600000:
        raise ValueError("invalid_operational_sample")
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(insert(OperationalSample).values(
        tenant_id=tenant_id, sample_id=sample_id or str(uuid4()), kind=kind,
        duration_ms=duration_ms, observed_at=observed_at or datetime.now(timezone.utc),
    ).on_conflict_do_nothing(index_elements=["tenant_id", "sample_id", "kind"]))
