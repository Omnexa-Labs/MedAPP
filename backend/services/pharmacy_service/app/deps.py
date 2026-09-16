from collections.abc import AsyncIterator

from fastapi import Depends
from shared.auth import get_current_principal
from sqlalchemy.ext.asyncio import AsyncSession

from .db import SessionLocal


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


CurrentPrincipal = Depends(get_current_principal)
DbSession = Depends(get_db)
