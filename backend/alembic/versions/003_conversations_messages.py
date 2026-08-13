"""Create conversations and messages tables for durable chats slice 1.

Revision ID: 003_conversations_messages
Revises: 002_prediction_upsert
Create Date: 2026-08-14

No FK from signal_predictions.conversation_id — that remains a string.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_conversations_messages"
down_revision: Union[str, None] = "002_prediction_upsert"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("customer_name", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "conversation_id",
            name="uq_conversations_tenant_conversation_id",
        ),
    )
    op.create_index(
        "ix_conversations_tenant_id",
        "conversations",
        ["tenant_id"],
    )
    op.create_index(
        "ix_conversations_conversation_id",
        "conversations",
        ["conversation_id"],
    )
    op.create_index(
        "ix_conversations_tenant_started",
        "conversations",
        ["tenant_id", "started_at"],
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "message_id",
            name="uq_messages_tenant_message_id",
        ),
        sa.CheckConstraint(
            "role IN ('customer', 'agent', 'system')",
            name="ck_messages_role",
        ),
    )
    op.create_index(
        "ix_messages_tenant_id",
        "messages",
        ["tenant_id"],
    )
    op.create_index(
        "ix_messages_conversation_id",
        "messages",
        ["conversation_id"],
    )
    op.create_index(
        "ix_messages_message_id",
        "messages",
        ["message_id"],
    )
    op.create_index(
        "ix_messages_tenant_conversation",
        "messages",
        ["tenant_id", "conversation_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_messages_tenant_conversation",
        table_name="messages",
    )
    op.drop_index("ix_messages_message_id", table_name="messages")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_index("ix_messages_tenant_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index(
        "ix_conversations_tenant_started",
        table_name="conversations",
    )
    op.drop_index(
        "ix_conversations_conversation_id",
        table_name="conversations",
    )
    op.drop_index("ix_conversations_tenant_id", table_name="conversations")
    op.drop_table("conversations")
