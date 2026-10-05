"""Run one bounded recovery pass: python -m app.recover_ingestions."""
import argparse
import json
from app.db import SessionLocal
from app.services.ingestion_recovery import recover_staged_ingestions


def main():
    parser = argparse.ArgumentParser(description="Recover interrupted staged uploads")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--grace-seconds", type=int, default=300)
    args = parser.parse_args()
    with SessionLocal() as db:
        counts = recover_staged_ingestions(db, limit=args.limit, grace_seconds=args.grace_seconds)
    # Counts only: never log conversation payloads or tenant identifiers.
    print(json.dumps(counts))
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
