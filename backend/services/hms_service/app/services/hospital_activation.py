import asyncio

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import HTTPException
from shared.onboarding.organizations import HospitalActivationResult, HospitalWorkspaceActivation
from shared.onboarding.receipts import activation_lock, previous_receipt, record_receipt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from ..models.mgmt import HmsStaffRole, TenantRegistry
from ..schemas.tenant import TenantCreate
from ..session_tokens import require_workspace_sessions
from .tenant_provisioning import SERVICE_ROOT
from .tenant_service import provision_tenant


async def validate_workspace(tenant):
    engine = None
    try:
        config = Config()
        config.set_main_option("script_location", str(SERVICE_ROOT / "alembic"))
        expected = set(ScriptDirectory.from_config(config).get_heads())
        engine = create_async_engine(tenant.database_url, poolclass=NullPool)
        async with asyncio.timeout(10), engine.connect() as connection:
            actual = set(
                (await connection.scalars(text("SELECT version_num FROM alembic_version"))).all()
            )
            if actual != expected:
                raise ValueError("workspace schema is not ready")
    except Exception:
        raise HTTPException(503, "workspace database is not ready") from None
    finally:
        if engine is not None:
            await engine.dispose()


async def activate_hospital(db, command: HospitalWorkspaceActivation):
    require_workspace_sessions()
    await activation_lock(db, command.applicant_id)
    receipt = await previous_receipt(db, command)
    tenant = await db.get(TenantRegistry, command.hospital_id, with_for_update=True)
    member = await db.scalar(
        select(HmsStaffRole).where(
            HmsStaffRole.tenant_id == command.hospital_id,
            HmsStaffRole.user_id == command.applicant_id,
        )
    )
    if receipt:
        if (
            receipt.resource_id != command.hospital_id
            or not tenant
            or not tenant.is_active
            or tenant.provisioned_at is None
            or not member
            or not member.is_active
            or member.hms_role != "hospital_admin"
        ):
            raise HTTPException(
                409,
                "recorded workspace ownership or readiness has changed; reconciliation is required",
            )
    else:
        existing_member = await db.scalar(
            select(HmsStaffRole.id).where(HmsStaffRole.tenant_id == command.hospital_id).limit(1)
        )
        if tenant is not None or existing_member is not None:
            raise HTTPException(
                409, "existing workspace records require administrator reconciliation"
            )
        try:
            tenant = await provision_tenant(
                TenantCreate(
                    hospital_id=command.hospital_id,
                    hospital_name=command.name,
                    slug=f"hospital-{command.hospital_id.hex}",
                ),
                db,
                allow_existing=False,
            )
        except ValueError:
            raise HTTPException(409, "workspace identity requires reconciliation") from None
        except RuntimeError:
            raise HTTPException(503, "workspace setup is unavailable") from None
        db.add(
            HmsStaffRole(
                tenant_id=tenant.id,
                user_id=command.applicant_id,
                hms_role="hospital_admin",
                is_active=True,
            )
        )
        record_receipt(db, command, tenant.id)
    await validate_workspace(tenant)
    await db.flush()
    return HospitalActivationResult(
        application_id=command.application_id,
        applicant_id=command.applicant_id,
        resource_id=tenant.id,
    )
