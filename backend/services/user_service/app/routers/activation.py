from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from shared.onboarding.contracts import ActivationResult, RoleActivation, activation_authorization
from shared.onboarding.organizations import ActivationSubject
from shared.onboarding.receipts import previous_receipt, record_receipt

from ..config import settings
from ..deps import DbSession
from ..services.auth_service import _audit, _lock_session_owner

router = APIRouter(prefix="/internal/professional-activations", tags=["internal activation"])


def authorize(x_activation_secret: str | None = Header(default=None)):
    activation_authorization(
        settings.onboarding_activation_secret.get_secret_value(), x_activation_secret
    )


@router.get(
    "/subjects/{applicant_id}", response_model=ActivationSubject, dependencies=[Depends(authorize)]
)
async def check_subject(applicant_id: UUID, db=DbSession):
    user = await _lock_session_owner(db, applicant_id)
    if not user or not user.is_active:
        raise HTTPException(409, "the applicant account is unavailable")
    return ActivationSubject(applicant_id=user.id, is_active=True)


@router.post("", response_model=ActivationResult, dependencies=[Depends(authorize)])
async def activate(payload: RoleActivation, db=DbSession):
    user = await _lock_session_owner(db, payload.applicant_id)
    if not user or not user.is_active:
        raise HTTPException(409, "the applicant account is unavailable")
    receipt = await previous_receipt(db, payload)
    if receipt:
        if user.role != payload.role:
            raise HTTPException(
                409,
                "professional access changed after activation; administrator resolution is required",
            )
    else:
        if user.role not in {"user", "patient", payload.role}:
            raise HTTPException(
                409, "the applicant already has a different professional or administrator role"
            )
        user.role = payload.role
        record_receipt(db, payload, payload.profile_id)
        await _audit(
            db,
            actor_id=payload.reviewer_id,
            action="professional.activated",
            target_user_id=user.id,
            meta={
                "application_id": str(payload.application_id),
                "profile_id": str(payload.profile_id),
                "role": payload.role,
            },
        )
        await db.flush()
    # Existing sessions remain usable. Normal refresh issues the current role;
    # no client tokens or privileged role choices are accepted by this endpoint.
    return ActivationResult(
        application_id=payload.application_id,
        applicant_id=user.id,
        role=payload.role,
        resource_id=payload.profile_id,
    )
