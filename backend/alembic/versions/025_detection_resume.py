"""Tenant-scoped detection resume cursor.

Revision ID: 025_detection_resume
Revises: 024_tenant_rls
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "025_detection_resume"
down_revision: Union[str, None] = "024_tenant_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RUNTIME_ROLE = "sioona_runtime"


def upgrade() -> None:
    op.create_table(
        "detection_resume",
        sa.Column("tenant_id", sa.String(), primary_key=True),
        sa.Column("failed_conversation_ids", sa.JSON(), nullable=False),
        sa.Column("skipped_conversation_ids", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON detection_resume TO {RUNTIME_ROLE};
          END IF;
        END
        $$
        """
    )
    op.execute("ALTER TABLE detection_resume ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE detection_resume FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON detection_resume
          USING (tenant_id = current_setting('app.tenant_id', true))
          WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON detection_resume")
    op.execute("ALTER TABLE detection_resume NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE detection_resume DISABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') THEN
            REVOKE SELECT, INSERT, UPDATE, DELETE ON detection_resume FROM {RUNTIME_ROLE};
          END IF;
        END
        $$
        """
    )
    op.drop_table("detection_resume")
