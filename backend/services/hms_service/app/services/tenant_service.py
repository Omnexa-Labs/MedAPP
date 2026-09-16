from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.mgmt import HmsStaffRole, TenantRegistry
from ..schemas.tenant import HmsStaffRoleAssign, TenantConfigUpdate, TenantCreate
from .tenant_access import preserve_administrator
from .tenant_provisioning import lock_key, provision_database, tenant_database_url

logger = logging.getLogger(__name__)


async def provision_tenant(
    body: TenantCreate, db: AsyncSession, *, allow_existing: bool = True
) -> TenantRegistry:
    if db.bind.dialect.name == "postgresql":
        # Missing rows cannot be row-locked. Lock both unique identities before
        # performing external DDL so competing requests cannot allocate two DBs.
        for key in sorted(
            {lock_key(f"hms-id:{body.hospital_id}"), lock_key(f"hms-slug:{body.slug}")}
        ):
            await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
    current = await db.get(TenantRegistry, body.hospital_id, with_for_update=True)
    if current is not None:
        if (
            not allow_existing
            or current.slug != body.slug
            or not current.is_active
            or current.provisioned_at is None
        ):
            raise ValueError(
                "tenant identity already exists and requires administrator reconciliation"
            )
        # Idempotent delivery preserves later edits and never re-enables a tenant.
        return current
    existing = await db.execute(select(TenantRegistry).where(TenantRegistry.slug == body.slug))
    if existing.scalar_one_or_none():
        raise ValueError(f"tenant slug '{body.slug}' already exists")

    database_url = tenant_database_url(body.hospital_id)
    await asyncio.to_thread(provision_database, body.hospital_id, database_url)

    tenant = TenantRegistry(
        id=body.hospital_id,
        hospital_name=body.hospital_name,
        slug=body.slug,
        database_url=database_url,
        is_active=True,
        provisioned_at=datetime.now(tz=UTC),
        config_json=body.config,
        notes=body.notes,
    )
    db.add(tenant)
    await db.flush()
    logger.info("provisioned tenant %s", body.hospital_id)
    return tenant


async def get_tenant(tenant_id: UUID, db: AsyncSession) -> TenantRegistry | None:
    result = await db.execute(select(TenantRegistry).where(TenantRegistry.id == tenant_id))
    return result.scalar_one_or_none()


async def list_tenants(db: AsyncSession) -> list[TenantRegistry]:
    result = await db.execute(select(TenantRegistry).order_by(TenantRegistry.created_at.desc()))
    return list(result.scalars().all())


async def update_tenant_config(
    tenant_id: UUID, body: TenantConfigUpdate, db: AsyncSession
) -> TenantRegistry:
    tenant = await get_tenant(tenant_id, db)
    if tenant is None:
        raise ValueError(f"tenant {tenant_id} not found")
    merged = {**tenant.config_json, **body.config}
    tenant.config_json = merged
    await db.flush()
    await db.refresh(tenant)
    return tenant


async def assign_hms_role(
    tenant_id: UUID, body: HmsStaffRoleAssign, db: AsyncSession
) -> HmsStaffRole:
    existing = await db.execute(
        select(HmsStaffRole).where(
            HmsStaffRole.tenant_id == tenant_id,
            HmsStaffRole.user_id == body.user_id,
        )
    )
    role_row = existing.scalar_one_or_none()
    if role_row:
        await preserve_administrator(db, tenant_id, role_row, body.hms_role.value)
        role_row.hms_role = body.hms_role.value
        role_row.department_id = body.department_id
        role_row.is_active = True
        role_row.version += 1
        await db.flush()
        await db.refresh(role_row)
        return role_row

    role_row = HmsStaffRole(
        tenant_id=tenant_id,
        user_id=body.user_id,
        hms_role=body.hms_role.value,
        department_id=body.department_id,
        is_active=True,
    )
    db.add(role_row)
    await db.flush()
    return role_row


async def list_tenant_roles(tenant_id: UUID, db: AsyncSession) -> list[HmsStaffRole]:
    result = await db.execute(
        select(HmsStaffRole)
        .where(HmsStaffRole.tenant_id == tenant_id, HmsStaffRole.is_active.is_(True))
        .order_by(HmsStaffRole.created_at.desc())
    )
    return list(result.scalars().all())


async def remove_hms_role(tenant_id: UUID, role_id: UUID, db: AsyncSession) -> bool:
    result = await db.execute(
        select(HmsStaffRole).where(
            HmsStaffRole.id == role_id,
            HmsStaffRole.tenant_id == tenant_id,
        )
    )
    role_row = result.scalar_one_or_none()
    if role_row is None:
        return False
    await preserve_administrator(db, tenant_id, role_row, None)
    role_row.is_active = False
    role_row.version += 1
    await db.flush()
    return True
