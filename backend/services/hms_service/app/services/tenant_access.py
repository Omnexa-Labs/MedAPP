"""Authorization against current management records, independent of JWT tenant hints."""

from uuid import UUID

from fastapi import HTTPException
from shared.auth import Principal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.mgmt import HmsStaffRole, TenantRegistry

PLATFORM_ADMINS = {"admin", "platform_admin"}


def require_platform_admin(principal: Principal) -> None:
    if principal.role not in PLATFORM_ADMINS:
        raise HTTPException(403, "platform administrator required")


async def visible_tenants(db: AsyncSession, principal: Principal) -> list[TenantRegistry]:
    query = select(TenantRegistry).order_by(TenantRegistry.created_at.desc())
    if principal.role not in PLATFORM_ADMINS:
        query = query.join(HmsStaffRole, HmsStaffRole.tenant_id == TenantRegistry.id).where(
            HmsStaffRole.user_id == UUID(principal.subject),
            HmsStaffRole.hms_role == "hospital_admin",
            HmsStaffRole.is_active.is_(True),
            TenantRegistry.is_active.is_(True),
            TenantRegistry.provisioned_at.is_not(None),
        )
    return list((await db.scalars(query)).all())


async def require_tenant_admin(
    db: AsyncSession, principal: Principal, tenant_id: UUID, *, writing: bool = False
) -> TenantRegistry:
    # Every membership/config mutation locks the tenant first, including platform
    # operations. This serializes authorization, revocation and last-admin checks.
    query = select(TenantRegistry).where(TenantRegistry.id == tenant_id)
    if writing:
        query = query.with_for_update()
    tenant = await db.scalar(query.execution_options(populate_existing=True))
    if tenant is None:
        raise HTTPException(404, "tenant not found")
    if principal.role in PLATFORM_ADMINS:
        return tenant
    membership = await db.scalar(
        select(HmsStaffRole).where(
            HmsStaffRole.tenant_id == tenant_id,
            HmsStaffRole.user_id == UUID(principal.subject),
            HmsStaffRole.hms_role == "hospital_admin",
            HmsStaffRole.is_active.is_(True),
        )
    )
    if membership is None or not tenant.is_active or tenant.provisioned_at is None:
        # A caller cannot use these endpoints to discover other hospitals.
        raise HTTPException(404, "tenant not found")
    return tenant


async def preserve_administrator(
    db: AsyncSession, tenant_id: UUID, membership: HmsStaffRole, new_role: str | None
) -> None:
    if (
        not membership.is_active
        or membership.hms_role != "hospital_admin"
        or new_role == "hospital_admin"
    ):
        return
    replacement = await db.scalar(
        select(HmsStaffRole.id)
        .where(
            HmsStaffRole.tenant_id == tenant_id,
            HmsStaffRole.id != membership.id,
            HmsStaffRole.hms_role == "hospital_admin",
            HmsStaffRole.is_active.is_(True),
        )
        .limit(1)
    )
    if replacement is None:
        raise HTTPException(
            409, "assign another hospital administrator before removing the last one"
        )
