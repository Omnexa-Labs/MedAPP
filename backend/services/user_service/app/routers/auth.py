from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .. import events
from ..deps import ClientIp, DbSession, DeviceId, UserAgent
from ..schemas import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    SignupRequest,
    TokenPair,
    UserOut,
)
from ..services import auth_service
from ..schemas.two_factor import LoginChallenge
from ..services.two_factor_service import FactorError

router = APIRouter()


# Public auth routes stay thin: they call the service layer, map domain errors to HTTP,
# and keep event publishing after the transaction has been committed.
@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    db: AsyncSession = DbSession,
    ip: str | None = ClientIp,
    ua: str | None = UserAgent,
    device_id: str | None = DeviceId,
) -> UserOut:
    try:
        user = await auth_service.signup(db, payload, ip=ip, user_agent=ua, device_id=device_id)
    except FactorError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    # Commit before publishing so the event stream never outruns the database.
    await db.commit()
    await events.publish(
        request.app,
        event_type="user.registered",
        subject=str(user.id),
        data={"role": user.role, "email": user.email},
    )
    return UserOut.model_validate(user)


# Login verifies credentials and returns a new access/refresh pair.
@router.post("/login", response_model=TokenPair | LoginChallenge)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = DbSession,
    ip: str | None = ClientIp,
    ua: str | None = UserAgent,
    device_id: str | None = DeviceId,
) -> TokenPair | LoginChallenge | JSONResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        _user, tokens = await auth_service.login(
            db, payload, ip=ip, user_agent=ua, device_id=device_id
        )
    except FactorError as exc:
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)},
                            headers={"Cache-Control": "no-store"})
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    return tokens


# Refresh is a token-rotation endpoint: the old refresh token is invalidated
# and a new pair is issued if the presented token is still valid. Biometric
# Step 2: the X-Device-Id header must match the device the token was issued
# for (NULL on legacy rows is grandfathered).
@router.post("/refresh", response_model=TokenPair)
async def refresh(
    payload: RefreshRequest,
    request: Request,
    db: AsyncSession = DbSession,
    ip: str | None = ClientIp,
    ua: str | None = UserAgent,
    device_id: str | None = DeviceId,
) -> TokenPair:
    try:
        tokens, audit_meta = await auth_service.refresh(
            db,
            payload.refresh_token,
            ip=ip,
            user_agent=ua,
            device_id=device_id,
            biometric=payload.biometric,
        )
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    # Commit before publishing so a rabbit outage can't roll back the auth.
    await db.commit()
    if audit_meta.get("biometric_login"):
        await events.publish(
            request.app,
            event_type="user.biometric_login",
            subject=audit_meta["user_id"],
            data={"device_id": audit_meta.get("device_id")},
        )
    return tokens


# Logout is intentionally idempotent so clients can retry safely.
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: AsyncSession = DbSession) -> None:
    await auth_service.logout(db, payload.refresh_token)
