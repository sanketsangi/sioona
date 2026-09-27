"""Supervised action decisions — upsert and keep-set list. Nothing is sent."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.supervised_action import SupervisedActionDecision
from app.services.supervised_actions import (
    list_supervised_action_decisions,
    upsert_supervised_action_decision,
)


def test_upsert_replaces_subject_body_and_status(db: Session) -> None:
    first = upsert_supervised_action_decision(
        db,
        tenant_id="tenant_demo",
        conversation_id="conv_1",
        action_type="retention_email_draft",
        status="approved",
        subject="Original",
        body="Original body",
        evidence_quote="close the account",
    )
    second = upsert_supervised_action_decision(
        db,
        tenant_id="tenant_demo",
        conversation_id="conv_1",
        action_type="retention_email_draft",
        status="edited",
        subject="Edited subject",
        body="Edited body",
        evidence_quote="close the account",
    )
    assert second.id == first.id
    assert second.status == "edited"
    assert second.subject == "Edited subject"
    assert second.body == "Edited body"
    count = db.scalar(
        select(func.count())
        .select_from(SupervisedActionDecision)
        .where(SupervisedActionDecision.tenant_id == "tenant_demo")
    )
    assert count == 1


def test_list_is_keep_set_and_tenant_scoped(db: Session) -> None:
    upsert_supervised_action_decision(
        db,
        tenant_id="tenant_demo",
        conversation_id="conv_keep",
        action_type="lead_outreach_draft",
        status="dismissed",
        subject="Intro",
        body="Hello",
    )
    upsert_supervised_action_decision(
        db,
        tenant_id="tenant_demo",
        conversation_id="conv_other",
        action_type="upsell_note_draft",
        status="approved",
        subject="Note",
        body="Share eligibility",
    )
    upsert_supervised_action_decision(
        db,
        tenant_id="tenant_other",
        conversation_id="conv_keep",
        action_type="lead_outreach_draft",
        status="approved",
        subject="Other",
        body="Other body",
    )

    rows = list_supervised_action_decisions(
        db, "tenant_demo", conversation_ids=["conv_keep"]
    )
    assert len(rows) == 1
    assert rows[0].conversation_id == "conv_keep"
    assert rows[0].status == "dismissed"
    assert list_supervised_action_decisions(db, "tenant_demo", conversation_ids=[]) == []
