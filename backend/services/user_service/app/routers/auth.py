from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from .. import events
from ..deps import ClientIp, DbSession, UserAgent
from ..schemas import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    SignupRequest,
    TokenPair,
    UserOut,
)
from ..services import auth_service

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
) -> UserOut:
    try:
        user = await auth_service.signup(db, payload, ip=ip, user_agent=ua)
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
@router.post("/login", response_model=TokenPair)
async def login(
    payload: LoginRequest,
    db: AsyncSession = DbSession,
    ip: str | None = ClientIp,
    ua: str | None = UserAgent,
) -> TokenPair:
    try:
        _user, tokens = await auth_service.login(db, payload, ip=ip, user_agent=ua)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    return tokens


# Refresh is a token-rotation endpoint: the old refresh token is invalidated and a new
# pair is issued if the presented token is still valid.
@router.post("/refresh", response_model=TokenPair)
async def refresh(
    payload: RefreshRequest,
    db: AsyncSession = DbSession,
    ip: str | None = ClientIp,
    ua: str | None = UserAgent,
) -> TokenPair:
    try:
        return await auth_service.refresh(db, payload.refresh_token, ip=ip, user_agent=ua)
    except auth_service.AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc


# Logout is intentionally idempotent so clients can retry safely.
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, db: AsyncSession = DbSession) -> None:
    await auth_service.logout(db, payload.refresh_token)
