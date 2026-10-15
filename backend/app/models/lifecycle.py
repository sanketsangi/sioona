"""Bounded lifecycle control records. No customer text in audit or receipts."""
from datetime import datetime
from decimal import Decimal
import uuid
from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, JSON, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class AuditEvent(Base):
    __tablename__ = 'audit_events'
    __table_args__ = (
        CheckConstraint("actor_role = 'admin'", name='ck_audit_role'),
        CheckConstraint("operation IN ('hold_placed','hold_released','export_created','export_read','deletion_requested','deletion_confirmed','deletion_step','deletion_completed','deletion_blocked','deletion_failed','retention_sweep','inference_paused','inference_enabled')", name='ck_audit_operation'),
        CheckConstraint("result IN ('succeeded','blocked','failed')", name='ck_audit_result'),
        CheckConstraint("reason_code IN ('approved','litigation','regulatory','investigation','legal_hold','internal_error','expired')", name='ck_audit_reason'),
        CheckConstraint("resource_type IN ('tenant','hold','export','deletion','retention','inference_control','global_inference_control')", name='ck_audit_resource'),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(256), index=True)
    actor_id: Mapped[str] = mapped_column(String(36))
    actor_role: Mapped[str] = mapped_column(String(16), default='admin')
    resource_type: Mapped[str] = mapped_column(String(32))
    resource_id: Mapped[str] = mapped_column(String(64))
    resource_version: Mapped[str] = mapped_column(String(16), default='cb18.v1')
    operation: Mapped[str] = mapped_column(String(32))
    result: Mapped[str] = mapped_column(String(16), default='succeeded')
    reason_code: Mapped[str] = mapped_column(String(32), default='approved')
    correlation_id: Mapped[str] = mapped_column(String(36), default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LegalHold(Base):
    __tablename__ = 'legal_holds'
    __table_args__ = (
        CheckConstraint("reason_code IN ('litigation','regulatory','investigation')", name='ck_hold_reason'),
        CheckConstraint("resource_type IN ('tenant','conversation','upload')", name='ck_hold_resource'),
        CheckConstraint("(resource_type = 'tenant' AND resource_id IS NULL) OR (resource_type <> 'tenant' AND resource_id IS NOT NULL)", name='ck_hold_scope'),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(256), index=True)
    reason_code: Mapped[str] = mapped_column(String(32))
    resource_type: Mapped[str] = mapped_column(String(32))
    resource_id: Mapped[str | None] = mapped_column(String(256))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TenantDeletion(Base):
    __tablename__ = 'tenant_deletions'
    __table_args__ = (
        CheckConstraint("state IN ('requested','confirmed','running','completed','blocked','failed')", name='ck_deletion_state'),
        CheckConstraint('checkpoint >= 0', name='ck_deletion_checkpoint'),
    )
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    requested_by: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(16), default='requested')
    fenced: Mapped[bool] = mapped_column(Boolean, default=False)
    checkpoint: Mapped[int] = mapped_column(Integer, default=0)
    counts: Mapped[dict] = mapped_column(JSON, default=dict)
    reason_code: Mapped[str | None] = mapped_column(String(32))
    policy_version: Mapped[str] = mapped_column(String(16), default='cb18.v1')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TenantExport(Base):
    __tablename__ = 'tenant_exports'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(256), index=True)
    # Private database storage; never static files, public URLs, or bearer tokens.
    bundle: Mapped[dict | None] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LifecycleLedgerSummary(Base):
    """365-day financial totals retained without conversation/provider references."""
    __tablename__ = 'lifecycle_ledger_summaries'
    __table_args__ = (CheckConstraint('attempts >= 0 AND unknown_attempts >= 0 AND reserved_usd >= 0 AND spent_usd >= 0', name='ck_lifecycle_ledger_totals'),)
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer)
    unknown_attempts: Mapped[int] = mapped_column(Integer)
    reserved_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8))
    spent_usd: Mapped[Decimal] = mapped_column(Numeric(14, 8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# SQLite is a development/test backend. Mirror the persistent write fence there;
# PostgreSQL owns the production triggers in migration 029.
from sqlalchemy import event

@event.listens_for(Base.metadata, 'after_create')
def sqlite_lifecycle_fences(metadata, connection, **kwargs):
    if connection.dialect.name != 'sqlite':
        return
    exempt = {'audit_events','legal_holds','tenant_deletions','lifecycle_ledger_summaries'}
    for table in metadata.tables.values():
        if 'tenant_id' not in table.c or table.name in exempt:
            continue
        for operation in ('INSERT','UPDATE'):
            connection.exec_driver_sql(f'''CREATE TRIGGER IF NOT EXISTS cb18_{table.name}_{operation.lower()}
                BEFORE {operation} ON {table.name} WHEN EXISTS
                (SELECT 1 FROM tenant_deletions WHERE tenant_id=NEW.tenant_id AND fenced=1)
                BEGIN SELECT RAISE(ABORT, 'tenant_deleting'); END''')
    connection.exec_driver_sql('''CREATE TRIGGER IF NOT EXISTS cb18_sticky_fence
        BEFORE UPDATE ON tenant_deletions WHEN OLD.fenced=1 AND NEW.fenced=0
        BEGIN SELECT RAISE(ABORT, 'deletion_fence_is_permanent'); END''')
    connection.exec_driver_sql('''CREATE TRIGGER IF NOT EXISTS cb18_audit_update
        BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_append_only'); END''')
    # SQLite has no runtime roles; permit only policy-aged, unheld expiry.
    connection.exec_driver_sql('''CREATE TRIGGER IF NOT EXISTS cb18_audit_delete
        BEFORE DELETE ON audit_events WHEN
        julianday(OLD.created_at) >= julianday('now', '-365 days') OR EXISTS
        (SELECT 1 FROM legal_holds WHERE tenant_id=OLD.tenant_id AND active=1)
        BEGIN SELECT RAISE(ABORT, 'audit_append_only'); END''')
