"""Verified actor assertions and the off | shadow | enforce gate.

Shadow logs tenant, route template, and reason only. It never logs the
assertion, subject, email, or request body.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Annotated

import uuid

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import assert_tenant_match, require_admin_role
from app.config import get_settings
from app.db import bind_tenant, get_db
from app.models.membership import Membership

logger = logging.getLogger("sioona.actor")

PERMISSIONS = {
    "read": frozenset({"admin", "reviewer", "demo"}),
    "review": frozenset({"admin", "reviewer"}),
    "admin": frozenset({"admin"}),
}

SERVICE_PRINCIPALS = {
    "principal:eval": frozenset({"inference:preflight", "inference:write", "inference:reserve"}),
    "principal:live-ingest": frozenset({
        "inference:preflight",
        "inference:write",
        "inference:reserve",
        "ingestion:write",
        "detection:write",
        "conversation:write",
        "pilot:read",
        "detection-resume:read",
        "taxonomy:read",
        "published-conversations:read",
    }),
    "principal:ingestion-recovery": frozenset({
        "ingestion:read",
        "ingestion:resume",
    }),
}


class ActorTokenError(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True)
class Actor:
    user_id: str
    tenant_id: str
    role: str


def actor_mode() -> str:
    return get_settings().sioona_actor_auth_mode


def _bind_tenant(db: Session, tenant_id: str) -> None:
    """Set RLS context once the request tenant is known. Never bind a placeholder."""
    if tenant_id.strip():
        bind_tenant(db, tenant_id)


def keep_header_gate(path_tenant_id: str, header_tenant_id: str) -> None:
    """Off and shadow still require the header to match the path. Enforce does not."""
    if actor_mode() != "enforce":
        assert_tenant_match(path_tenant_id, header_tenant_id)


def decode_actor_token(token: str, key: str) -> dict:
    """Verify one HS256 assertion. One current key; a previous key is not accepted."""
    if not key:
        raise ActorTokenError("actor_key_unconfigured")
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"],
            audience="sioona-api",
            issuer="sioona-web",
            options={"require": ["exp", "iat", "sub", "tid", "jti"]},
        )
        issued, expires = claims.get("iat"), claims.get("exp")
        if (
            type(issued) is not int or type(expires) is not int
            or not 0 < expires - issued <= 60
            or not isinstance(claims.get("jti"), str) or not claims["jti"].strip()
        ):
            raise ActorTokenError("invalid_actor")
        return claims
    except jwt.PyJWTError as exc:
        raise ActorTokenError("invalid_actor") from exc


# permission, operation, kind. kind is path, alias, or open.
ROUTE_GUARDS: dict[tuple[str, str], tuple[str, str | None, str]] = {
    ("POST", "/v1/predictions"): ("review", None, "alias"),
    ("POST", "/v1/predictions/bulk"): ("review", None, "alias"),
    ("POST", "/v1/signals/{signal_id}/outcome"): ("review", None, "alias"),
    ("POST", "/v1/conversations"): ("review", "conversation:write", "alias"),
    ("POST", "/v1/conversations/bulk"): ("review", "conversation:write", "alias"),
    ("POST", "/v1/signals/{signal_id}/feedback"): ("review", None, "alias"),
    ("POST", "/v1/signals/{signal_id}/acted"): ("review", None, "alias"),
    ("POST", "/v1/supervised-actions"): ("review", None, "alias"),
    ("POST", "/v1/tenants/{tenant_id}/predictions"): ("review", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/predictions/bulk"): ("review", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/signals/{signal_id}/outcome"): ("review", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/conversations"): ("review", "conversation:write", "path"),
    ("POST", "/v1/tenants/{tenant_id}/conversations/bulk"): ("review", "conversation:write", "path"),
    ("POST", "/v1/tenants/{tenant_id}/signals/{signal_id}/feedback"): ("review", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/signals/{signal_id}/acted"): ("review", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/supervised-actions"): ("review", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/conversations"): ("read", "conversation:read", "path"),
    ("DELETE", "/v1/tenants/{tenant_id}/conversations/{conversation_id}"): ("review", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/conversations/prune"): ("review", None, "path"),
    ("PATCH", "/v1/tenants/{tenant_id}/conversations/{conversation_id}"): ("review", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/signal-score"): ("read", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/signal-score"): ("read", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/signals"): ("read", "signal:read", "path"),
    ("GET", "/v1/tenants/{tenant_id}/signals/needs-review"): ("read", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/signals/needs-review/page"): ("read", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/signals/page"): ("read", "signal:read", "path"),
    ("GET", "/v1/tenants/{tenant_id}/pilot"): ("read", "pilot:read", "path"),
    ("PUT", "/v1/tenants/{tenant_id}/pilot"): ("review", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/detection-resume"): ("read", "detection-resume:read", "path"),
    ("PUT", "/v1/tenants/{tenant_id}/detection-resume"): ("review", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/supervised-actions"): ("read", "supervised-action:read", "path"),
    ("GET", "/v1/tenants/{tenant_id}/taxonomy-overrides"): ("read", "taxonomy:read", "path"),
    ("PUT", "/v1/tenants/{tenant_id}/taxonomy-overrides"): ("review", None, "path"),
    ("DELETE", "/v1/tenants/{tenant_id}/data"): ("admin", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/uploads/{upload_id}/snapshot"): ("read", None, "path"),
    ("PUT", "/v1/tenants/{tenant_id}/uploads/{upload_id}"): ("review", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/uploads/{upload_id}"): ("read", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/uploads"): ("read", "upload:read", "path"),
    ("POST", "/v1/tenants/{tenant_id}/uploads/published-conversations"): ("read", "published-conversations:read", "path"),
    ("POST", "/v1/tenants/{tenant_id}/detection-runs/{run_id}"): ("review", "detection:write", "path"),
    ("GET", "/v1/tenants/{tenant_id}/detection-runs/{run_id}"): ("read", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/detection-runs/{run_id}/inference"): ("read", None, "path"),
    ("GET", "/v1/tenants/{tenant_id}/inference-attempts/preflight"): ("read", "inference:preflight", "path"),
    ("POST", "/v1/tenants/{tenant_id}/inference-attempts"): ("review", "inference:write", "path"),
    ("GET", "/v1/tenants/{tenant_id}/inference-usage"): ("read", None, "path"),
    ("PUT", "/v1/tenants/{tenant_id}/ingestions/{upload_id}"): ("review", "ingestion:write", "path"),
    ("GET", "/v1/tenants/{tenant_id}/ingestions/{upload_id}"): ("read", "ingestion:read", "path"),
    ("POST", "/v1/tenants/{tenant_id}/ingestions/{upload_id}/resume"): ("review", "ingestion:resume", "path"),
    ("GET", "/v1/tenants/{tenant_id}/inference-controls"): ("read", "inference:preflight", "path"),
    ("PUT", "/v1/tenants/{tenant_id}/inference-controls"): ("admin", None, "path"),
    ("PUT", "/v1/tenants/{tenant_id}/inference-controls/global"): ("admin", None, "path"),
    ("POST", "/v1/tenants/{tenant_id}/inference-reservations"): ("review", "inference:reserve", "path"),
    ("POST", "/v1/tenants/{tenant_id}/inference-reservations/{attempt_id}/settle"): ("review", "inference:reserve", "path"),
    ("POST", "/v1/pilot-requests"): ("read", None, "open"),
}


def guarded_router(*args, **kwargs):
    dependencies = list(kwargs.pop("dependencies", []))
    dependencies.append(Depends(guard_request))
    return APIRouter(*args, dependencies=dependencies, **kwargs)


def guard_request(
    request: Request,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-Id")] = None,
    x_sioona_role: Annotated[str | None, Header(alias="X-Sioona-Role")] = None,
    assertion: Annotated[str | None, Header(alias="X-Sioona-Actor")] = None,
    db: Session = Depends(get_db),
) -> None:
    """Authorize the matched route. Unknown routes fail closed."""
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    method = request.method.upper()
    if method == "HEAD":
        method = "GET"
    spec = ROUTE_GUARDS.get((method, path)) if isinstance(path, str) else None
    if spec is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "unguarded_route")
    permission, operation, kind = spec
    if kind == "open":
        return
    mode = actor_mode()
    if kind == "alias":
        if mode == "enforce":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        header = (x_tenant_id or "").strip()
        if header:
            _bind_tenant(db, header)
        if mode == "shadow":
            _observe(request, header or "unknown", assertion, db, permission, operation)
        return
    tenant_id = request.path_params.get("tenant_id")
    if not isinstance(tenant_id, str) or not tenant_id:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "unguarded_route")
    if mode != "enforce":
        header = (x_tenant_id or "").strip()
        if not header:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-Id header is required",
            )
        if tenant_id != header:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="X-Tenant-Id does not match path tenant_id",
            )
        _bind_tenant(db, tenant_id)
        if mode == "shadow":
            _observe(request, tenant_id, assertion, db, permission, operation)
        if permission == "admin":
            require_admin_role(x_sioona_role)
        return
    _bind_tenant(db, tenant_id)
    _enforce(tenant_id, assertion, db, permission, operation)


def legacy_alias(permission: str, operation: str | None = None):
    """Header-only paths. Enforce hides them. Shadow only observes."""

    def dependency(
        request: Request,
        x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-Id")] = None,
        assertion: Annotated[str | None, Header(alias="X-Sioona-Actor")] = None,
        db: Session = Depends(get_db),
    ) -> None:
        mode = actor_mode()
        if mode == "enforce":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
        header = (x_tenant_id or "").strip()
        if header:
            _bind_tenant(db, header)
        if mode == "shadow":
            _observe(request, header or "unknown", assertion, db, permission, operation)

    return dependency


def authorize(permission: str, operation: str | None = None):
    """Path tenant is authority in enforce. Off and shadow keep the header check."""
    if permission not in PERMISSIONS:
        raise RuntimeError("unknown_permission")

    def dependency(
        request: Request,
        tenant_id: str,
        x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-Id")] = None,
        x_sioona_role: Annotated[str | None, Header(alias="X-Sioona-Role")] = None,
        assertion: Annotated[str | None, Header(alias="X-Sioona-Actor")] = None,
        db: Session = Depends(get_db),
    ) -> str:
        mode = actor_mode()
        if mode != "enforce":
            header = (x_tenant_id or "").strip()
            if not header:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="X-Tenant-Id header is required",
                )
            if tenant_id != header:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="X-Tenant-Id does not match path tenant_id",
                )
            _bind_tenant(db, tenant_id)
            if mode == "shadow":
                _observe(request, tenant_id, assertion, db, permission, operation)
            if permission == "admin":
                require_admin_role(x_sioona_role)
            return tenant_id
        _bind_tenant(db, tenant_id)
        actor = _enforce(tenant_id, assertion, db, permission, operation)
        return actor.tenant_id

    return dependency


def _enforce(
    tenant_id: str,
    assertion: str | None,
    db: Session,
    permission: str,
    operation: str | None,
) -> Actor:
    settings = get_settings()
    if not settings.sioona_actor_key.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="actor_key_unconfigured",
        )
    if not assertion:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "actor_required")
    try:
        claims = decode_actor_token(assertion, settings.sioona_actor_key)
    except ActorTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_actor") from exc
    if claims.get("tid") != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    subject = str(claims.get("sub") or "")
    if subject in SERVICE_PRINCIPALS:
        allowed = SERVICE_PRINCIPALS[subject]
        if operation is None or operation not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
        return Actor(subject, tenant_id, "principal")
    try:
        membership = _membership(db, tenant_id, subject)
    except SQLAlchemyError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "database_unavailable") from exc
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    if membership.role not in PERMISSIONS[permission]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return Actor(subject, tenant_id, membership.role)


def _observe(
    request: Request,
    tenant_id: str,
    assertion: str | None,
    db: Session,
    permission: str,
    operation: str | None,
) -> None:
    reason = _mismatch_reason(assertion, tenant_id, db, permission, operation)
    if reason is None:
        return
    route = _route_template(request)
    # Uvicorn's default configuration does not enable application INFO logs.
    # Mismatches must remain observable before a clean shadow window is trusted.
    logger.warning(
        "actor_auth_mismatch tenant=%s route=%s reason=%s",
        tenant_id,
        route,
        reason,
    )


def _mismatch_reason(
    assertion: str | None,
    tenant_id: str,
    db: Session,
    permission: str,
    operation: str | None,
) -> str | None:
    key = get_settings().sioona_actor_key.strip()
    if not key:
        return "actor_key_unconfigured"
    if not assertion:
        return "missing_actor"
    try:
        claims = decode_actor_token(assertion, key)
    except ActorTokenError:
        return "invalid_actor"
    if claims.get("tid") != tenant_id:
        return "tenant_mismatch"
    subject = str(claims.get("sub") or "")
    if subject in SERVICE_PRINCIPALS:
        allowed = SERVICE_PRINCIPALS[subject]
        if operation is None or operation not in allowed:
            return "forbidden"
        return None
    try:
        membership = _membership(db, tenant_id, subject)
    except SQLAlchemyError:
        return "membership_unavailable"
    if membership is None:
        return "membership_missing"
    if membership.role not in PERMISSIONS[permission]:
        return "forbidden"
    return None


def _membership(db: Session, tenant_id: str, subject: str) -> Membership | None:
    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        return None
    return db.scalar(
        select(Membership).where(
            Membership.tenant_id == tenant_id,
            Membership.user_id == user_id,
            Membership.revoked_at.is_(None),
        )
    )


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path:
        return path
    return "unknown"
