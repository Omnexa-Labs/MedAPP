from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from threading import Lock
from uuid import uuid4

import httpx
import jwt
import structlog
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from shared.auth import Principal
from shared.observability import configure_logging, instrument_app

from .config import ROUTES, settings

MAX_BODY_BYTES = 10 * 1024 * 1024
PUBLIC_ROUTE_PREFIXES = ("/v1/auth", "/v1/webhooks")
BODY_SIZE_WHITELIST_PREFIXES = ("/v1/lab", "/v1/patients")
AUTH_ROUTE_LIMIT = 10
AUTH_ROUTE_WINDOW_SECONDS = 60

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
    matches = [prefix for prefix in ROUTES if normalized == prefix or normalized.startswith(prefix + "/")]
    if not matches:
        return None
    return ROUTES[max(matches, key=len)]


def _rewrite_path(path: str, upstream: str) -> str:
    normalized = path.lstrip("/")
    if upstream == settings.user_service_url and normalized.startswith("profile"):
        if normalized == "profile":
            return "v1/me"
        return "v1/me/" + normalized.removeprefix("profile/")
    return normalized


def _route_allows_public_access(path: str) -> bool:
    return path.startswith(PUBLIC_ROUTE_PREFIXES)


def _route_requires_admin(path: str) -> bool:
    return path.startswith("/v1/admin")


def _body_size_is_allowed(path: str) -> bool:
    return path.startswith(BODY_SIZE_WHITELIST_PREFIXES)


def _extract_principal_from_token(token: str) -> Principal:
    claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
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


async def _forward_request(request: Request, full_path: str, *, require_auth: bool = True) -> Response:
    upstream = _resolve_upstream(full_path)
    if upstream is None:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"error": "unknown route"})

    normalized_path = "/" + full_path.lstrip("/")
    if require_auth and not _route_allows_public_access(normalized_path):
        authorization = request.headers.get("authorization")
        if not authorization or not authorization.lower().startswith("bearer "):
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "missing bearer token"})
        token = authorization.split(" ", 1)[1]
        try:
            principal = _extract_principal_from_token(token)
        except Exception:  # noqa: BLE001
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "invalid token"})
        if _route_requires_admin(normalized_path) and principal.role not in {"admin", "platform_admin"}:
            return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"error": "admin access required"})

    path = _rewrite_path(full_path, upstream)
    url = f"{upstream}/{path}"
    headers = _sanitize_headers(request)
    for key in list(headers):
        if key.lower() == "x-request-id":
            headers.pop(key)
    headers["X-Request-Id"] = request.state.request_id
    body = await request.body()
    client: httpx.AsyncClient = request.app.state.http
    resp = await client.request(request.method, url, headers=headers, content=body, params=request.query_params)
    forwarded_headers = {
        key: value
        for key, value in resp.headers.items()
        if key.lower() not in {"content-length", "connection", "transfer-encoding", "content-encoding"}
    }
    return Response(content=resp.content, status_code=resp.status_code, headers=forwarded_headers)


def create_app() -> FastAPI:
    app = FastAPI(title="MedApp - API Gateway", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )
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
                    return JSONResponse(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, content={"error": "request body too large"})
            except ValueError:
                pass
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    @app.middleware("http")
    async def auth_rate_limit(request: Request, call_next):
        if request.url.path.startswith("/v1/auth") and not await _allow_auth_route(request):
            return JSONResponse(status_code=status.HTTP_429_TOO_MANY_REQUESTS, content={"error": "rate limit exceeded"})
        return await call_next(request)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    @app.api_route("/v1/auth", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    async def auth_root(request: Request) -> Response:
        return await _forward_request(request, "v1/auth", require_auth=False)

    @app.api_route("/v1/auth/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    async def auth_proxy(full_path: str, request: Request) -> Response:
        return await _forward_request(request, f"v1/auth/{full_path}", require_auth=False)

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    async def proxy(full_path: str, request: Request) -> Response:
        return await _forward_request(request, full_path, require_auth=True)

    return app


app = create_app()
