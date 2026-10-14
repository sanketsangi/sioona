"""Tenant-owned reusable classifications; no publication/evidence identities."""
from datetime import datetime
from sqlalchemy import DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class ClassificationCache(Base):
    __tablename__ = "classification_cache"
    tenant_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    content_sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt_version: Mapped[str] = mapped_column(String(128), primary_key=True)
    model_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    route_version: Mapped[str] = mapped_column(String(64), primary_key=True)
    taxonomy_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    classification: Mapped[dict] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
