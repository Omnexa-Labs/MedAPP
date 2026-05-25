from fastapi import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import UserOut, UserUpdate

router = APIRouter()


# Audit finding C-9: belt-and-braces allowlist applied at the route handler
# in addition to the Pydantic `extra="forbid"` on `UserUpdate`. Anything not
# in this set is refused by `setattr`. If a new safe field is added to
# `UserUpdate`, it must also be added here.
_PATCHABLE_PROFILE_FIELDS: frozenset[str] = frozenset(
    {"first_name", "last_name", "dob", "gender", "allergies", "medical_history"}
)


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
    # Privileged fields (role, kyc_status, is_active, …) are blocked at the
    # schema layer; this loop's allowlist is a defensive second line so a
    # future schema change can never silently expose them.
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field not in _PATCHABLE_PROFILE_FIELDS:
            continue
        setattr(user, field, value)
    await db.flush()
    return UserOut.model_validate(user)
