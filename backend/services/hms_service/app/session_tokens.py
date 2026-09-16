import time
from uuid import UUID, uuid4

import jwt
from fastapi import HTTPException
from shared.auth.jwt import decode_token

from .config import settings


def require_workspace_sessions():
    secret = settings.workspace_session_secret.get_secret_value()
    if (
        len(secret) < 32
        or len(settings.jwt_secret) < 32
        or secret == settings.jwt_secret
        or settings.dev_mode
    ):
        raise HTTPException(503, "production workspace sessions are not configured")
    return secret


def platform_claims(authorization):
    if not settings.jwt_secret:
        raise HTTPException(503, "auth not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    try:
        claims = decode_token(
            authorization.split(" ", 1)[1],
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
        UUID(claims["sub"])
        if (
            claims.get("typ") != "access"
            or "exp" not in claims
            or not isinstance(claims.get("role"), str)
            or not claims["role"]
        ):
            raise ValueError()
        return claims
    except Exception:
        raise HTTPException(401, "invalid token") from None


def workspace_claims(token):
    if settings.dev_mode:
        return decode_token(token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm)
    secret = require_workspace_sessions()
    claims = decode_token(
        token,
        secret=secret,
        algorithm="HS256",
        audience=settings.workspace_session_audience,
        issuer=settings.workspace_session_issuer,
    )
    if claims.get("typ") != "access" or claims.get("role") != "hms_staff" or "exp" not in claims:
        raise ValueError("invalid workspace session")
    UUID(claims["sub"])
    UUID(claims["hospital_id"])
    return claims


def issue_workspace_session(parent, hospital_id):
    secret = require_workspace_sessions()
    now = int(time.time())
    expires = min(int(parent["exp"]), now + 300)
    if expires <= now:
        raise HTTPException(401, "MedApp session expired")
    claims = {
        "sub": parent["sub"],
        "role": "hms_staff",
        "hospital_id": str(hospital_id),
        "aud": settings.workspace_session_audience,
        "iss": settings.workspace_session_issuer,
        "typ": "access",
        "iat": now,
        "exp": expires,
        "jti": str(uuid4()),
    }
    return jwt.encode(claims, secret, algorithm="HS256"), expires
