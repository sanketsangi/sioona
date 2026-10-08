"""Quote anchors over exact persisted message text. Offset math stays in Python."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.message import MESSAGE_ROLE_CUSTOMER, Message
from app.models.signal_evidence import SignalEvidence
from app.models.signal_prediction import EVIDENCE_STALE, EVIDENCE_VALID, SignalPrediction

_ANNOTATION_PREFIXES = ("llm: ", "keyword: ", "phrase: ", "suppressed: ")


def text_sha256(text: str) -> str:
    """Hash exact persisted content. This is not an upload digest."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Anchor:
    message_id: str
    start: int
    end: int
    text_sha256: str
    candidate_turns: int


def evidence_quotes(evidence: list) -> list[str]:
    """Customer quotes, using the same entry rules as validate_customer_evidence."""
    quotes: list[str] = []
    for entry in evidence:
        if not isinstance(entry, str):
            continue
        match = re.fullmatch(r'quote: "(.*)"', entry, flags=re.DOTALL)
        if match:
            quotes.append(match.group(1))
        elif not entry.startswith(_ANNOTATION_PREFIXES):
            quotes.append(entry)
    return quotes


def _collapse(text: str) -> tuple[str, list[int]]:
    """Whitespace-collapsed text plus each output character's index in `text`."""
    out: list[str] = []
    index: list[int] = []
    gap_at: int | None = None
    for i, ch in enumerate(text):
        if ch.isspace():
            if out and gap_at is None:
                gap_at = i
            continue
        if gap_at is not None:
            out.append(" ")
            index.append(gap_at)
            gap_at = None
        out.append(ch)
        index.append(i)
    return "".join(out), index


def _hits(needle: str, customer_turns: list[tuple[str, str]]) -> list[Anchor]:
    found: list[Anchor] = []
    for message_id, content in customer_turns:
        collapsed, index = _collapse(content)
        at = collapsed.find(needle)
        if at < 0:
            continue
        end = index[at + len(needle) - 1] + 1
        found.append(Anchor(message_id, index[at], end, text_sha256(content), 0))
    return found


def resolve_anchor(quote: str, customer_turns: list[tuple[str, str]]) -> Anchor | None:
    """Latest matching customer turn wins. Exact normalized text wins before `…`.

    ``customer_turns`` is ``(message_id, content)`` in conversation order.
    A literal ellipsis that already matches is not treated as truncation.
    """
    needle = " ".join(quote.split())
    if not needle:
        return None
    hits = _hits(needle, customer_turns)
    if not hits and needle.endswith("…"):
        prefix = needle[:-1].rstrip()
        if len(prefix) >= 60:
            hits = _hits(prefix, customer_turns)
    if not hits:
        return None
    latest = hits[-1]
    return Anchor(
        latest.message_id,
        latest.start,
        latest.end,
        latest.text_sha256,
        len(hits),
    )


def reconstruct(content: str | None, *, start: int, end: int, digest: str) -> str | None:
    """Return the original slice, or None when the anchor cannot be trusted."""
    if content is None or text_sha256(content) != digest:
        return None
    if not isinstance(start, int) or not isinstance(end, int):
        return None
    if not 0 <= start < end <= len(content):
        return None
    return content[start:end]


def customer_turns(db: Session, tenant_id: str, conversation_id: str) -> list[tuple[str, str]]:
    rows = db.scalars(
        select(Message)
        .where(
            Message.tenant_id == tenant_id,
            Message.conversation_id == conversation_id,
            Message.role == MESSAGE_ROLE_CUSTOMER,
        )
        .order_by(Message.timestamp.asc(), Message.message_id.asc())
    ).all()
    return [(row.message_id, row.content) for row in rows]


def attach_anchors(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    prediction: SignalPrediction,
    evidence: list,
) -> None:
    """Insert one row per distinct span. Raises when a validated quote will not resolve."""
    quotes = evidence_quotes(evidence)
    if not quotes:
        return
    turns = customer_turns(db, tenant_id, conversation_id)
    seen: set[tuple[str, int, int]] = set()
    for quote in quotes:
        anchor = resolve_anchor(quote, turns)
        if anchor is None:
            raise ValueError("Detection evidence is not grounded in customer text")
        key = (anchor.message_id, anchor.start, anchor.end)
        if key in seen:
            continue
        seen.add(key)
        db.add(
            SignalEvidence(
                tenant_id=tenant_id,
                prediction_id=prediction.id,
                message_id=anchor.message_id,
                start_cp=anchor.start,
                end_cp=anchor.end,
                text_sha256=anchor.text_sha256,
                candidate_turns=anchor.candidate_turns,
            )
        )
    prediction.evidence_status = EVIDENCE_VALID


def evidence_views(db: Session, tenant_id: str, predictions: Iterable[SignalPrediction]) -> dict:
    """Read-only reconstruction. Never inserts or updates anchors."""
    rows = list(predictions)
    views: dict = {}
    if not rows:
        return views
    anchors_by_prediction: dict = {row.id: [] for row in rows}
    prediction_ids = [row.id for row in rows]
    anchors: list[SignalEvidence] = []
    for offset in range(0, len(prediction_ids), 500):
        chunk = prediction_ids[offset : offset + 500]
        anchors.extend(
            db.scalars(
                select(SignalEvidence).where(
                    SignalEvidence.tenant_id == tenant_id,
                    SignalEvidence.prediction_id.in_(chunk),
                )
            ).all()
        )
    for anchor in anchors:
        anchors_by_prediction.setdefault(anchor.prediction_id, []).append(anchor)
    message_ids = list(dict.fromkeys(anchor.message_id for anchor in anchors))
    conversation_ids = list(dict.fromkeys(row.conversation_id for row in rows))
    messages: dict[tuple[str, str], Message] = {}
    for offset in range(0, len(message_ids), 500):
        chunk = message_ids[offset : offset + 500]
        found = db.scalars(
            select(Message).where(
                Message.tenant_id == tenant_id,
                Message.role == MESSAGE_ROLE_CUSTOMER,
                Message.message_id.in_(chunk),
                Message.conversation_id.in_(conversation_ids),
            )
        ).all()
        for message in found:
            messages[(message.conversation_id, message.message_id)] = message
    for row in rows:
        views[row.id] = _view_for(row, anchors_by_prediction.get(row.id, []), messages)
    return views


def _view_for(prediction: SignalPrediction, anchors: list[SignalEvidence], messages: dict) -> dict:
    ordered = sorted(anchors, key=lambda anchor: (anchor.start_cp, anchor.message_id, str(anchor.id)))
    hidden = [
        {"message_id": anchor.message_id, "start": anchor.start_cp, "end": anchor.end_cp, "quote": None}
        for anchor in ordered
    ]
    if prediction.evidence_status == EVIDENCE_STALE:
        return {"evidence_status": EVIDENCE_STALE, "evidence_reason": "source_changed", "evidence_spans": hidden}
    if prediction.evidence_status != EVIDENCE_VALID or not ordered:
        return {"evidence_status": "unresolved", "evidence_reason": "unresolved", "evidence_spans": []}
    spans = []
    for anchor in ordered:
        message = messages.get((prediction.conversation_id, anchor.message_id))
        quote = reconstruct(
            None if message is None else message.content,
            start=anchor.start_cp,
            end=anchor.end_cp,
            digest=anchor.text_sha256,
        )
        spans.append({
            "message_id": anchor.message_id,
            "start": anchor.start_cp,
            "end": anchor.end_cp,
            "quote": quote,
        })
    if any(span["quote"] is None for span in spans):
        # Display-only stale: do not rewrite evidence_status or anchors on read.
        return {
            "evidence_status": EVIDENCE_STALE,
            "evidence_reason": "source_changed",
            "evidence_spans": [{**span, "quote": None} for span in spans],
        }
    return {"evidence_status": EVIDENCE_VALID, "evidence_reason": None, "evidence_spans": spans}


def present_predictions(schema, db: Session, tenant_id: str, rows):
    """Attach reconstructed evidence. A single row or a list stays in that shape."""
    single = not isinstance(rows, list)
    items = [rows] if single else rows
    views = evidence_views(db, tenant_id, items)
    presented = []
    for row in items:
        payload = schema.model_validate(row).model_dump()
        payload.update(views[row.id])
        presented.append(schema.model_validate(payload))
    return presented[0] if single else presented


def mark_anchored_predictions_stale(
    db: Session,
    *,
    tenant_id: str,
    message_ids: Iterable[str],
) -> None:
    """Mark predictions whose anchors name these messages. Anchors stay."""
    ids = list(dict.fromkeys(message_id for message_id in message_ids if message_id))
    if not ids:
        return
    for offset in range(0, len(ids), 500):
        chunk = ids[offset : offset + 500]
        prediction_ids = list(
            db.scalars(
                select(SignalEvidence.prediction_id).where(
                    SignalEvidence.tenant_id == tenant_id,
                    SignalEvidence.message_id.in_(chunk),
                )
            ).all()
        )
        if not prediction_ids:
            continue
        db.execute(
            update(SignalPrediction)
            .where(
                SignalPrediction.tenant_id == tenant_id,
                SignalPrediction.id.in_(prediction_ids),
            )
            .values(evidence_status=EVIDENCE_STALE)
        )
