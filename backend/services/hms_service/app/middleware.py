from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from shared.auth.jwt import decode_token

from .config import settings
from .tenant import tenant_context_var

SKIP_PATHS = {"/healthz", "/readyz", "/docs", "/openapi.json", "/redoc"}


class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path.rstrip("/")
        if path in SKIP_PATHS or path.startswith("/v1/tenants") or path.startswith("/v1/auth") or path.startswith("/v1/dev"):
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

        hospital_id = claims.get("hospital_id")
        if hospital_id:
            token = tenant_context_var.set(str(hospital_id))
            try:
                return await call_next(request)
            finally:
                tenant_context_var.reset(token)

        return await call_next(request)
