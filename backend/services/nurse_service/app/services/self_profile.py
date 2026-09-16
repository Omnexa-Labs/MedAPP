from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from shared.auth import Principal

from ..models import NurseProfile


async def get_self_profile(db: AsyncSession, principal: Principal) -> NurseProfile:
    """Resolve only the authenticated account, including its inactive profile."""
    if principal.role not in {"nurse", "admin"}:
        raise HTTPException(403, "nurse access required")
    try:
        owner = UUID(principal.subject)
    except ValueError as exc:
        raise HTTPException(401, "invalid principal subject") from exc
    profile = await db.scalar(select(NurseProfile).where(NurseProfile.user_id == owner))
    if profile is None:
        raise HTTPException(404, "nurse profile not found")
    return profile
