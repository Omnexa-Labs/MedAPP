from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

# Audit finding B-2: every MedApp-issued token includes an `aud` (audience)
# and `iss` (issuer) claim so a token minted for the platform can be
# distinguished from any other JWT a service might encounter. Single
# platform audience by design — the cross-deployment risk (a staging
# token landing in prod) is what `aud` is closing, not within-platform
# cross-service confusion (which the `typ` claim already addresses).
DEFAULT_AUDIENCE = "medapp.platform"
DEFAULT_ISSUER = "medapp"


def issue_access_token(
    *,
    subject: str,
    role: str,
    secret: str,
    algorithm: str = "HS256",
    ttl_minutes: int = 15,
    audience: str = DEFAULT_AUDIENCE,
    issuer: str = DEFAULT_ISSUER,
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "aud": audience,
        "iss": issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def issue_refresh_token(
    *,
    subject: str,
    secret: str,
    algorithm: str = "HS256",
    ttl_days: int = 30,
    audience: str = DEFAULT_AUDIENCE,
    issuer: str = DEFAULT_ISSUER,
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": subject,
        "aud": audience,
        "iss": issuer,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=ttl_days)).timestamp()),
        "typ": "refresh",
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_token(
    token: str,
    *,
    secret: str,
    algorithm: str = "HS256",
    audience: str | None = None,
    issuer: str | None = None,
) -> dict[str, Any]:
    """Verify a JWT and return its claims.

    `algorithm` is pinned as a single-element list — `alg=none` cannot
    sneak through (audit finding B-3).

    `audience` and `issuer` are verified by PyJWT only when supplied —
    callers pass them when they want strict cross-deployment isolation.
    Pass `None` to skip the check. Current default keeps backward compat
    during the rollout; production callers should set both via env vars
    (`MEDAPP_DEFAULT_JWT_AUDIENCE` / `MEDAPP_DEFAULT_JWT_ISSUER`).
    """
    # AN EMPTY SECRET IS NEVER A VALID CONFIGURATION, AND PyJWT WILL HAPPILY
    # VERIFY AGAINST ONE. Measured, not assumed:
    #
    #   jwt.decode(jwt.encode({"sub": "attacker", "role": "admin"}, "", "HS256"),
    #              "", algorithms=["HS256"])
    #   -> {"sub": "attacker", "role": "admin"}
    #
    # PyJWT 2.12 emits `InsecureKeyLengthWarning` for a 0-byte HMAC key and then
    # proceeds. So a service whose `*_JWT_SECRET` env var is missing does not
    # reject requests — it accepts a token that ANYONE can mint, for ANY subject,
    # with ANY role, including admin. No account and no credential required.
    #
    # Sixteen services default `jwt_secret: str = ""` in their config and call
    # this function directly from their `deps.py`. Only `api_gateway` calls
    # `validate_jwt_secret` at boot, and that only RAISES in production — so a
    # dev, CI or staging deployment with one unset variable was silently
    # forgeable, and `validation.py`'s own comment claimed the opposite ("auth
    # will reject all requests").
    #
    # The guard lives HERE rather than in each service's startup because this is
    # the one function every service funnels through. A boot check protects the
    # services that remember to call it; this protects all of them.
    #
    # Deliberately a hard failure and not a 401: an unset secret is an operator
    # error, not a bad credential, and returning 401 would let a misconfigured
    # service look merely unauthorised while being wide open to a forged token.
    if not secret:
        raise ValueError(
            "refusing to verify a JWT against an empty secret — PyJWT would "
            "accept any forged token. Set the service's *_JWT_SECRET env var."
        )

    options = {
        "verify_aud": audience is not None,
        "verify_iss": issuer is not None,
    }
    return jwt.decode(
        token,
        secret,
        algorithms=[algorithm],
        audience=audience,
        issuer=issuer,
        options=options,
    )
