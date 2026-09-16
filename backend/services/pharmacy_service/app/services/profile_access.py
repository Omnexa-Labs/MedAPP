"""Require current owner access in the assigned PMS before managing public details."""

from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import select

from ..config import settings
from ..models import PharmacyDeployment
from .directory import pharmacy_record


async def current_owner(db, principal, pharmacy_id, authorization):
    try:
        owner = UUID(principal.subject)
    except (ValueError, TypeError):
        raise HTTPException(401, "Invalid MedApp account.") from None
    await pharmacy_record(db, pharmacy_id, owner)
    binding = await db.scalar(
        select(PharmacyDeployment).where(PharmacyDeployment.pharmacy_id == pharmacy_id)
    )
    deployment = settings.pms_deployments[binding.deployment_key]
    # No row lock is held while checking the remote account and membership.
    await check_pms_access(deployment.api_url, binding.deployment_key, pharmacy_id, authorization)
    return owner


async def check_pms_access(origin, deployment_key, pharmacy_id, authorization):
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10, connect=3), trust_env=False, follow_redirects=False
        ) as client:
            response = await client.post(
                origin + "/v1/auth/medapp-session", headers={"Authorization": authorization}
            )
            if response.status_code in {401, 403, 404}:
                raise HTTPException(403, "Current pharmacy owner access is required.")
            if response.status_code != 200:
                raise ValueError()
            proof = response.json()
            token = proof["access_token"]
            if (
                not isinstance(token, str)
                or not 10 <= len(token) <= 8192
                or proof.get("token_type") != "bearer"
            ):
                raise ValueError()
            response = await client.get(
                origin + "/v1/auth/context", headers={"Authorization": "Bearer " + token}
            )
            if response.status_code in {401, 403, 404}:
                raise HTTPException(403, "Current pharmacy owner access is required.")
            if response.status_code != 200:
                raise ValueError()
            value = response.json()
            if (
                str(UUID(value["pharmacy"]["id"])) != str(pharmacy_id)
                or value["pharmacy"]["deployment_key"] != deployment_key
                or value["user"]["role"] != "pharmacy_admin"
                or value["user"]["id"] != proof["user"]["id"]
            ):
                raise ValueError()
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
        raise HTTPException(503, "Pharmacy access could not be confirmed. Try again.") from None
