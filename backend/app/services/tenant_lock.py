"""Transaction-scoped serialization for tenant corpus publication and deletion."""
import hashlib
from sqlalchemy import text
from sqlalchemy.orm import Session


def lock_tenant_corpus(db: Session, tenant_id: str) -> None:
    if db.get_bind().dialect.name == "postgresql":
        key = int.from_bytes(hashlib.sha256(tenant_id.encode()).digest()[:8], "big", signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
