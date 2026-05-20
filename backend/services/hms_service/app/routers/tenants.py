from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal
from shared.auth.rbac import Role, require_roles

from ..deps import get_mgmt_db
from ..schemas.tenant import (
    HmsStaffRoleAssign,
    HmsStaffRoleOut,
    TenantConfigUpdate,
    TenantCreate,
    TenantList,
    TenantOut,
)
from ..services import tenant_service

router = APIRouter(prefix="/v1/tenants", tags=["tenants"])


@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN)),
):
    try:
        tenant = await tenant_service.provision_tenant(body, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return tenant


@router.get("", response_model=TenantList)
async def list_tenants(
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN, Role.HOSPITAL_ADMIN)),
):
    tenants = await tenant_service.list_tenants(db)
    return TenantList(items=tenants)


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN, Role.HOSPITAL_ADMIN)),
):
    tenant = await tenant_service.get_tenant(tenant_id, db)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "tenant not found")
    return tenant


@router.patch("/{tenant_id}/config", response_model=TenantOut)
async def update_config(
    tenant_id: UUID,
    body: TenantConfigUpdate,
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN, Role.HOSPITAL_ADMIN)),
):
    try:
        tenant = await tenant_service.update_tenant_config(tenant_id, body, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return tenant


@router.post("/{tenant_id}/roles", response_model=HmsStaffRoleOut, status_code=status.HTTP_201_CREATED)
async def assign_role(
    tenant_id: UUID,
    body: HmsStaffRoleAssign,
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN, Role.HOSPITAL_ADMIN)),
):
    role = await tenant_service.assign_hms_role(tenant_id, body, db)
    return role


@router.get("/{tenant_id}/roles", response_model=list[HmsStaffRoleOut])
async def list_roles(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN, Role.HOSPITAL_ADMIN)),
):
    return await tenant_service.list_tenant_roles(tenant_id, db)


@router.delete("/{tenant_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    tenant_id: UUID,
    role_id: UUID,
    db: AsyncSession = Depends(get_mgmt_db),
    principal: Principal = Depends(require_roles(Role.ADMIN, Role.HOSPITAL_ADMIN)),
):
    removed = await tenant_service.remove_hms_role(tenant_id, role_id, db)
    if not removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "role assignment not found")
