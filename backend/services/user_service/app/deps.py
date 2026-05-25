from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import Principal

from .db import SessionLocal
from .models import User
from .services import EmailNotifier, LogEmailNotifier, LogSmsNotifier, SmsNotifier
from .services.auth_service import AuthError, decode_access_token


async def get_db() -> AsyncIterator[AsyncSession]:
    # One request gets one session. The dependency owns commit/rollback so callers
    # can focus on business logic instead of transaction plumbing.
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def get_user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def get_device_id(request: Request) -> str | None:
    """Per-install device id sent by the mobile client.

    Biometric Step 2: bind refresh tokens to a stable per-install id so a
    token exfiltrated from a backup cannot be replayed from another
    install. Returns None for clients that don't send it — handled by
    the auth service so old mobile builds still work during the rollout.
    """
    value = request.headers.get("x-device-id")
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed or len(trimmed) > 64:
        return None
    return trimmed


async def current_principal(
    authorization: str | None = Header(default=None),
) -> Principal:
    # Parse and verify the bearer token before any database work happens.
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_access_token(token)
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))


async def current_user(
    principal: Principal = Depends(current_principal),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Turn the JWT subject into a live user record so downstream handlers always
    # work with the latest DB state.
    user = await db.get(User, UUID(principal.subject))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or inactive")
    return user


def require_role(*roles: str):
    # Small RBAC helper used by admin-only routes.
    async def _check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return user

    return _check


def get_sms_notifier() -> SmsNotifier:
    """Overridable in tests via app.dependency_overrides."""
    return LogSmsNotifier()


def get_email_notifier() -> EmailNotifier:
    """Overridable in tests via app.dependency_overrides. Real impl (SES /
    SendGrid / SMTP) wires in at deploy time; until then the log notifier
    writes a structured event so dev/test flows work without provider keys."""
    return LogEmailNotifier()


CurrentPrincipal = Depends(current_principal)
CurrentUser = Depends(current_user)
DbSession = Depends(get_db)
ClientIp = Depends(get_client_ip)
UserAgent = Depends(get_user_agent)
DeviceId = Depends(get_device_id)
SmsDep = Depends(get_sms_notifier)
EmailDep = Depends(get_email_notifier)
