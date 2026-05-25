"""JWT verification for agent endpoints.

The agents are downstream of `user_service`. The user logs into user_service,
receives a JWT, and includes it in the `Authorization: Bearer ...` header on
calls to agent `/chat` and `/analyze`. Agents verify that token and derive
the patient_id from the verified `sub` claim — **never** from the request
body. This closes audit finding #4 (IDOR via X-Patient-Id-from-body).

Wire format (HS256, mirrors user_service):

  {
    "sub": "<patient_uuid>",
    "role": "patient" | "admin" | ...,
    "iat": ...,
    "exp": ...
  }

The agents and user_service must share the same `jwt_secret`. This is a
known weakness of the symmetric-key model; the long-term fix (RS256 +
public-key fetch from user_service) is a follow-up ADR.

This module also provides `_validate_jwt_secret()` — called at startup by
`make_app`. In `ENV=production`, refusing to boot with an empty or known-weak
secret prevents the agent from silently accepting forged tokens.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any

import jwt
from fastapi import Header, HTTPException, status

logger = logging.getLogger(__name__)


# Defaults that have shipped in various places in the codebase. Refuse them
# at startup in production. Add new ones here as you find them in audits.
WEAK_JWT_SECRETS: frozenset[str] = frozenset(
    {
        "",
        "change-me",
        "change-me-change-me-change-me-change-me",
        "change-me-please-use-a-real-32-byte-secret",
        "change-me-in-production",
        "dev-secret-key-not-for-production",
        "dev-secret",
        "test-secret",
    }
)


@dataclass(frozen=True)
class Principal:
    """The verified identity behind a request.

    `subject` is the patient_id for patient tokens, or the operator_id for
    admin tokens. `role` controls cross-patient access.
    """

    subject: str
    role: str = "patient"
    claims: dict[str, Any] = field(default_factory=dict)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


# ── Decode / verify ─────────────────────────────────────────────────────────


def decode_token(
    token: str,
    *,
    secret: str,
    algorithm: str = "HS256",
) -> Principal:
    """Verify the token and return a `Principal`.

    Raises `jwt.InvalidTokenError` (or subclass) on any verification failure.
    Caller is responsible for converting these into HTTP responses.
    """
    if not secret:
        # Defensive — never verify against an empty secret. PyJWT does not
        # treat empty-string as "skip verification", but it's a footgun
        # worth catching loudly.
        raise jwt.InvalidTokenError("agent jwt_secret is not configured")
    payload = jwt.decode(token, secret, algorithms=[algorithm])
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise jwt.InvalidTokenError("token is missing required 'sub' claim")
    role = payload.get("role", "patient")
    if not isinstance(role, str):
        role = "patient"
    return Principal(subject=sub, role=role, claims=payload)


# ── FastAPI dependency factory ──────────────────────────────────────────────


def make_require_principal(jwt_secret: str, jwt_algorithm: str = "HS256"):
    """Build a FastAPI dependency that yields a `Principal` for each request.

    Returns 401 on missing / malformed / expired / invalid tokens, and 503
    when the agent itself is misconfigured (no secret). Bind once per app —
    each agent's `jwt_secret` produces its own dependency.
    """

    def _require_principal(authorization: str | None = Header(default=None)) -> Principal:
        if not jwt_secret:
            # The agent didn't fail-fast at startup (we're outside production);
            # be explicit instead of silently authenticating no one.
            logger.warning("auth.misconfigured request rejected because jwt_secret is empty")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="agent auth is not configured",
            )
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="missing Authorization header",
            )
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization must be a Bearer token",
            )
        token = authorization[len("Bearer ") :].strip()
        try:
            return decode_token(token, secret=jwt_secret, algorithm=jwt_algorithm)
        except jwt.ExpiredSignatureError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="token expired",
            ) from e
        except jwt.InvalidTokenError as e:
            # Don't echo the raw error — could leak secret-related info.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid token",
            ) from e

    return _require_principal


# ── Startup validation ──────────────────────────────────────────────────────


def validate_jwt_secret(jwt_secret: str, *, service_name: str) -> None:
    """Refuse to start with an unsafe secret in production.

    Outside production we only log — tests run with a fixed test-secret and
    developers need fast iteration. Production failures are loud because
    that's the only place a forged-token attack actually matters.
    """
    env = os.getenv("ENV", "").lower()
    if env == "production" and (not jwt_secret or jwt_secret in WEAK_JWT_SECRETS):
        raise RuntimeError(
            f"{service_name}: refusing to start in production with an empty or "
            "known-weak jwt_secret. Set <AGENT>_JWT_SECRET to a real value "
            "(see agents/README.md)."
        )
    if not jwt_secret:
        logger.warning(
            "auth.unconfigured service=%s jwt_secret_empty — /chat will reject all requests",
            service_name,
        )
    elif jwt_secret in WEAK_JWT_SECRETS:
        logger.warning(
            "auth.weak_secret service=%s — using a known-default jwt_secret; fine for tests, dangerous in production",
            service_name,
        )


# ── Test helper ─────────────────────────────────────────────────────────────


def issue_test_token(
    subject: str,
    *,
    secret: str,
    role: str = "patient",
    algorithm: str = "HS256",
    ttl_seconds: int = 300,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Mint a JWT for tests. Real tokens come from `user_service`.

    Kept here (not in a tests-only helper module) so per-service conftests
    can import it without reaching into the agents/tests package.
    """
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, secret, algorithm=algorithm)
