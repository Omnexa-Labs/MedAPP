from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from ..deps import CurrentPrincipal, DbSession
from ..models import User
from ..schemas import UserOut, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserOut)
async def me(
    principal: Principal = CurrentPrincipal,
    db: AsyncSession = DbSession,
) -> UserOut:
    user = await db.get(User, UUID(principal.subject))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    return UserOut.model_validate(user)


@router.put("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    principal: Principal = CurrentPrincipal,
    db: AsyncSession = DbSession,
) -> UserOut:
    user = await db.get(User, UUID(principal.subject))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.flush()
    return UserOut.model_validate(user)
