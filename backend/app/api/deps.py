"""Shared FastAPI dependencies."""

import hmac
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_tenant_id(
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-Id")] = None,
) -> str:
    """Require a non-empty X-Tenant-Id header on every tenant-scoped request."""
    if not x_tenant_id or not x_tenant_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-Id header is required",
        )
    return x_tenant_id.strip()


def _token_matches(presented: str, expected: str) -> bool:
    if len(presented) != len(expected):
        return False
    return hmac.compare_digest(presented, expected)


def require_service_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Accept only the web app's Bearer token once it is configured.

    Unset token + non-production stays open so local pytest and `next dev`
    keep working. Production with an empty token fails closed.
    """
    settings = get_settings()
    token = settings.sioona_service_token.strip()
    production = settings.sioona_env.strip().lower() == "production"
    if not token:
        if production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="service_token_unconfigured",
            )
        return
    if not authorization or not _token_matches(authorization, f"Bearer {token}"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_service_token",
        )


def require_admin_role(
    x_sioona_role: Annotated[str | None, Header(alias="X-Sioona-Role")] = None,
) -> None:
    """Wipe requires an admin role once the service token is in use."""
    settings = get_settings()
    token = settings.sioona_service_token.strip()
    production = settings.sioona_env.strip().lower() == "production"
    if not token and not production:
        return
    if (x_sioona_role or "").strip().lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin_role_required",
        )


def assert_tenant_match(path_tenant_id: str, header_tenant_id: str) -> None:
    """Ensure path tenant_id matches the request tenant header."""
    if path_tenant_id != header_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="X-Tenant-Id does not match path tenant_id",
        )