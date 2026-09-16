from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from shared.auth import Principal
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_management_principal, get_mgmt_db
from ..schemas.tenant import (
    HmsStaffRoleAssign,
    HmsStaffRoleOut,
    TenantConfigUpdate,
    TenantCreate,
    TenantList,
    TenantOut,
)
from ..services import tenant_service
from ..services.tenant_access import (
    require_platform_admin,
    require_tenant_admin,
    visible_tenants,
)

router = APIRouter(prefix="/v1/tenants", tags=["tenants"])
ManagementSession = Annotated[AsyncSession, Depends(get_mgmt_db)]
ManagementPrincipal = Annotated[Principal, Depends(get_management_principal)]


@router.post("", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    require_platform_admin(principal)
    try:
        tenant = await tenant_service.provision_tenant(body, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    return tenant


@router.get("", response_model=TenantList)
async def list_tenants(
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    tenants = await visible_tenants(db, principal)
    return TenantList(items=tenants)


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: UUID,
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    return await require_tenant_admin(db, principal, tenant_id)


@router.patch("/{tenant_id}/config", response_model=TenantOut)
async def update_config(
    tenant_id: UUID,
    body: TenantConfigUpdate,
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    await require_tenant_admin(db, principal, tenant_id, writing=True)
    try:
        tenant = await tenant_service.update_tenant_config(tenant_id, body, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return tenant


@router.post(
    "/{tenant_id}/roles", response_model=HmsStaffRoleOut, status_code=status.HTTP_201_CREATED
)
async def assign_role(
    tenant_id: UUID,
    body: HmsStaffRoleAssign,
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    await require_tenant_admin(db, principal, tenant_id, writing=True)
    role = await tenant_service.assign_hms_role(tenant_id, body, db)
    return role


@router.get("/{tenant_id}/roles", response_model=list[HmsStaffRoleOut])
async def list_roles(
    tenant_id: UUID,
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    await require_tenant_admin(db, principal, tenant_id)
    return await tenant_service.list_tenant_roles(tenant_id, db)


@router.delete("/{tenant_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    tenant_id: UUID,
    role_id: UUID,
    db: ManagementSession,
    principal: ManagementPrincipal,
):
    await require_tenant_admin(db, principal, tenant_id, writing=True)
    removed = await tenant_service.remove_hms_role(tenant_id, role_id, db)
    if not removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "role assignment not found")
