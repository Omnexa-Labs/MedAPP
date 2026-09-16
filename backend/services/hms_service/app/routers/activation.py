from typing import Annotated

from fastapi import APIRouter, Depends, Header
from shared.onboarding.contracts import activation_authorization
from shared.onboarding.organizations import HospitalActivationResult, HospitalWorkspaceActivation
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_mgmt_db
from ..services.hospital_activation import activate_hospital

router = APIRouter(prefix="/internal/hospital-activations", tags=["internal activation"])


def authorize(x_activation_secret: str | None = Header(default=None)):
    activation_authorization(
        settings.onboarding_activation_secret.get_secret_value(), x_activation_secret
    )


@router.post("", response_model=HospitalActivationResult, dependencies=[Depends(authorize)])
async def activate(
    payload: HospitalWorkspaceActivation, db: Annotated[AsyncSession, Depends(get_mgmt_db)]
):
    return await activate_hospital(db, payload)
