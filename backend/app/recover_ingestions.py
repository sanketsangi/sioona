"""Run one bounded recovery pass: python -m app.recover_ingestions.

Cross-tenant recovery uses MIGRATION_DATABASE_URL when it is set, and
DATABASE_URL otherwise. After DATABASE_URL becomes sioona_runtime, the
migration URL must be the owner or this pass sees no rows.
"""
import argparse
import json

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.db import SessionLocal, migration_database_url
from app.services.ingestion_recovery import recover_staged_ingestions


def _open_session() -> tuple[Session, object | None]:
    url = migration_database_url()
    if not url:
        return SessionLocal(), None
    extra = create_engine(url, pool_pre_ping=True, poolclass=NullPool)
    return Session(extra), extra


def main():
    parser = argparse.ArgumentParser(description="Recover interrupted staged uploads")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--grace-seconds", type=int, default=300)
    args = parser.parse_args()
    db, extra = _open_session()
    try:
        counts = recover_staged_ingestions(db, limit=args.limit, grace_seconds=args.grace_seconds)
    finally:
        db.close()
        if extra is not None:
            extra.dispose()
    # Counts only: never log conversation payloads or tenant identifiers.
    print(json.dumps(counts))
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
