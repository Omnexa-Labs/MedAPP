from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth.jwt import issue_access_token, issue_refresh_token

from ..config import settings
from ..models import User
from ..schemas import LoginRequest, SignupRequest, TokenPair

_hasher = PasswordHasher()


class AuthError(Exception):
    pass


async def signup(db: AsyncSession, payload: SignupRequest) -> User:
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise AuthError("email already registered")
    user = User(
        email=payload.email,
        password_hash=_hasher.hash(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    await db.flush()
    return user


async def login(db: AsyncSession, payload: LoginRequest) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == payload.email))
    if not user:
        raise AuthError("invalid credentials")
    try:
        _hasher.verify(user.password_hash, payload.password)
    except VerifyMismatchError as exc:
        raise AuthError("invalid credentials") from exc
    return _issue_tokens(str(user.id), user.role)


def _issue_tokens(subject: str, role: str) -> TokenPair:
    return TokenPair(
        access_token=issue_access_token(
            subject=subject,
            role=role,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            ttl_minutes=settings.jwt_access_ttl_minutes,
        ),
        refresh_token=issue_refresh_token(
            subject=subject,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            ttl_days=settings.jwt_refresh_ttl_days,
        ),
    )
