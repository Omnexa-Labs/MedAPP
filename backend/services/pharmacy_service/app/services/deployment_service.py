from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import HTTPException
from shared.onboarding.pharmacies import (
    PharmacyWorkspaceActivation,
    PharmacyWorkspaceResult,
    pharmacy_resource_id,
)
from shared.onboarding.receipts import command_hash, previous_receipt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..models import ActivationReceipt, PharmacyDeployment, PharmacyDeploymentEvent, PharmacyProfile


async def approved_profile(db, pharmacy_id):
    profile = await db.scalar(
        select(PharmacyProfile).where(PharmacyProfile.id == pharmacy_id).with_for_update()
    )
    receipt = await db.scalar(
        select(ActivationReceipt).where(
            ActivationReceipt.resource_id == pharmacy_id, ActivationReceipt.role == "pharmacy"
        )
    )
    if (
        not profile
        or not profile.is_active
        or not receipt
        or receipt.applicant_id != profile.user_id
    ):
        raise HTTPException(404, "approved pharmacy not found")
    return profile


def operator(principal):
    if principal.role != "admin":
        raise HTTPException(403, "administrator access required")
    try:
        return UUID(principal.subject)
    except ValueError:
        raise HTTPException(401, "invalid account") from None


async def assign_deployment(db, principal, pharmacy_id, key, version):
    actor = operator(principal)
    profile = await approved_profile(db, pharmacy_id)
    if profile.user_id == actor:
        raise HTTPException(403, "an independent administrator must assign the deployment")
    if key not in settings.pms_deployments:
        raise HTTPException(422, "configured deployment not found")
    binding = await db.scalar(
        select(PharmacyDeployment)
        .where(PharmacyDeployment.pharmacy_id == pharmacy_id)
        .with_for_update()
    )
    if version != (binding.version if binding else 0):
        raise HTTPException(412, "deployment assignment changed; reload before assigning")
    if binding:
        # Even an unconfirmed remote request may have committed. An assignment
        # is permanent; changing it needs an explicit migration/reconciliation.
        if binding.deployment_key != key:
            raise HTTPException(
                409, "deployment assignment is permanent; reconciliation is required"
            )
        return binding
    binding = PharmacyDeployment(pharmacy_id=pharmacy_id, deployment_key=key)
    db.add(binding)
    db.add(
        PharmacyDeploymentEvent(
            pharmacy_id=pharmacy_id,
            actor_id=actor,
            action="assigned",
            details={"deployment_key": key, "version": 1},
        )
    )
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(
            409, "deployment is already assigned; reload before continuing"
        ) from exc
    return binding


async def request_workspace(config, command):
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10, connect=3), follow_redirects=False, trust_env=False
        ) as client:
            response = await client.post(
                config.api_url + "/internal/pharmacy-activations",
                json=command.model_dump(mode="json"),
                headers={"X-Activation-Secret": config.activation_secret.get_secret_value()},
            )
    except httpx.RequestError:
        raise HTTPException(503, "workspace activation service is unavailable") from None
    if response.status_code != 200:
        if response.status_code in {401, 403}:
            raise HTTPException(403, "workspace activation configuration required")
        if response.status_code == 409:
            raise HTTPException(409, "workspace activation requires reconciliation")
        raise HTTPException(503, "workspace activation could not be confirmed")
    try:
        result = PharmacyWorkspaceResult.model_validate(response.json())
        if (
            result.application_id != command.application_id
            or result.applicant_id != command.applicant_id
            or result.resource_id != command.pharmacy_id
            or result.deployment_key != command.deployment_key
        ):
            raise ValueError()
    except ValueError:
        raise HTTPException(503, "workspace activation could not be confirmed") from None
    return result


async def activate_workspace(db, payload):
    pharmacy_id = pharmacy_resource_id(payload.application_id)
    profile = await approved_profile(db, pharmacy_id)
    receipt = await previous_receipt(db, payload)
    if not receipt or receipt.resource_id != pharmacy_id or profile.user_id != payload.applicant_id:
        raise HTTPException(409, "approved pharmacy identity could not be confirmed")
    binding = await db.scalar(
        select(PharmacyDeployment)
        .where(PharmacyDeployment.pharmacy_id == pharmacy_id)
        .with_for_update()
    )
    if not binding:
        raise HTTPException(409, "workspace_setup_required")
    config = settings.pms_deployments.get(binding.deployment_key)
    if not config:
        raise HTTPException(403, "workspace activation configuration required")
    command = PharmacyWorkspaceActivation(
        **payload.model_dump(), pharmacy_id=pharmacy_id, deployment_key=binding.deployment_key
    )
    digest = command_hash(command)
    if binding.request_hash and binding.request_hash != digest:
        raise HTTPException(409, "workspace approval changed; reconciliation is required")
    # Always ask PMS to confirm live access, including after a response was lost.
    result = await request_workspace(config, command)
    if not binding.activated_at:
        binding.activated_at = datetime.now(UTC)
        binding.request_hash = digest
        binding.version += 1
        db.add(
            PharmacyDeploymentEvent(
                pharmacy_id=pharmacy_id,
                actor_id=payload.reviewer_id,
                action="activated",
                details={"deployment_key": binding.deployment_key, "version": binding.version},
            )
        )
        await db.flush()
    return result
