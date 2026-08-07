from fastapi import APIRouter, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentUser, DbSession
from ..events import publish
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
    request: Request,
    payload: UserUpdate,
    user: User = CurrentUser,
    db: AsyncSession = DbSession,
) -> UserOut:
    before_name = f"{user.first_name} {user.last_name}".strip()

    # Only supplied fields are applied; absent fields remain untouched.
    # Privileged fields (role, kyc_status, is_active, …) are blocked at the
    # schema layer; this loop's allowlist is a defensive second line so a
    # future schema change can never silently expose them.
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field not in _PATCHABLE_PROFILE_FIELDS:
            continue
        setattr(user, field, value)
    await db.flush()

    # Announce a DISPLAY NAME change so denormalised copies can catch up.
    #
    # Other services snapshot the name at write time (social_service puts it on
    # every post and comment) because identity lives here and a read-time join
    # would be an N+1 across the network. The cost of that choice is staleness,
    # and staleness here is not cosmetic: someone who marries, corrects a
    # misspelling, or transitions would otherwise keep their old name on
    # everything they have ever written. Deadnaming a patient in a health app is
    # a harm, not a stale cache.
    #
    # Only fired when the name ACTUALLY changed — a PATCH that touches allergies
    # should not make every consumer rewrite its rows.
    new_name = f"{user.first_name} {user.last_name}".strip()
    if new_name != before_name:
        await publish(
            request.app,
            event_type="user.profile.updated",
            subject=str(user.id),
            data={"user_id": str(user.id), "display_name": new_name},
        )

    return UserOut.model_validate(user)
