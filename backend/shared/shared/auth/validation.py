"""Startup validation for JWT secrets.

Audit finding #2: every backend service ships a `change-me` JWT secret as
its default. If any service forgets to override it, it accepts forged
tokens for every other service that shares the same default. This module
provides a single place to refuse unsafe defaults — same shape as the
agent-side helper in `agents/shared/auth.py`.

Usage:

    from shared.auth import validate_jwt_secret
    validate_jwt_secret(settings.jwt_secret, service_name=settings.service_name)

Place the call inside `create_app()` (or equivalent) so it runs once at
boot. In production (`ENV=production`) a weak default refuses to start.
Outside production it logs a loud warning — tests and local dev keep
running, but the operator knows the secret is dangerous.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


# Defaults that have shipped across the codebase. Refuse them at startup
# in production. Add new ones here as audits find them.
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


def validate_jwt_secret(jwt_secret: str, *, service_name: str) -> None:
    """Refuse to start with an unsafe JWT secret in production.

    Outside production we log a warning only — tests need fixed secrets
    and developers need fast iteration. Production failures are loud
    because that's the only place a forged-token attack actually matters.
    """
    env = os.getenv("ENV", "").lower()
    if env == "production" and jwt_secret in WEAK_JWT_SECRETS:
        raise RuntimeError(
            f"{service_name}: refusing to start in production with an empty "
            "or known-weak jwt_secret. Set the service's *_JWT_SECRET env "
            "var to a real value."
        )
    if not jwt_secret:
        logger.warning(
            "auth.unconfigured service=%s jwt_secret_empty — auth will reject all requests",
            service_name,
        )
    elif jwt_secret in WEAK_JWT_SECRETS:
        logger.warning(
            "auth.weak_secret service=%s — known-default jwt_secret; fine for tests, dangerous in production",
            service_name,
        )


__all__ = ["WEAK_JWT_SECRETS", "validate_jwt_secret"]
