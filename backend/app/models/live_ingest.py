"""CB-16 installation authority and durable, redacted webhook inbox."""
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class LiveInstallation(Base):
    __tablename__ = 'live_installations'
    __table_args__ = (
        UniqueConstraint('workspace_id', name='uq_live_intercom_workspace'),
        CheckConstraint("credential_ref = 'INTERCOM_CLIENT_SECRET'", name='ck_live_credential'),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(128))
    credential_ref: Mapped[str] = mapped_column(String(64), default='INTERCOM_CLIENT_SECRET')
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    consent_reference: Mapped[str] = mapped_column(String(128))
    monitoring_reference: Mapped[str] = mapped_column(String(128))
    # A source API reconciliation cursor is operator advanced only after all pages persist.
    reconciliation_cursor: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LiveEvent(Base):
    __tablename__ = 'live_events'
    __table_args__ = (
        ForeignKeyConstraint(['tenant_id', 'installation_id'], ['live_installations.tenant_id', 'live_installations.id']),
        CheckConstraint("state IN ('pending','dispatched','succeeded','ignored','dead_lettered','cancelled')", name='ck_live_event_state'),
        CheckConstraint("kind IN ('upsert','delete','unresolved')", name='ck_live_event_kind'),
        CheckConstraint('source_version >= 0 AND length(payload_sha256) = 64', name='ck_live_event_digest'),
        Index('ix_live_event_pending', 'tenant_id', 'state', 'received_at'),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    installation_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(256))
    provider_object_id: Mapped[str | None] = mapped_column(String(256))
    source_version: Mapped[int] = mapped_column(Integer)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload_sha256: Mapped[str] = mapped_column(String(64))
    content_sha256: Mapped[str | None] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16), default='pending')
    # Redacted canonical input, separate from the bounded jobs table.
    payload: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))
    job_id: Mapped[str | None] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(String(32))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LiveSource(Base):
    __tablename__ = 'live_sources'
    __table_args__ = (ForeignKeyConstraint(['tenant_id', 'installation_id'], ['live_installations.tenant_id', 'live_installations.id']),)
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    installation_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    source_version: Mapped[int] = mapped_column(Integer)
    content_sha256: Mapped[str] = mapped_column(String(64))
    conversation_id: Mapped[str | None] = mapped_column(String(256))
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
