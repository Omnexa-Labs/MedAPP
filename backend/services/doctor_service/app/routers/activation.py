from fastapi import APIRouter, Depends, Header
from shared.onboarding.contracts import (
    ActivationResult,
    ProfessionalActivation,
    activation_authorization,
)
from shared.onboarding.profiles import activate_profile

from ..config import settings
from ..deps import DbSession
from ..models import DoctorProfile

router = APIRouter(prefix="/internal/professional-activations", tags=["internal activation"])


def authorize(x_activation_secret: str | None = Header(default=None)):
    activation_authorization(
        settings.onboarding_activation_secret.get_secret_value(), x_activation_secret
    )


@router.post("", response_model=ActivationResult, dependencies=[Depends(authorize)])
async def activate(payload: ProfessionalActivation, db=DbSession):
    return await activate_profile(db, payload, DoctorProfile, "doctor")
