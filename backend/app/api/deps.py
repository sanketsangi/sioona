"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Header, HTTPException, status


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


def assert_tenant_match(path_tenant_id: str, header_tenant_id: str) -> None:
    """Ensure path tenant_id matches the request tenant header."""
    if path_tenant_id != header_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="X-Tenant-Id does not match path tenant_id",
        )