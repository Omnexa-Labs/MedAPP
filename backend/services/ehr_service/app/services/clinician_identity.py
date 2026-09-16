"""Resolve the recipient before granting EHR access; failures never create a grant."""
from uuid import UUID

import httpx
from fastapi import Header, HTTPException
from pydantic import ValidationError

from ..config import settings
from ..schemas.record import ClinicianIdentity


class ClinicianLookup:
    def __init__(self, authorization: str | None):
        self.authorization = authorization

    async def __call__(self, user_id: UUID) -> ClinicianIdentity:
        if not self.authorization:
            raise HTTPException(401, "sign in again before sharing")
        try:
            async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
                response = await client.get(f"{settings.user_service_url.rstrip('/')}/users/{user_id}",
                                            headers={"Authorization": self.authorization})
            if response.status_code == 404:
                raise HTTPException(400, "this clinician is no longer available")
            if response.status_code == 401:
                raise HTTPException(401, "sign in again before sharing")
            if response.status_code != 200:
                raise HTTPException(503, "could not verify the clinician; try again")
            body = response.json()
            if body.get("role") not in {"doctor", "nurse"}:
                raise HTTPException(400, "sharing requires an active doctor or nurse")
            identity = ClinicianIdentity.model_validate(body)
            if identity.user_id != user_id:
                raise HTTPException(503, "could not verify the clinician; try again")
            return identity
        except (httpx.HTTPError, ValidationError, ValueError, TypeError, AttributeError) as exc:
            raise HTTPException(503, "could not verify the clinician; try again") from exc


def get_clinician_lookup(authorization: str | None = Header(default=None)) -> ClinicianLookup:
    return ClinicianLookup(authorization)
