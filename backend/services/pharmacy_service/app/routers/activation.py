from fastapi import APIRouter, Depends, Header, HTTPException
from shared.onboarding.contracts import activation_authorization
from shared.onboarding.pharmacies import (
    PharmacyActivation,
    PharmacyActivationResult,
    PharmacyWorkspaceRequest,
    PharmacyWorkspaceResult,
    pharmacy_resource_id,
)
from shared.onboarding.receipts import activation_lock, previous_receipt, record_receipt
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..deps import DbSession
from ..models import PharmacyProfile
from ..services.deployment_service import activate_workspace

router = APIRouter(prefix="/internal", tags=["internal activation"])


def authorize(x_activation_secret: str | None = Header(default=None)):
    activation_authorization(
        settings.onboarding_activation_secret.get_secret_value(), x_activation_secret
    )


@router.post(
    "/pharmacy-activations",
    response_model=PharmacyActivationResult,
    dependencies=[Depends(authorize)],
)
async def activate(payload: PharmacyActivation, db=DbSession):
    await activation_lock(db, payload.applicant_id)
    receipt = await previous_receipt(db, payload)
    pharmacy_id = pharmacy_resource_id(payload.application_id)
    profiles = list(
        (
            await db.scalars(
                select(PharmacyProfile)
                .where(
                    or_(
                        PharmacyProfile.id == pharmacy_id,
                        PharmacyProfile.user_id == payload.applicant_id,
                    )
                )
                .with_for_update()
            )
        ).all()
    )
    if receipt:
        if (
            len(profiles) != 1
            or profiles[0].id != pharmacy_id
            or not profiles[0].is_active
            or profiles[0].user_id != payload.applicant_id
            or receipt.resource_id != pharmacy_id
        ):
            raise HTTPException(409, "the recorded pharmacy identity or ownership has changed")
    else:
        if profiles:
            raise HTTPException(409, "an existing pharmacy requires administrator reconciliation")
        db.add(
            PharmacyProfile(
                id=pharmacy_id,
                user_id=payload.applicant_id,
                name=payload.name,
                slug=f"pharmacy-{pharmacy_id.hex}",
                license_number=payload.license_number,
                address_line1=payload.address_line1,
                city=payload.city,
                country=payload.country,
                email=payload.contact_email,
                phone=payload.contact_phone,
                website_url=payload.website_url,
                is_active=True,
                is_listable=False,
            )
        )
        record_receipt(db, payload, pharmacy_id)
        try:
            await db.flush()
        except IntegrityError as exc:
            raise HTTPException(
                409, "pharmacy identity requires administrator reconciliation"
            ) from exc
    return PharmacyActivationResult(
        application_id=payload.application_id,
        applicant_id=payload.applicant_id,
        resource_id=pharmacy_id,
    )


@router.post(
    "/pharmacy-workspace-activations",
    response_model=PharmacyWorkspaceResult,
    dependencies=[Depends(authorize)],
)
async def workspace(payload: PharmacyWorkspaceRequest, db=DbSession):
    return await activate_workspace(db, payload)
