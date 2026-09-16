"""Resolve an owner's pharmacy through the directory and a deployment-specific credential."""

import secrets
from urllib.parse import urlsplit
from uuid import UUID

import httpx

from ..config import settings
from .two_factor_service import FactorError


def configuration(deployment_key):
    deployment = settings.pms_handoff_deployments.get(deployment_key)
    if not deployment:
        raise FactorError("Opening this pharmacy from MedApp is not configured yet.", 503)
    secret = deployment.handoff_secret.get_secret_value()
    other = [settings.jwt_secret]
    for value in [
        settings.partner_handoff_secret,
        settings.hms_handoff_secret,
        settings.onboarding_activation_secret,
    ]:
        if value:
            other.append(value.get_secret_value())
    if len(secret) < 32 or any(value and secrets.compare_digest(secret, value) for value in other):
        raise FactorError("Pharmacy handoff needs its own server credential.", 503)
    return deployment.web_origin, secret


async def destination(authorization: str, pharmacy_id: UUID):
    try:
        base = urlsplit(settings.pharmacy_service_url)
        if (
            base.scheme not in {"http", "https"}
            or not base.hostname
            or base.username
            or base.password
            or base.query
            or base.fragment
            or base.path not in {"", "/"}
        ):
            raise ValueError()
        async with httpx.AsyncClient(timeout=5, trust_env=False, follow_redirects=False) as client:
            response = await client.get(
                settings.pharmacy_service_url.rstrip("/")
                + f"/v1/pharmacy-workspaces/{pharmacy_id}/access",
                headers={"Authorization": authorization},
            )
    except (httpx.HTTPError, ValueError) as exc:
        raise FactorError("Pharmacy access could not be checked. Try again.", 503) from exc
    if response.status_code == 404:
        raise FactorError("This account does not have an active pharmacy workspace.", 404)
    if response.status_code != 200:
        raise FactorError("Pharmacy access could not be checked. Try again.", 503)
    try:
        value = response.json()
        if str(UUID(value["pharmacy_id"])) != str(pharmacy_id):
            raise ValueError()
        key = value["deployment_key"]
        if not isinstance(key, str):
            raise ValueError()
        origin, _ = configuration(key)
        if value["web_origin"] != origin:
            raise ValueError()
        return {"pharmacy_id": pharmacy_id, "deployment_key": key, "origin": origin}
    except (ValueError, KeyError, TypeError) as exc:
        raise FactorError("The pharmacy deployment could not be confirmed.", 503) from exc
