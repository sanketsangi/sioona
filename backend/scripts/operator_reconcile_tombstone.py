"""Operator-only restore tombstone reconciliation CLI.

Never exposed as an API route or untrusted upload.
Loads an externally retained, trusted completed deletion receipt,
re-fences restored work before traffic/workers are enabled,
and replays the bounded FK-safe deletion path to completion.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit
import uuid

from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session


class ReconciliationError(RuntimeError):
    """Bounded diagnostic for operator reconciliation."""


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tenant",
        required=True,
        help="Tenant ID being reconciled after database restore",
    )
    parser.add_argument(
        "--receipt",
        type=Path,
        required=True,
        help="Path to trusted, externally retained completed deletion receipt JSON",
    )
    parser.add_argument(
        "--actor-id",
        default=os.getenv("SIOONA_OPERATOR_ACTOR_ID"),
        help="Verified operator UUID performing reconciliation",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("HOSTED_MIGRATION_DATABASE_URL"),
        help="Direct session-preserving PostgreSQL connection URL (or HOSTED_MIGRATION_DATABASE_URL)",
    )
    parser.add_argument(
        "--output-receipt",
        type=Path,
        default=Path("docs/development/evidence/tombstone-reconciliation-receipt.json"),
        help="Destination path for the counts-only reconciliation receipt",
    )
    parser.add_argument(
        "--approved-restore-reconciliation",
        action="store_true",
        help="Operator confirmation that database restore is quiesced and traffic is stopped",
    )
    return parser.parse_args()


def validate_database_url(url: str | None) -> str:
    if not url or not url.strip():
        raise ReconciliationError("database_url_required")
    parsed = urlsplit(url)
    if parsed.scheme not in ("postgresql", "postgresql+psycopg", "sqlite"):
        raise ReconciliationError("invalid_database_scheme")
    if parsed.port == 6543 or "pooler" in (parsed.hostname or ""):
        raise ReconciliationError(
            "pooler_detected_session_preserving_connection_required"
        )
    return url


def validate_trusted_receipt(path: Path, expected_tenant: str) -> dict:
    if not path.exists():
        raise ReconciliationError(f"receipt_file_not_found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ReconciliationError("receipt_json_parse_error") from exc

    if not isinstance(data, dict):
        raise ReconciliationError("invalid_receipt_format")
    if data.get("tenant_id") != expected_tenant:
        raise ReconciliationError("tenant_mismatch_in_receipt")
    if data.get("state") != "completed":
        raise ReconciliationError("receipt_state_not_completed")
    if data.get("policy_version") != "cb18.v1":
        raise ReconciliationError("unsupported_receipt_policy_version")
    if "id" not in data:
        raise ReconciliationError("missing_receipt_id")
    try:
        uuid.UUID(data["id"])
    except Exception as exc:
        raise ReconciliationError("invalid_receipt_uuid") from exc

    counts = data.get("counts", {})
    if not isinstance(counts, dict) or not all(
        isinstance(v, int) and v >= 0 for v in counts.values()
    ):
        raise ReconciliationError("invalid_receipt_counts")

    return data


def run_reconciliation(
    db: Session, tenant: str, trusted_receipt: dict, actor_id: str
) -> dict:
    from app.db import bind_tenant
    from app.models import Base
    from app.services import lifecycle
    from app.services.tenant_data import wipe_tenant_data

    bind_tenant(db, tenant)

    # 1. Invoke operator primitive: re-fence tenant and reset checkpoints
    row = lifecycle.reconcile_tombstone(db, tenant, trusted_receipt, actor_id)
    if not row.fenced:
        raise ReconciliationError("reconcile_tombstone_failed_to_fence")

    # 2. Advance deletion state machine to completion in bounded batches
    max_steps = 1000
    steps = 0
    while row.state != "completed" and steps < max_steps:
        row = wipe_tenant_data(
            db,
            tenant_id=tenant,
            request_id=row.id,
            actor_id=actor_id,
            batch_size=lifecycle.BATCH_SIZE,
        )
        steps += 1

    if row.state != "completed":
        raise ReconciliationError(
            f"deletion_replay_did_not_complete_after_{steps}_steps"
        )

    # 3. Verify zero displayable rows remain in all DELETE_ORDER tables
    verification_counts = {}
    for name in lifecycle.DELETE_ORDER:
        table = Base.metadata.tables.get(name)
        if table is not None and "tenant_id" in table.c:
            cnt = db.scalar(
                select(func.count())
                .select_from(table)
                .where(table.c.tenant_id == tenant)
            )
            verification_counts[name] = cnt
            if cnt != 0:
                raise ReconciliationError(
                    f"data_remains_after_reconciliation: {name} count={cnt}"
                )

    return {
        "deletion_id": row.id,
        "state": row.state,
        "checkpoint": row.checkpoint,
        "steps_executed": steps,
        "counts": row.counts,
        "verified_empty_tables": len(verification_counts),
    }


def main():
    args = parse_args()

    if not args.approved_restore_reconciliation:
        print(
            "Error: --approved-restore-reconciliation required to confirm "
            "quiesced restore window.",
            file=sys.stderr,
        )
        sys.exit(2)

    db_url = validate_database_url(args.database_url)
    trusted_receipt = validate_trusted_receipt(args.receipt, args.tenant)

    actor_id = args.actor_id or str(uuid.uuid4())
    try:
        actor_id = str(uuid.UUID(actor_id))
    except Exception:
        raise ReconciliationError("invalid_actor_uuid")

    start_time = time.monotonic()
    engine = create_engine(db_url, pool_pre_ping=True)

    with Session(engine) as db:
        outcome = run_reconciliation(db, args.tenant, trusted_receipt, actor_id)

    duration = time.monotonic() - start_time

    receipt = {
        "receipt_version": "1.0",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "status": "succeeded",
        "tenant_id": args.tenant,
        "policy_version": "cb18.v1",
        "duration_seconds": round(duration, 2),
        "steps_executed": outcome["steps_executed"],
        "counts_cleared": outcome["counts"],
        "verified_empty_tables": outcome["verified_empty_tables"],
        "notice": "Operator-only restore reconciliation completed; zero displayable data remains.",
    }

    out_path = args.output_receipt
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")

    print(
        f"[OK] Tombstone reconciliation completed for tenant '{args.tenant}' in {round(duration, 2)}s"
    )
    print(f"[OK] Verification receipt written to: {out_path}")


if __name__ == "__main__":
    main()
