from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from shared.auth.jwt import decode_token

from .config import settings
from .deps import verify_staff_membership
from .tenant import tenant_context_var

log = logging.getLogger(__name__)

SKIP_PATHS = {"/healthz", "/readyz", "/docs", "/openapi.json", "/redoc"}


class TenantContextMiddleware(BaseHTTPMiddleware):
    """Resolve and bind the per-request tenant from the bearer token.

    Audit finding B-9: the JWT's ``hospital_id`` claim is a CLIENT-SUPPLIED
    value. The middleware MUST verify the (subject, hospital_id) pair maps
    to an active row in ``hms_staff_roles`` before binding it to
    ``tenant_context_var`` — otherwise any token holder can pivot into
    another tenant's database by minting a token with that tenant's id
    and hitting any route that uses ``get_tenant_db`` (even one that
    forgets to also depend on ``get_hms_principal``).

    Behaviour when verification fails: we leave ``tenant_context_var``
    UNSET. Routes that need tenant scope will raise 400 via
    ``get_tenant_db``; routes that don't (health, tenants admin) keep
    working. We do not return a 403 from the middleware so the
    route-level deps remain the single place that shape auth errors.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path.rstrip("/")
        if (
            path in SKIP_PATHS
            or path.startswith("/v1/tenants")
            or path.startswith("/v1/auth")
            or path.startswith("/v1/dev")
        ):
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            return await call_next(request)

        token = auth_header.split(" ", 1)[1]
        try:
            claims = decode_token(
                token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm
            )
        except Exception:
            return await call_next(request)

        subject = claims.get("sub")
        hospital_id = claims.get("hospital_id")
        if not (subject and hospital_id):
            return await call_next(request)

        if settings.dev_mode:
            # dev_mode is gated by HMS_DEV_MODE which production refuses
            # to boot with (see _validate_dev_mode in main.py). The dev
            # auth router (B-4) hands out tokens with arbitrary claims,
            # so verifying against hms_staff_roles here would force every
            # local dev session to seed staff rows first.
            verified = True
        else:
            verified = await verify_staff_membership(str(subject), str(hospital_id))

        if not verified:
            log.warning(
                "tenant_middleware.staff_role_unverified sub=%s hospital_id=%s path=%s",
                subject, hospital_id, path,
            )
            return await call_next(request)

        ctx_token = tenant_context_var.set(str(hospital_id))
        try:
            return await call_next(request)
        finally:
            tenant_context_var.reset(ctx_token)
