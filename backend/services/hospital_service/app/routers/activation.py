from fastapi import APIRouter, Depends, Header, HTTPException
from shared.onboarding.contracts import activation_authorization
from shared.onboarding.organizations import (
    HospitalActivation,
    HospitalActivationResult,
    hospital_resource_id,
)
from shared.onboarding.receipts import activation_lock, previous_receipt, record_receipt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..deps import DbSession
from ..models import HospitalProfile

router = APIRouter(prefix="/internal/hospital-activations", tags=["internal activation"])


def authorize(x_activation_secret: str | None = Header(default=None)):
    activation_authorization(
        settings.onboarding_activation_secret.get_secret_value(), x_activation_secret
    )


@router.post("", response_model=HospitalActivationResult, dependencies=[Depends(authorize)])
async def activate(payload: HospitalActivation, db=DbSession):
    await activation_lock(db, payload.applicant_id)
    receipt = await previous_receipt(db, payload)
    hospital_id = hospital_resource_id(payload.application_id)
    hospital = await db.scalar(
        select(HospitalProfile).where(HospitalProfile.id == hospital_id).with_for_update()
    )
    if receipt:
        if (
            not hospital
            or not hospital.is_active
            or hospital.owner_user_id != payload.applicant_id
            or receipt.resource_id != hospital_id
        ):
            raise HTTPException(409, "the recorded hospital identity or ownership has changed")
    else:
        if hospital:
            raise HTTPException(409, "an existing hospital requires administrator reconciliation")
        hospital = HospitalProfile(
            id=hospital_id,
            owner_user_id=payload.applicant_id,
            name=payload.name,
            slug=f"hospital-{hospital_id.hex}",
            specialty=payload.specialty,
            address_line1=payload.address_line1,
            city=payload.city,
            country=payload.country,
            contact_email=payload.contact_email,
            contact_phone=payload.contact_phone,
            website_url=payload.website_url,
            accreditation_status="pending",
            is_active=True,
            is_listable=False,
        )
        db.add(hospital)
        record_receipt(db, payload, hospital_id)
        try:
            await db.flush()
        except IntegrityError as exc:
            raise HTTPException(
                409,
                "hospital identity conflicts with an existing record; reconciliation is required",
            ) from exc
    return HospitalActivationResult(
        application_id=payload.application_id,
        applicant_id=payload.applicant_id,
        resource_id=hospital_id,
    )
