from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession
from ..models.workspace import MedAppWorkspace
from ..seed import seed

router = APIRouter(prefix="/v1/dev", tags=["dev"])


@router.post("/seed", status_code=status.HTTP_201_CREATED)
async def run_seed(db: AsyncSession = DbSession):
    """Idempotent dev seed: pharmacy profile, 3 staff, 20 drugs+batches, 1 supplier."""
    if await db.scalar(select(MedAppWorkspace.id)):
        raise HTTPException(409, "development seed cannot modify a MedApp workspace")
    return await seed(db)
