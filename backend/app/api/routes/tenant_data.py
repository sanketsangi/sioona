"""Legacy wipe cannot bypass CB-18 confirmation and durable checkpoints."""
from fastapi import HTTPException
from app.api.actor import guarded_router
router = guarded_router(tags=['tenant-data'])

@router.delete('/v1/tenants/{tenant_id}/data')
def delete_tenant_data(tenant_id: str):
    raise HTTPException(409, 'use_lifecycle_deletion_confirmation')
