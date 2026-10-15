"""Transactional weekly-file counter. One receipt per successful publication."""

import re

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.pilot_settings import PilotSettings
from app.models.weekly_upload_receipt import WeeklyUploadReceipt
from app.schemas.ingestion import Ingestion, IngestionFile
from app.services.pilot import get_pilot_settings

_WEEK1_CSV = "real-partner-export.local.csv"
_WEEK_N_CSV = re.compile(r"real-partner-export\.week\d+\.local\.csv")
_WEEKLY_JSON = re.compile(r"[a-z][a-z0-9]*_week_\d+_batch_\d+\.json")


def is_partner_weekly_pack(name: str | None) -> bool:
    """Same basename rule as the web weekly-pack allowlist."""
    if name is None:
        return False
    base = name.strip().replace("\\", "/").split("/")[-1].strip().lower()
    if not base:
        return False
    return base == _WEEK1_CSV or _WEEK_N_CSV.fullmatch(base) is not None or _WEEKLY_JSON.fullmatch(base) is not None


def publication_files(body: Ingestion) -> list[IngestionFile]:
    if body.files:
        return list(body.files)
    return [IngestionFile(source=body.source, conversation_ids=["publication"])]


def weekly_file_count(body: Ingestion) -> int:
    return sum(
        1
        for file in publication_files(body)
        if file.counts_as_weekly or is_partner_weekly_pack(file.source)
    )


def publication_filename(body: Ingestion) -> str | None:
    for file in reversed(publication_files(body)):
        base = file.source.strip().replace("\\", "/").split("/")[-1].strip()
        if base:
            return base
    return None


def apply_weekly_upload_receipt(
    db: Session,
    *,
    tenant_id: str,
    receipt_id: str,
    weekly_file_count: int,
    last_uploaded_file_name: str | None = None,
    update_filename: bool = False,
) -> PilotSettings | None:
    """Add ``weekly_file_count`` once for ``receipt_id``. Does not commit.

    Baseline fields stay untouched. A second call for the same receipt, including
    one that arrives after the first commit, returns the current row and adds zero.
    ``update_filename`` writes the upload filename only on the applying call.
    """
    from app.services.tenant_lock import lock_tenant_corpus
    lock_tenant_corpus(db, tenant_id)
    count = max(0, int(weekly_file_count))
    filename = (
        last_uploaded_file_name.strip()
        if last_uploaded_file_name and last_uploaded_file_name.strip()
        else None
    )

    existing_receipt = db.scalar(
        select(WeeklyUploadReceipt)
        .where(
            WeeklyUploadReceipt.tenant_id == tenant_id,
            WeeklyUploadReceipt.receipt_id == receipt_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if existing_receipt is not None:
        return get_pilot_settings(db, tenant_id)

    nested = db.begin_nested()
    try:
        db.add(
            WeeklyUploadReceipt(
                tenant_id=tenant_id,
                receipt_id=receipt_id,
                weekly_file_count=count,
            )
        )
        db.flush()
    except IntegrityError:
        nested.rollback()
        db.scalar(
            select(WeeklyUploadReceipt)
            .where(
                WeeklyUploadReceipt.tenant_id == tenant_id,
                WeeklyUploadReceipt.receipt_id == receipt_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return get_pilot_settings(db, tenant_id)

    def apply(row: PilotSettings) -> None:
        if count > 0:
            row.weekly_export_count = (row.weekly_export_count or 0) + count
        if update_filename and filename:
            row.last_uploaded_file_name = filename

    existing = db.scalar(
        select(PilotSettings)
        .where(PilotSettings.tenant_id == tenant_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if existing is not None:
        apply(existing)
        db.flush()
        return existing
    if count == 0 and not (update_filename and filename):
        return None

    created = PilotSettings(
        tenant_id=tenant_id,
        baseline_opportunities=0,
        baseline_note=None,
        weekly_export_count=count if count > 0 else None,
        last_uploaded_file_name=filename if update_filename else None,
    )
    insert_nested = db.begin_nested()
    try:
        db.add(created)
        db.flush()
    except IntegrityError:
        insert_nested.rollback()
        raced = db.scalar(
            select(PilotSettings)
            .where(PilotSettings.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if raced is None:
            raise
        apply(raced)
        db.flush()
        return raced
    return created
