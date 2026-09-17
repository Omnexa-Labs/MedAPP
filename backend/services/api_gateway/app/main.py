import os
import re
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from threading import Lock
from uuid import UUID, uuid4

import httpx
import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from shared.auth import Principal, decode_token, validate_jwt_secret
from shared.observability import configure_logging, instrument_app
from starlette.responses import JSONResponse

from .config import ROUTES, settings

MAX_BODY_BYTES = 10 * 1024 * 1024
PUBLIC_ROUTE_PREFIXES = ("/v1/auth", "/v1/webhooks")
BODY_SIZE_WHITELIST_PREFIXES = ("/v1/lab", "/v1/patients")
AUTH_ROUTE_LIMIT = 10
AUTH_ROUTE_WINDOW_SECONDS = 60

# The user_service mints tokens with aud="medapp.platform" / iss="medapp"
# (see shared.auth.jwt). PyJWT defaults to verify_aud=True, so decoding
# without supplying the expected audience raises InvalidAudienceError on
# every valid token — that's how the gateway was returning 401 for tokens
# it had just forwarded the login for. Resolve the expected values from
# env, falling back to the platform defaults so the gateway accepts
# tokens its own user_service issued out of the box.
_EXPECTED_AUDIENCE = os.getenv("MEDAPP_DEFAULT_JWT_AUDIENCE", "medapp.platform")
_EXPECTED_ISSUER = os.getenv("MEDAPP_DEFAULT_JWT_ISSUER", "medapp")

_auth_route_requests: dict[str, deque[float]] = defaultdict(deque)
_auth_route_lock = Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    app.state.http = httpx.AsyncClient(timeout=10.0)
    try:
        yield
    finally:
        await app.state.http.aclose()


def _normalize_path(path: str) -> str:
    return "/" + path.lstrip("/")


def _resolve_upstream(path: str) -> str | None:
    normalized = _normalize_path(path)
    matches = [
        prefix for prefix in ROUTES if normalized == prefix or normalized.startswith(prefix + "/")
    ]
    if not matches:
        return None
    return ROUTES[max(matches, key=len)]


def _rewrite_path(path: str, upstream: str) -> str:
    normalized = path.lstrip("/")

    # The user_service is the only one not using /v1/ prefix in its internal routes.
    if upstream == settings.user_service_url and normalized.startswith("v1/"):
        normalized = normalized.removeprefix("v1/")

    # HMS and PMS are namespaced publicly (see ROUTES) because their own
    # prefixes collide with routes already in use — most dangerously
    # pms_service's "/v1/auth". The namespace is a GATEWAY concept only, so it
    # is removed here and the upstream sees its own unchanged path:
    #   /v1/hms/patients -> v1/patients
    if upstream == settings.hms_service_url and normalized.startswith("v1/hms"):
        normalized = "v1/" + normalized.removeprefix("v1/hms").lstrip("/")
        return normalized.rstrip("/")
    if upstream == settings.pms_service_url and normalized.startswith("v1/pms"):
        normalized = "v1/" + normalized.removeprefix("v1/pms").lstrip("/")
        return normalized.rstrip("/")

    if upstream == settings.user_service_url and normalized.startswith("profile"):
        if normalized == "profile":
            return "v1/me"
        return "v1/me/" + normalized.removeprefix("profile/")
    return normalized


def _route_allows_public_access(path: str, method: str = "GET") -> bool:
    # This exact POST uses deployment HMAC authentication in pharmacy_service.
    if method == "POST" and path == "/v1/pharmacy-sync/events":
        return True
    uuid = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    return path.startswith(PUBLIC_ROUTE_PREFIXES) or (
        method == "GET"
        and re.fullmatch(rf"/v1/pharmacies/{uuid}/photos/{uuid}", path) is not None
    )


def _route_requires_admin(path: str) -> bool:
    return path.startswith("/v1/admin")


def _body_size_is_allowed(path: str) -> bool:
    return path.startswith(BODY_SIZE_WHITELIST_PREFIXES)


def _extract_principal_from_token(token: str, path: str = "") -> Principal:
    try:
        claims = decode_token(
            token, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm,
            audience=_EXPECTED_AUDIENCE, issuer=_EXPECTED_ISSUER,
        )
    except Exception:
        secret = settings.hms_workspace_session_secret.get_secret_value()
        if (
            not (path == "/v1/hms" or path.startswith("/v1/hms/"))
            or len(secret) < 32
            or secret == settings.jwt_secret
        ):
            raise
        claims = decode_token(
            token, secret=secret, algorithm="HS256",
            audience=settings.hms_workspace_session_audience,
            issuer=settings.hms_workspace_session_issuer,
        )
        UUID(claims["sub"])
        UUID(claims["hospital_id"])
        if claims.get("role") != "hms_staff" or claims.get("typ") != "access" or "exp" not in claims:
            raise ValueError("invalid workspace token") from None
    return Principal(subject=str(claims["sub"]), role=str(claims["role"]))


def _sanitize_headers(request: Request) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        lowered = key.lower()
        if lowered in {"host", "content-length", "connection"}:
            continue
        if lowered.startswith("x-internal-") or lowered == "x-service-token":
            continue
        headers[key] = value
    return headers


def _client_key(request: Request) -> str:
    if request.client is None:
        return "unknown"
    return request.client.host or "unknown"


async def _allow_auth_route(request: Request) -> bool:
    current_time = datetime.now(UTC).timestamp()
    window_start = current_time - timedelta(seconds=AUTH_ROUTE_WINDOW_SECONDS).total_seconds()
    key = _client_key(request)

    with _auth_route_lock:
        entries = _auth_route_requests[key]
        while entries and entries[0] < window_start:
            entries.popleft()
        if len(entries) >= AUTH_ROUTE_LIMIT:
            return False
        entries.append(current_time)
        return True


async def _forward_request(
    request: Request, full_path: str, *, require_auth: bool = True
) -> Response:
    upstream = _resolve_upstream(full_path)
    if upstream is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND, content={"error": "unknown route"}
        )

    normalized_path = "/" + full_path.lstrip("/")
    if require_auth and not _route_allows_public_access(normalized_path, request.method):
        authorization = request.headers.get("authorization")
        if not authorization or not authorization.lower().startswith("bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "missing bearer token"}
            )
        token = authorization.split(" ", 1)[1]
        try:
            principal = _extract_principal_from_token(token, normalized_path)
        except Exception:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "invalid token"}
            )
        if _route_requires_admin(normalized_path) and principal.role not in {
            "admin",
            "platform_admin",
        }:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN, content={"error": "admin access required"}
            )

    path = _rewrite_path(full_path, upstream)
    url = f"{upstream}/{path}"
    headers = _sanitize_headers(request)
    for key in list(headers):
        if key.lower() == "x-request-id":
            headers.pop(key)
    headers["X-Request-Id"] = request.state.request_id
    onboarding_request = normalized_path == "/v1/onboarding" or normalized_path.startswith(
        "/v1/onboarding/"
    )
    if onboarding_request:
        # Content-Length may be absent or incorrect. Bound credential bodies here,
        # before the gateway buffers them; the owning service also enforces its cap.
        body_buffer = bytearray()
        async for chunk in request.stream():
            if len(body_buffer) + len(chunk) > MAX_BODY_BYTES:
                return JSONResponse(status_code=413, content={"error": "request body too large"})
            body_buffer.extend(chunk)
        body = bytes(body_buffer)
        headers.pop("transfer-encoding", None)
    else:
        body = await request.body()
    client: httpx.AsyncClient = request.app.state.http
    options = {"timeout": httpx.Timeout(70.0, connect=10.0)} if onboarding_request else {}
    try:
        resp = await client.request(
            request.method,
            url,
            headers=headers,
            content=body,
            params=request.query_params,
            **options,
        )
    except httpx.TimeoutException:
        if not onboarding_request:
            raise
        return JSONResponse(
            status_code=504,
            content={"error": "application service timed out; reload before retrying"},
            headers={"Cache-Control": "private, no-store"},
        )
    forwarded_headers = {
        key: value
        for key, value in resp.headers.items()
        if key.lower()
        not in {"content-length", "connection", "transfer-encoding", "content-encoding"}
    }
    return Response(content=resp.content, status_code=resp.status_code, headers=forwarded_headers)


def _parse_cors_origins(raw: str) -> list[str]:
    """Comma-separated origins, trimmed. Empty → no CORS middleware at all."""
    return [o.strip() for o in raw.split(",") if o.strip()]


def create_app() -> FastAPI:
    # Audit finding #2: refuse to boot with a known-weak JWT secret in
    # production. Outside production we log a warning so dev / CI keep
    # working with a fixed test secret.
    validate_jwt_secret(settings.jwt_secret, service_name=settings.service_name)

    app = FastAPI(title="MedApp - API Gateway", version="0.1.0", lifespan=lifespan)
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        structlog.contextvars.clear_contextvars()
        request_id = request.headers.get("x-request-id") or str(uuid4())
        request.state.request_id = request_id
        structlog.contextvars.bind_contextvars(request_id=request_id)
        content_length = request.headers.get("content-length")
        if content_length and not _body_size_is_allowed(request.url.path):
            try:
                if int(content_length) > MAX_BODY_BYTES:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"error": "request body too large"},
                    )
            except ValueError:
                pass
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    @app.middleware("http")
    async def auth_rate_limit(request: Request, call_next):
        if (
            request.method != "OPTIONS"
            and request.url.path.startswith("/v1/auth")
            and not await _allow_auth_route(request)
        ):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": "rate limit exceeded"},
            )
        return await call_next(request)

    # Added last so it's the outermost middleware.
    cors_origins = _parse_cors_origins(settings.cors_origins)
    cors_mw_kwargs: dict = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "expose_headers": ["*", "ETag", "Content-Disposition"],
        "max_age": 3600,
    }
    if settings.cors_origin_regex:
        cors_mw_kwargs["allow_origin_regex"] = settings.cors_origin_regex
        if cors_origins:
            cors_mw_kwargs["allow_origins"] = cors_origins
        app.add_middleware(CORSMiddleware, **cors_mw_kwargs)
    elif cors_origins:
        cors_mw_kwargs["allow_origins"] = cors_origins
        app.add_middleware(CORSMiddleware, **cors_mw_kwargs)
    else:
        # Dev fallback: allow everything from any origin.
        # Credentials must be false if using "*" for origins.
        cors_mw_kwargs["allow_origins"] = ["*"]
        cors_mw_kwargs["allow_credentials"] = False
        app.add_middleware(CORSMiddleware, **cors_mw_kwargs)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    @app.api_route("/v1/auth", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    async def auth_root(request: Request) -> Response:
        return await _forward_request(request, "v1/auth", require_auth=False)

    @app.api_route(
        "/v1/auth/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]
    )
    async def auth_proxy(full_path: str, request: Request) -> Response:
        return await _forward_request(request, f"v1/auth/{full_path}", require_auth=False)

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    async def proxy(full_path: str, request: Request) -> Response:
        return await _forward_request(request, full_path, require_auth=True)

    return app


app = create_app()
