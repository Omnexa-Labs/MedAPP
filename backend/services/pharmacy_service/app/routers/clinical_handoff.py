"""Internal EHR delivery relay. Destinations come only from confirmed deployment bindings."""

import hmac

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from shared.clinical_handoff import ClinicalHandoff, ClinicalHandoffAck
from shared.pharmacy_sync import encode
from sqlalchemy import select

from ..config import settings
from ..deps import DbSession
from ..models import PharmacyDeployment, PharmacyProfile
from ..services.stock_service import _sign_request


def authorize(x_clinical_handoff_secret: str | None = Header(default=None)):
    secret = settings.clinical_handoff_secret.get_secret_value()
    if len(secret) < 32:
        raise HTTPException(503, "clinical handoff is not configured")
    if not x_clinical_handoff_secret or not hmac.compare_digest(
        secret.encode(), x_clinical_handoff_secret.encode()
    ):
        raise HTTPException(401, "invalid clinical handoff credential")


router = APIRouter(prefix="/internal/clinical-prescriptions", dependencies=[Depends(authorize)])


@router.post("", response_model=ClinicalHandoffAck)
async def relay(command: ClinicalHandoff, db=DbSession):
    binding = await db.scalar(
        select(PharmacyDeployment)
        .join(PharmacyProfile, PharmacyProfile.id == PharmacyDeployment.pharmacy_id)
        .where(
            PharmacyDeployment.pharmacy_id == command.pharmacy_id,
            PharmacyDeployment.activated_at.is_not(None),
            PharmacyProfile.is_active.is_(True),
        )
    )
    config = settings.pms_deployments.get(binding.deployment_key) if binding else None
    if config is None:
        raise HTTPException(409, "pharmacy has no active confirmed deployment")
    raw = encode(command.model_dump(mode="json"))
    path = "/v1/integrations/medapp/clinical-prescriptions"
    signature = _sign_request("POST", path, raw, config.stock_secret.get_secret_value())
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False, trust_env=False) as client:
            response = await client.post(
                config.api_url + path,
                content=raw,
                headers={"X-MedApp-Signature": signature, "Content-Type": "application/json"},
            )
        if response.status_code in {409, 422}:
            raise HTTPException(
                response.status_code, "pharmacy requires prescription reconciliation"
            )
        if response.status_code != 200:
            raise HTTPException(503, "pharmacy handoff could not be confirmed")
        ack = ClinicalHandoffAck.model_validate(response.json())
        if not ack.matches(command):
            raise ValueError("mismatched acknowledgement")
        return ack
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, "pharmacy handoff could not be confirmed") from exc
