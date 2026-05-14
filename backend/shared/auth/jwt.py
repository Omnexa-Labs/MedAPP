from datetime import datetime, timedelta, timezone
from typing import Any

import jwt


def issue_access_token(
    *, subject: str, role: str, secret: str, algorithm: str = "HS256", ttl_minutes: int = 15
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def issue_refresh_token(
    *, subject: str, secret: str, algorithm: str = "HS256", ttl_days: int = 30
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=ttl_days)).timestamp()),
        "typ": "refresh",
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_token(token: str, *, secret: str, algorithm: str = "HS256") -> dict[str, Any]:
    return jwt.decode(token, secret, algorithms=[algorithm])
