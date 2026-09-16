from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .contracts import ActivationResult
from .receipts import activation_lock, previous_receipt, record_receipt


async def activate_profile(db, command, model, expected_role):
    if command.role != expected_role:
        raise HTTPException(422, "activation role does not match this profile service")
    await activation_lock(db, command.applicant_id)
    receipt = await previous_receipt(db, command)
    profile = await db.scalar(
        select(model).where(model.user_id == command.applicant_id).with_for_update()
    )
    if profile and not profile.is_active:
        raise HTTPException(
            409, "the professional profile is inactive; administrator resolution is required"
        )
    if receipt:
        if not profile or profile.id != receipt.resource_id:
            raise HTTPException(409, "the recorded professional profile is no longer available")
    else:
        if profile is None:
            profile = model(
                user_id=command.applicant_id,
                first_name=command.first_name,
                last_name=command.last_name,
                specialty=command.specialty,
                is_active=True,
                is_listable=False,
            )
            db.add(profile)
        try:
            await db.flush()
            # Existing professional edits are preserved; approval does not reset them.
            record_receipt(db, command, profile.id)
            await db.flush()
        except IntegrityError as exc:
            raise HTTPException(503, "activation is settling; retry the same request") from exc
    return ActivationResult(
        application_id=command.application_id,
        applicant_id=command.applicant_id,
        role=command.role,
        resource_id=profile.id,
    )
