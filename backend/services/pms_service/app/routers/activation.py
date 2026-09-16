from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from shared.db import Base
from shared.onboarding.contracts import activation_authorization
from shared.onboarding.pharmacies import PharmacyWorkspaceActivation, PharmacyWorkspaceResult
from shared.onboarding.receipts import activation_lock, previous_receipt, record_receipt
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..deps import DbSession
from ..models.core import PharmacyProfile, Staff
from ..models.workspace import MedAppMembership, MedAppWorkspace

router = APIRouter(prefix="/internal/pharmacy-activations", tags=["internal activation"])


def authorize(x_activation_secret: str | None = Header(default=None)):
    if settings.dev_mode:
        raise HTTPException(503, "MedApp workspace activation requires PMS_DEV_MODE=false")
    secret = settings.onboarding_activation_secret.get_secret_value()
    if secret in {
        settings.jwt_secret,
        settings.medapp_jwt_secret.get_secret_value(),
        settings.medapp_webhook_secret,
    }:
        raise HTTPException(503, "separate workspace activation credentials are required")
    activation_authorization(secret, x_activation_secret)


async def workspace_lock(db):
    # A PMS database serves exactly one pharmacy, including its first activation.
    await activation_lock(db, UUID(int=0))


@router.post("", response_model=PharmacyWorkspaceResult, dependencies=[Depends(authorize)])
async def activate(payload: PharmacyWorkspaceActivation, db=DbSession):
    if (
        not settings.medapp_deployment_key
        or payload.deployment_key != settings.medapp_deployment_key
    ):
        raise HTTPException(409, "PMS deployment identity does not match the assignment")
    await workspace_lock(db)
    receipt = await previous_receipt(db, payload)
    workspace = await db.scalar(select(MedAppWorkspace).with_for_update())
    membership = await db.scalar(
        select(MedAppMembership)
        .where(MedAppMembership.user_id == payload.applicant_id)
        .with_for_update()
    )
    if receipt:
        profile = await db.get(PharmacyProfile, payload.pharmacy_id)
        staff = (
            await db.get(Staff, membership.staff_id) if membership and membership.staff_id else None
        )
        if (
            not workspace
            or not workspace.is_active
            or not profile
            or workspace.pharmacy_id != payload.pharmacy_id
            or workspace.owner_id != payload.applicant_id
            or workspace.application_id != payload.application_id
            or workspace.deployment_key != payload.deployment_key
            or receipt.resource_id != payload.pharmacy_id
            or not membership
            or not membership.is_active
            or membership.role != "pharmacy_admin"
            or (
                membership.staff_id
                and (not staff or not staff.is_active or staff.role != "pharmacy_admin")
            )
        ):
            raise HTTPException(
                409, "recorded workspace access changed; reconciliation is required"
            )
    else:
        # Never attach an approved owner to a pre-existing standalone pharmacy,
        # staff account, stock ledger, or other business record automatically.
        for table in Base.metadata.sorted_tables:
            if await db.scalar(select(func.count()).select_from(table)):
                raise HTTPException(409, "existing PMS data requires administrator reconciliation")
        db.add(
            PharmacyProfile(
                id=payload.pharmacy_id,
                name=payload.name,
                slug=f"pharmacy-{payload.pharmacy_id.hex}",
                license_no=payload.license_number,
                address=payload.address_line1,
                city=payload.city,
                country=payload.country,
                phone=payload.contact_phone,
                email=payload.contact_email,
                currency=settings.pharmacy_currency,
            )
        )
        await db.flush()
        db.add(
            MedAppWorkspace(
                pharmacy_id=payload.pharmacy_id,
                application_id=payload.application_id,
                owner_id=payload.applicant_id,
                deployment_key=payload.deployment_key,
            )
        )
        db.add(MedAppMembership(user_id=payload.applicant_id, role="pharmacy_admin"))
        record_receipt(db, payload, payload.pharmacy_id)
        try:
            await db.flush()
        except IntegrityError as exc:
            raise HTTPException(409, "PMS identity requires administrator reconciliation") from exc
    return PharmacyWorkspaceResult(
        application_id=payload.application_id,
        applicant_id=payload.applicant_id,
        resource_id=payload.pharmacy_id,
        deployment_key=payload.deployment_key,
    )
