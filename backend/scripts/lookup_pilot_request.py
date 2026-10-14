"""Read one persisted intake receipt; never sends communication or edits records.

Run from backend/: python -m scripts.lookup_pilot_request RECEIPT
Contact fields are displayed only with --include-contact. Do not capture that
output in logs or commit it. Use an operator-approved read-only database role.
"""
import argparse
import json
import re
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.pilot_request import PilotRequest


def lookup_receipt(db: Session, receipt: str, include_contact: bool = False) -> dict | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", receipt):
        raise ValueError("invalid_receipt")
    columns = [PilotRequest.receipt_id, PilotRequest.created_at]
    if include_contact:
        columns.extend(getattr(PilotRequest, field) for field in
                       ("name", "email", "company", "role", "platform", "message"))
    row = db.execute(select(*columns).where(PilotRequest.receipt_id == receipt)).mappings().one_or_none()
    if row is None:
        return None
    return {**dict(row), "created_at": row["created_at"].isoformat()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt")
    parser.add_argument("--include-contact", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", args.receipt):
        parser.error("invalid receipt format")
    # Import configuration only here. Never import app.db: its SQLite startup
    # path creates tables. This utility must not initialize or migrate storage.
    from app.config import get_settings
    database_url = get_settings().database_url
    if not database_url.startswith("postgresql"):
        parser.error("operator lookup requires a PostgreSQL read-only connection")
    engine = create_engine(database_url, execution_options={"postgresql_readonly": True})
    try:
        with Session(engine) as db:
            result = lookup_receipt(db, args.receipt, args.include_contact)
        if result is None:
            print("receipt_not_found", file=sys.stderr)
            return 1
        print(json.dumps(result))
        return 0
    except SQLAlchemyError:
        print("receipt_lookup_unavailable", file=sys.stderr)
        return 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
