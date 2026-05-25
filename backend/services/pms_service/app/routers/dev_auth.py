from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import DbSession
from ..seed import seed

router = APIRouter(prefix="/v1/dev", tags=["dev"])


@router.post("/seed", status_code=status.HTTP_201_CREATED)
async def run_seed(db: AsyncSession = DbSession):
    """Idempotent dev seed: pharmacy profile, 3 staff, 20 drugs+batches, 1 supplier."""
    return await seed(db)
