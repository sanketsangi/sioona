"""Add workspaces, users, and memberships. Additive; downgrade drops these tables.

Revision ID: 020_workspaces_memberships
Revises: 019_upload_recovery_index
Create Date: 2026-10-08

Downgrade deletes membership rows. Prefer a forward repair. No backfill runs here;
a human seeds memberships with backend/scripts/seed_memberships.py.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_workspaces_memberships"
down_revision: Union[str, None] = "019_upload_recovery_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("tenant_id", name="pk_workspaces"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_table(
        "memberships",
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('admin', 'reviewer', 'demo')",
            name="ck_memberships_role",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["workspaces.tenant_id"],
            name="fk_memberships_workspace",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_memberships_user",
        ),
        sa.PrimaryKeyConstraint("tenant_id", "user_id", name="pk_memberships"),
    )


def downgrade() -> None:
    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("workspaces")
