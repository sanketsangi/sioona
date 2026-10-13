"""Durable receipts for weekly-upload counter increments.

Revision ID: 026_weekly_upload_receipts
Revises: 025_detection_resume
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "026_weekly_upload_receipts"
down_revision: Union[str, None] = "025_detection_resume"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RUNTIME_ROLE = "sioona_runtime"


def upgrade() -> None:
    op.create_table(
        "weekly_upload_receipts",
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("receipt_id", sa.String(length=64), nullable=False),
        sa.Column("weekly_file_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "weekly_file_count >= 0",
            name="ck_weekly_upload_receipts_count",
        ),
        sa.PrimaryKeyConstraint("tenant_id", "receipt_id"),
    )
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_upload_receipts TO {RUNTIME_ROLE};
          END IF;
        END
        $$
        """
    )
    op.execute("ALTER TABLE weekly_upload_receipts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE weekly_upload_receipts FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON weekly_upload_receipts
          USING (tenant_id = current_setting('app.tenant_id', true))
          WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON weekly_upload_receipts")
    op.execute("ALTER TABLE weekly_upload_receipts NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE weekly_upload_receipts DISABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') THEN
            REVOKE SELECT, INSERT, UPDATE, DELETE ON weekly_upload_receipts FROM {RUNTIME_ROLE};
          END IF;
        END
        $$
        """
    )
    op.drop_table("weekly_upload_receipts")
