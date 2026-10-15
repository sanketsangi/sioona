"""Upsert and list human decisions on supervised drafts. Nothing is sent."""

from datetime import datetime, timezone
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.supervised_action import (
    SUPERVISED_ACTION_STATUSES,
    SUPERVISED_ACTION_TYPES,
    SupervisedActionDecision,
)


class SupervisedActionError(Exception):
    """Base error for supervised-action decision writes."""


class InvalidSupervisedActionError(SupervisedActionError):
    """Raised when type, status, or draft text is not usable."""


def _stamp(value: datetime | None, now: datetime) -> datetime:
    if value is None:
        return now
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _require_text(value: str, field: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise InvalidSupervisedActionError(f"{field} is required")
    return trimmed


def upsert_supervised_action_decision(
    db: Session,
    *,
    tenant_id: str,
    conversation_id: str,
    action_type: str,
    status: str,
    subject: str,
    body: str,
    evidence_quote: str = "",
    decided_at: datetime | None = None,
    actor_id: str | None = None,
) -> SupervisedActionDecision:
    """Insert or update one decision. Re-decisions overwrite in place."""
    conversation = conversation_id.strip()
    if not conversation:
        raise InvalidSupervisedActionError("conversation_id is required")
    if action_type not in SUPERVISED_ACTION_TYPES:
        raise InvalidSupervisedActionError(
            f"action_type must be one of: {', '.join(sorted(SUPERVISED_ACTION_TYPES))}"
        )
    if status not in SUPERVISED_ACTION_STATUSES:
        raise InvalidSupervisedActionError(
            f"status must be one of: {', '.join(sorted(SUPERVISED_ACTION_STATUSES))}"
        )
    next_subject = _require_text(subject, "subject")
    next_body = _require_text(body, "body")
    quote = evidence_quote.strip()
    now = datetime.now(timezone.utc)
    stamped = _stamp(decided_at, now)

    def apply(row: SupervisedActionDecision) -> SupervisedActionDecision:
        from app.models.supervised_action import ActionProposal
        from app.services.external_actions import invalidate
        if db.scalar(select(ActionProposal.id).where(ActionProposal.tenant_id == tenant_id, ActionProposal.decision_id == row.id, ActionProposal.state == 'proposed')):
            from app.models.membership import Membership
            import uuid
            member = db.get(Membership, (tenant_id, uuid.UUID(actor_id)), populate_existing=True) if actor_id else None
            if member is None or member.role != 'admin' or member.revoked_at is not None:
                raise InvalidSupervisedActionError('verified_admin_required_for_proposed_draft')
            invalidate(db, tenant_id, row.id, actor_id)
        row.status = status
        row.subject = next_subject
        row.body = next_body
        row.evidence_quote = quote
        row.decided_at = stamped
        db.commit()
        db.refresh(row)
        return row

    from app.services.external_actions import locked
    locked(db, tenant_id)
    existing = db.scalar(
        select(SupervisedActionDecision).where(
            SupervisedActionDecision.tenant_id == tenant_id,
            SupervisedActionDecision.conversation_id == conversation,
            SupervisedActionDecision.action_type == action_type,
        )
    )
    if existing is not None:
        return apply(existing)

    row = SupervisedActionDecision(
        tenant_id=tenant_id,
        conversation_id=conversation,
        action_type=action_type,
        status=status,
        subject=next_subject,
        body=next_body,
        evidence_quote=quote,
        decided_at=stamped,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = db.scalar(
            select(SupervisedActionDecision).where(
                SupervisedActionDecision.tenant_id == tenant_id,
                SupervisedActionDecision.conversation_id == conversation,
                SupervisedActionDecision.action_type == action_type,
            )
        )
        if raced is None:
            raise
        return apply(raced)
    db.refresh(row)
    return row


def list_supervised_action_decisions(
    db: Session,
    tenant_id: str,
    conversation_ids: Sequence[str] | None = None,
) -> list[SupervisedActionDecision]:
    """Decisions for this tenant.

    ``conversation_ids`` scopes Insights to the active keep-set.
    Omitted → full tenant list. Present but empty / blank → [].
    """
    stmt = (
        select(SupervisedActionDecision)
        .where(SupervisedActionDecision.tenant_id == tenant_id)
        .order_by(SupervisedActionDecision.decided_at.desc())
    )
    if conversation_ids is not None:
        keep = [cid for cid in conversation_ids if cid]
        if not keep:
            return []
        stmt = stmt.where(SupervisedActionDecision.conversation_id.in_(keep))
    return list(db.scalars(stmt).all())
