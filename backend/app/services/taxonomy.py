"""Persist Adapt phrase overrides per tenant."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.models.taxonomy_override import TaxonomyOverride

CANONICAL_TYPES = ("lead", "retention", "upsell")


def _terms(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        term = item.strip()
        if not term or term in seen:
            continue
        seen.add(term)
        out.append(term)
    return out


def list_taxonomy_overrides(db: Session, tenant_id: str) -> dict[str, dict[str, list[str]]]:
    rows = db.scalars(
        select(TaxonomyOverride).where(TaxonomyOverride.tenant_id == tenant_id)
    ).all()
    out: dict[str, dict[str, list[str]]] = {}
    for row in rows:
        out[row.signal_type] = {
            "phrases": list(row.phrases or []),
            "keywords": list(row.keywords or []),
            "negative_phrases": list(row.negative_phrases or []),
        }
    return out


def replace_taxonomy_overrides(
    db: Session,
    *,
    tenant_id: str,
    overrides: dict[str, object],
    merge: bool = False,
) -> dict[str, dict[str, list[str]]]:
    """Replace the tenant's override rows with this snapshot."""
    # Serialize even the first edit, when there is no row to lock. All writers
    # share this transaction lock; separate web instances cannot lose additions.
    if db.get_bind().dialect.name == "postgresql":
        lock_key = int.from_bytes(sha256(f"taxonomy:{tenant_id}".encode()).digest()[:8], "big", signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    if merge:
        current = list_taxonomy_overrides(db, tenant_id)
        for signal_type in CANONICAL_TYPES:
            incoming = overrides.get(signal_type)
            if not isinstance(incoming, dict):
                continue
            row = current.setdefault(signal_type, {})
            for field in ("phrases", "keywords", "negative_phrases"):
                terms = [*row.get(field, []), *_terms(incoming.get(field))]
                seen: set[str] = set()
                row[field] = []
                for term in terms:
                    key = term.casefold()
                    if key not in seen:
                        seen.add(key)
                        row[field].append(term)
        overrides = current
    db.execute(delete(TaxonomyOverride).where(TaxonomyOverride.tenant_id == tenant_id))
    now = datetime.now(timezone.utc)
    for signal_type in CANONICAL_TYPES:
        raw = overrides.get(signal_type)
        if not isinstance(raw, dict):
            continue
        phrases = _terms(raw.get("phrases"))
        keywords = _terms(raw.get("keywords"))
        negative = _terms(raw.get("negative_phrases") or raw.get("negativePhrases"))
        if not phrases and not keywords and not negative:
            continue
        db.add(
            TaxonomyOverride(
                tenant_id=tenant_id,
                signal_type=signal_type,
                phrases=phrases,
                keywords=keywords,
                negative_phrases=negative,
                updated_at=now,
            )
        )
    db.commit()
    return list_taxonomy_overrides(db, tenant_id)
