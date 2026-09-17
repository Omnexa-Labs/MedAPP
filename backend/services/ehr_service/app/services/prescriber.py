"""Fresh account and professional approval checks; JWT role alone is insufficient."""

from uuid import UUID

import httpx
from fastapi import Header, HTTPException
from pydantic import BaseModel

from ..config import settings
from .clinician_identity import ClinicianLookup


class VerifiedDoctor(BaseModel):
    user_id: UUID
    profile_id: UUID
    approval_id: UUID
    display_name: str


class PrescriberLookup:
    def __init__(self, authorization):
        self.authorization = authorization

    async def __call__(self, principal):
        if principal.role != "doctor":
            raise HTTPException(403, "only verified doctors may prescribe")
        user = await ClinicianLookup(self.authorization)(UUID(principal.subject))
        if user.role != "doctor":
            raise HTTPException(403, "only verified doctors may prescribe")
        try:
            async with httpx.AsyncClient(
                timeout=5, follow_redirects=False, trust_env=False
            ) as client:
                response = await client.get(
                    settings.doctor_service_url.rstrip("/")
                    + "/v1/doctors/me/prescribing-eligibility",
                    headers={"Authorization": self.authorization},
                )
            if response.status_code in {401, 403, 404}:
                raise HTTPException(
                    403, "an active, approved doctor profile is required to prescribe"
                )
            if response.status_code != 200:
                raise HTTPException(503, "doctor approval could not be verified; try again")
            result = VerifiedDoctor.model_validate(
                {**response.json(), "display_name": user.display_name}
            )
            if result.user_id != user.user_id:
                raise ValueError("identity mismatch")
            return result
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise HTTPException(503, "doctor approval could not be verified; try again") from exc


def get_prescriber_lookup(authorization: str | None = Header(default=None)):
    return PrescriberLookup(authorization)
