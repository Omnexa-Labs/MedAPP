from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from shared.hospital_directory import DirectoryHistory, DirectoryView
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import select

from ..config import settings
from .staff_access import administrator


async def request_profile(db, principal, method, action="", payload=None, offset=0):
    tenant = await administrator(db, principal, writing=method != "GET")
    receipts = (
        await db.scalars(
            select(ActivationReceipt)
            .where(
                ActivationReceipt.resource_id == tenant.id,
                ActivationReceipt.role == "hospital",
            )
            .limit(2)
        )
    ).all()
    if len(receipts) != 1:
        raise HTTPException(
            409,
            "This hospital needs approval-record reconciliation before its profile can be managed.",
        )
    secret = settings.hospital_directory_secret.get_secret_value()
    if len(secret) < 32 or secret in {
        settings.jwt_secret,
        settings.workspace_session_secret.get_secret_value(),
        settings.onboarding_activation_secret.get_secret_value(),
    }:
        raise HTTPException(503, "Hospital profile management is not configured.")
    try:
        base = httpx.URL(settings.hospital_service_url)
        if (
            base.scheme not in {"http", "https"}
            or not base.host
            or base.username
            or base.password
            or base.query
            or base.fragment
            or base.path not in {"", "/"}
        ):
            raise ValueError("invalid service origin")
    except (ValueError, httpx.InvalidURL):
        raise HTTPException(503, "Hospital profile management is not configured.") from None
    if (method, action) not in {
        ("GET", ""),
        ("GET", "history"),
        ("PATCH", ""),
        ("POST", "publish"),
        ("POST", "withdraw"),
    }:
        raise HTTPException(400, "Unsupported hospital profile operation.")
    url = str(base).rstrip("/") + f"/internal/hospital-profiles/{tenant.id}"
    if action:
        url += f"/{action}"
    owner = str(receipts[0].applicant_id)
    kwargs = {"headers": {"X-Hospital-Directory-Secret": secret}}
    if method == "GET":
        kwargs["params"] = {"owner_user_id": owner}
        if action == "history":
            kwargs["params"]["offset"] = offset
    else:
        kwargs["json"] = {
            **payload.model_dump(mode="json", exclude_unset=True),
            "actor_id": str(UUID(principal.subject)),
            "owner_user_id": owner,
        }
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.request(method, url, **kwargs)
    except httpx.HTTPError:
        raise HTTPException(
            503,
            "The hospital directory could not be reached. Reload the saved profile before retrying a change.",
        ) from None
    if response.status_code == 404:
        raise HTTPException(
            404, "The approved hospital profile is unavailable. Contact support for reconciliation."
        )
    if response.status_code == 409:
        raise HTTPException(
            409,
            "The profile changed or its name conflicts with another hospital. Reload the saved profile and review your edits.",
        )
    if response.status_code == 422:
        try:
            detail = response.json().get("detail")
            if not isinstance(detail, list):
                raise ValueError("invalid validation response")
            public = [
                {
                    "loc": [str(part)[:80] for part in item.get("loc", [])[:4]],
                    "msg": str(item.get("msg", "Invalid profile field."))[:500].replace(
                        secret, "[redacted]"
                    ),
                    "type": "profile_validation",
                }
                for item in detail[:30]
                if isinstance(item, dict)
            ]
        except (ValueError, AttributeError, TypeError):
            public = "The hospital profile could not be validated. Review the entered details."
        raise HTTPException(422, public)
    if response.status_code != 200 or len(response.content) > 512_000:
        raise HTTPException(
            503,
            "Hospital profile management is temporarily unavailable. Reload before retrying a change.",
        )
    try:
        model = DirectoryHistory if action == "history" else DirectoryView
        result = model.model_validate(response.json())
        if action != "history" and result.hospital_id != tenant.id:
            raise ValueError("mismatched hospital profile")
        return result
    except (ValueError, ValidationError):
        raise HTTPException(502, "The directory returned an invalid hospital profile.") from None
