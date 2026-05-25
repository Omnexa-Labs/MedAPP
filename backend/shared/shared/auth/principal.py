import logging
import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from .jwt import decode_token

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str


async def get_current_principal(
    authorization: str | None = Header(default=None),
) -> Principal:
    """Default shared FastAPI dependency for JWT verification.

    Every service is expected to override this with its own
    `get_current_principal` that uses the service's own JWT secret —
    services do this in their `app/deps.py`. If a service forgets to
    override and this dependency runs, it reads the secret from
    `MEDAPP_DEFAULT_JWT_SECRET`. An unset / empty value returns 503
    rather than silently verifying against `"change-me"` as the previous
    version did (audit finding #2).

    Audit finding B-2: when `MEDAPP_DEFAULT_JWT_AUDIENCE` /
    `MEDAPP_DEFAULT_JWT_ISSUER` env vars are set, the token's `aud` and
    `iss` claims are verified by PyJWT. Default is no verification so
    existing services with no aud/iss configured keep working during
    the rollout — production environments should set both.
    """
    secret = os.getenv("MEDAPP_DEFAULT_JWT_SECRET", "")
    algorithm = os.getenv("MEDAPP_DEFAULT_JWT_ALGORITHM", "HS256")
    audience = os.getenv("MEDAPP_DEFAULT_JWT_AUDIENCE") or None
    issuer = os.getenv("MEDAPP_DEFAULT_JWT_ISSUER") or None

    if not secret:
        logger.warning(
            "auth.unconfigured shared get_current_principal invoked with no "
            "MEDAPP_DEFAULT_JWT_SECRET; service likely forgot to override "
            "the dependency"
        )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "auth not configured",
        )

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = decode_token(
            token,
            secret=secret,
            algorithm=algorithm,
            audience=audience,
            issuer=issuer,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))
