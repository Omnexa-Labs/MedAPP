from dataclasses import dataclass

from fastapi import Header, HTTPException, status

from .jwt import decode_token


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str


async def get_current_principal(
    authorization: str | None = Header(default=None),
) -> Principal:
    # The real secret/algorithm come from each service's config; the gateway also
    # validates the token. Services re-verify defensively using their own settings,
    # but for the shared dependency we trust the gateway-injected headers in dev.
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    # NB: services override this dep with their own configured secret.
    try:
        claims = decode_token(token, secret="change-me", algorithm="HS256")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))
