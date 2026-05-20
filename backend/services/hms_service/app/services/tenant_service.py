from __future__ import annotations

import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.mgmt import HmsStaffRole, TenantRegistry
from ..schemas.tenant import HmsStaffRoleAssign, TenantConfigUpdate, TenantCreate

logger = logging.getLogger(__name__)

ALEMBIC_DIR = Path(__file__).resolve().parent.parent.parent / "alembic"
ALEMBIC_INI = Path(__file__).resolve().parent.parent.parent / "alembic.ini"


async def provision_tenant(body: TenantCreate, db: AsyncSession) -> TenantRegistry:
    existing = await db.execute(
        select(TenantRegistry).where(TenantRegistry.slug == body.slug)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"tenant slug '{body.slug}' already exists")

    db_name = f"hms_{body.slug.replace('-', '_')}"
    database_url = settings.tenant_database_url_template.replace("{tenant_slug}", db_name)

    _create_database(db_name)
    _run_tenant_migrations(database_url)

    tenant = TenantRegistry(
        id=body.hospital_id,
        hospital_name=body.hospital_name,
        slug=body.slug,
        database_url=database_url,
        is_active=True,
        provisioned_at=datetime.now(tz=timezone.utc),
        config_json=body.config,
        notes=body.notes,
    )
    db.add(tenant)
    await db.flush()
    logger.info("provisioned tenant %s (db=%s)", body.hospital_id, db_name)
    return tenant


def _create_database(db_name: str) -> None:
    import psycopg

    dsn = settings.admin_database_url_sync
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(f"SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        if conn.fetchone():
            logger.info("database %s already exists, skipping creation", db_name)
            return
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
        logger.info("created database %s", db_name)


def _run_tenant_migrations(async_dsn: str) -> None:
    sync_dsn = async_dsn.replace("+asyncpg", "+psycopg")
    cmd = [
        "alembic",
        "-c", str(ALEMBIC_INI),
        "-x", f"db_url={sync_dsn}",
        "upgrade", "head",
    ]
    logger.info("running tenant migrations: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        logger.error("migration failed: %s", result.stderr)
        raise RuntimeError(f"alembic migration failed: {result.stderr}")
    logger.info("tenant migrations complete")


async def get_tenant(tenant_id: UUID, db: AsyncSession) -> TenantRegistry | None:
    result = await db.execute(
        select(TenantRegistry).where(TenantRegistry.id == tenant_id)
    )
    return result.scalar_one_or_none()


async def list_tenants(db: AsyncSession) -> list[TenantRegistry]:
    result = await db.execute(
        select(TenantRegistry).order_by(TenantRegistry.created_at.desc())
    )
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
        role_row.hms_role = body.hms_role.value
        role_row.department_id = body.department_id
        role_row.is_active = True
        await db.flush()
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


async def list_tenant_roles(
    tenant_id: UUID, db: AsyncSession
) -> list[HmsStaffRole]:
    result = await db.execute(
        select(HmsStaffRole)
        .where(HmsStaffRole.tenant_id == tenant_id, HmsStaffRole.is_active.is_(True))
        .order_by(HmsStaffRole.created_at.desc())
    )
    return list(result.scalars().all())


async def remove_hms_role(
    tenant_id: UUID, role_id: UUID, db: AsyncSession
) -> bool:
    result = await db.execute(
        select(HmsStaffRole).where(
            HmsStaffRole.id == role_id,
            HmsStaffRole.tenant_id == tenant_id,
        )
    )
    role_row = result.scalar_one_or_none()
    if role_row is None:
        return False
    role_row.is_active = False
    await db.flush()
    return True
