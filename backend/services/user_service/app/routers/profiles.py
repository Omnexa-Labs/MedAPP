from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import UserOut, UserUpdate

router = APIRouter()


# The service mounts this router under "/me", so the resource path is just "/me".
@router.get("", response_model=UserOut)
async def me(user: User = CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


# PATCH "/me" updates the authenticated user's own profile.
@router.patch("", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> UserOut:
    # Only supplied fields are applied; absent fields remain untouched.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.flush()
    return UserOut.model_validate(user)
