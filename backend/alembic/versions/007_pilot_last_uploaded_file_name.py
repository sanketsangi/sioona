"""Add last_uploaded_file_name to pilot_settings for header breadcrumb hydrate.

Revision ID: 007_pilot_last_uploaded_file_name
Revises: 006_pilot_settings
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_pilot_upload_name"
down_revision: Union[str, None] = "006_pilot_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pilot_settings",
        sa.Column("last_uploaded_file_name", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pilot_settings", "last_uploaded_file_name")
