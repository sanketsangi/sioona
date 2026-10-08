"""Backfill message hashes and evidence anchors for one tenant.

Dry-run is the default. ``--apply`` writes. Progress is checkpointed so an
interrupted apply can resume. Stdout is counts only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.detection_run import DetectionRun
from app.models.message import Message
from app.models.signal_evidence import SignalEvidence
from app.models.signal_prediction import EVIDENCE_STALE, EVIDENCE_UNRESOLVED, EVIDENCE_VALID, SignalPrediction
from app.services import evidence_anchors


def backfill_signal_evidence(
    db: Session,
    *,
    tenant_id: str,
    apply: bool = False,
    chunk_size: int = 200,
    phase: str = "messages",
    after: str | None = None,
    max_chunks: int | None = None,
) -> dict:
    """Hash null message digests, then anchor predictions from stored detection output.

    Stale predictions are left stale. Quotes that no longer match persisted
    customer text become unresolved. Nothing is deleted.
    """
    if not tenant_id or chunk_size < 1:
        raise ValueError("invalid_backfill")
    if phase not in {"messages", "predictions"}:
        raise ValueError("invalid_backfill")
    stats = {
        "tenant_id": tenant_id,
        "dry_run": not apply,
        "phase": phase,
        "after": after,
        "hashed": 0,
        "anchored": 0,
        "unresolved": 0,
        "unchanged": 0,
        "done": False,
    }
    remaining = max_chunks
    while remaining is None or remaining > 0:
        if stats["phase"] == "messages":
            progressed = _hash_chunk(db, tenant_id=tenant_id, apply=apply, chunk_size=chunk_size, after=stats["after"], stats=stats)
            if not progressed:
                stats["phase"] = "predictions"
                stats["after"] = None
                continue
        else:
            progressed = _prediction_chunk(db, tenant_id=tenant_id, apply=apply, chunk_size=chunk_size, after=stats["after"], stats=stats)
            if not progressed:
                stats["done"] = True
                stats["after"] = None
                break
        if remaining is not None:
            remaining -= 1
    return stats


def _hash_chunk(db: Session, *, tenant_id: str, apply: bool, chunk_size: int, after: str | None, stats: dict) -> bool:
    stmt = select(Message).where(Message.tenant_id == tenant_id, Message.content_sha256.is_(None))
    if after:
        stmt = stmt.where(Message.id > UUID(after))
    rows = list(db.scalars(stmt.order_by(Message.id.asc()).limit(chunk_size)).all())
    if not rows:
        return False
    for row in rows:
        if apply:
            row.content_sha256 = evidence_anchors.text_sha256(row.content)
        stats["hashed"] += 1
    stats["after"] = str(rows[-1].id)
    if apply:
        db.flush()
    return True


def _prediction_chunk(db: Session, *, tenant_id: str, apply: bool, chunk_size: int, after: str | None, stats: dict) -> bool:
    stmt = select(SignalPrediction).where(SignalPrediction.tenant_id == tenant_id)
    if after:
        stmt = stmt.where(SignalPrediction.id > UUID(after))
    rows = list(db.scalars(stmt.order_by(SignalPrediction.id.asc()).limit(chunk_size)).all())
    if not rows:
        return False
    for row in rows:
        action = _plan_prediction(db, row)
        if action == "unchanged":
            stats["unchanged"] += 1
            continue
        if not apply:
            stats[action] += 1
            continue
        if action == "anchored":
            written = _write_anchors(db, row)
            stats["anchored" if written else "unresolved"] += 1
        else:
            row.evidence_status = EVIDENCE_UNRESOLVED
            stats["unresolved"] += 1
    stats["after"] = str(rows[-1].id)
    if apply:
        db.flush()
    return True


def _plan_prediction(db: Session, row: SignalPrediction) -> str:
    if row.evidence_status == EVIDENCE_STALE:
        return "unchanged"
    existing = db.scalar(select(SignalEvidence.id).where(
        SignalEvidence.tenant_id == row.tenant_id, SignalEvidence.prediction_id == row.id).limit(1))
    if row.evidence_status == EVIDENCE_VALID and existing is not None:
        return "unchanged"
    if row.evidence_status == EVIDENCE_UNRESOLVED:
        if db.scalar(
            select(SignalEvidence.id).where(
                SignalEvidence.tenant_id == row.tenant_id,
                SignalEvidence.prediction_id == row.id,
            ).limit(1)
        ):
            return "unchanged"
        return "anchored" if _planned_anchors(db, row) else "unchanged"
    if not _planned_anchors(db, row):
        return "unresolved"
    return "anchored"


def _planned_anchors(db: Session, row: SignalPrediction) -> list[evidence_anchors.Anchor] | None:
    if not row.detection_run_id:
        return None
    run = db.get(DetectionRun, (row.tenant_id, row.detection_run_id, row.conversation_id))
    if run is None or not isinstance(run.output, list):
        return None
    item = next((entry for entry in run.output if isinstance(entry, dict) and entry.get("signal_type") == row.signal_type), None)
    if item is None:
        return None
    quotes = evidence_anchors.evidence_quotes(item.get("evidence") or [])
    if not quotes:
        return None
    turns = evidence_anchors.customer_turns(db, row.tenant_id, row.conversation_id)
    planned: list[evidence_anchors.Anchor] = []
    seen: set[tuple[str, int, int]] = set()
    for quote in quotes:
        anchor = evidence_anchors.resolve_anchor(quote, turns)
        if anchor is None:
            return None
        key = (anchor.message_id, anchor.start, anchor.end)
        if key in seen:
            continue
        seen.add(key)
        planned.append(anchor)
    return planned or None


def _write_anchors(db: Session, row: SignalPrediction) -> bool:
    """Insert anchors only when the message text still matches. Returns False on a race."""
    planned = _planned_anchors(db, row)
    if not planned:
        row.evidence_status = EVIDENCE_UNRESOLVED
        return False
    verified = []
    for anchor in planned:
        message = db.scalar(select(Message).where(
            Message.tenant_id == row.tenant_id,
            Message.conversation_id == row.conversation_id,
            Message.message_id == anchor.message_id,
            Message.role == "customer",
        ))
        if message is None or evidence_anchors.text_sha256(message.content) != anchor.text_sha256:
            row.evidence_status = EVIDENCE_UNRESOLVED
            return False
        verified.append((anchor, message))
    existing = {
        (span.message_id, span.start_cp, span.end_cp)
        for span in db.scalars(
            select(SignalEvidence).where(
                SignalEvidence.tenant_id == row.tenant_id,
                SignalEvidence.prediction_id == row.id,
            )
        ).all()
    }
    for anchor, message in verified:
        key = (anchor.message_id, anchor.start, anchor.end)
        if message.content_sha256 is None:
            message.content_sha256 = anchor.text_sha256
        if key in existing:
            continue
        db.add(SignalEvidence(
            tenant_id=row.tenant_id,
            prediction_id=row.id,
            message_id=anchor.message_id,
            start_cp=anchor.start,
            end_cp=anchor.end,
            text_sha256=anchor.text_sha256,
            candidate_turns=anchor.candidate_turns,
        ))
        existing.add(key)
    row.evidence_status = EVIDENCE_VALID
    return True


def _load_checkpoint(path: Path) -> tuple[str, str | None]:
    if not path.exists():
        return "messages", None
    payload = json.loads(path.read_text())
    phase = payload.get("phase")
    after = payload.get("after")
    if phase not in {"messages", "predictions"} or (after is not None and not isinstance(after, str)):
        raise ValueError("invalid_checkpoint")
    return phase, after


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backfill evidence anchors for one tenant")
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--apply", action="store_true", help="Write changes. Omit for a dry run.")
    parser.add_argument("--chunk", type=int, default=200)
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--max-chunks", type=int)
    args = parser.parse_args(argv)
    phase, after = _load_checkpoint(args.checkpoint) if args.checkpoint else ("messages", None)
    from app.db import SessionLocal
    db = SessionLocal()
    totals = {"dry_run": not args.apply, "hashed": 0, "anchored": 0, "unresolved": 0, "unchanged": 0, "done": False}
    try:
        chunks = 0
        while True:
            stats = backfill_signal_evidence(
                db, tenant_id=args.tenant, apply=args.apply, chunk_size=args.chunk,
                phase=phase, after=after, max_chunks=1,
            )
            for key in ("hashed", "anchored", "unresolved", "unchanged"):
                totals[key] += stats[key]
            phase, after = stats["phase"], stats["after"]
            totals["done"] = stats["done"]
            if args.apply:
                db.commit()
                if args.checkpoint:
                    args.checkpoint.write_text(json.dumps({"phase": phase, "after": after}))
            else:
                db.rollback()
            chunks += 1
            if stats["done"] or (args.max_chunks is not None and chunks >= args.max_chunks):
                break
        print(json.dumps(totals, separators=(",", ":")))
    except Exception:
        db.rollback()
        print(json.dumps({"error": "backfill_failed"}))
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
