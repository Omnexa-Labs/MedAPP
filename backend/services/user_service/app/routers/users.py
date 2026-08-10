"""Minimal user lookup by id — for SERVICE-TO-SERVICE identity resolution.

WHY THIS EXISTS
---------------
Other services store `author_user_id` / `sender_user_id` and nothing else, so
they cannot render "who wrote this" without asking user_service. social_service
needs it to denormalise `author_name` onto a post at write time; inbox_service
needs the same for a thread counterparty. Before this route there was no way to
look up any user but yourself (`GET /me`), so those features were blocked.

Per the CTO rule — create endpoints only if they do not exist — this one
genuinely did not. It is the minimum that unblocks identity resolution, and
nothing more.

NOT EXPOSED THROUGH THE GATEWAY, DELIBERATELY
---------------------------------------------
`api_gateway`'s ROUTES table is not given a `/v1/users` entry, so this is
reachable only on the compose network (`http://user_service:8001/users/{id}`)
and not from the internet or the mobile app.

That is the point. A public "look up any user by id" endpoint is an enumeration
surface: with sequential or leaked ids it turns into a directory of every
patient on the platform. Service-to-service callers already sit inside the
trust boundary and are the only consumers that need it. If the app ever needs
it directly, that is a separate decision with rate limiting and an explicit
threat model, not an incremental gateway line.

WHAT IT RETURNS, AND WHAT IT REFUSES TO
---------------------------------------
`display_name` and `role`. That is all.

NOT email, phone, dob, gender, kyc_status, medical_history, allergies or
consents. `UserOut` carries several of those and is the wrong schema here: this
answers "whose name goes on this post", not "tell me about this person". A
caller that needs more should say why.

There is NO avatar, because the `User` model has no avatar column — clinician
photos live on `doctor_service.photo_url`, not here. A consumer wanting an
avatar has to resolve it from the role-specific service. Returning a null
`avatar_url` from this route would imply the concept exists here and is merely
unset, which is worse than its absence.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import PublicUserOut

router = APIRouter()


@router.get("/{user_id}", response_model=PublicUserOut)
async def read_public_user(
    user_id: UUID,
    db: AsyncSession = DbSession,
    # AUTHENTICATED, even service-to-service. The compose network is a trust
    # boundary, not an authentication mechanism, and an unauthenticated lookup
    # would be reachable by anything that lands inside it.
    _caller: User = CurrentUser,
) -> PublicUserOut:
    user = await db.get(User, user_id)
    # 404 for inactive as well as missing. A deactivated account must not be
    # distinguishable from one that never existed — the difference is itself
    # information about a real person.
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    full_name = f"{user.first_name} {user.last_name}".strip()
    return PublicUserOut(
        user_id=user.id,
        display_name=full_name or "MedApp user",
        role=user.role,
    )
