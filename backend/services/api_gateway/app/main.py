from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response

from shared.observability import configure_logging, instrument_app

from .config import ROUTES, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    app.state.http = httpx.AsyncClient(timeout=10.0)
    try:
        yield
    finally:
        await app.state.http.aclose()


def create_app() -> FastAPI:
    app = FastAPI(title="MedApp - API Gateway", version="0.1.0", lifespan=lifespan)
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def proxy(full_path: str, request: Request) -> Response:
        upstream = _resolve_upstream(full_path)
        if upstream is None:
            return Response(status_code=404, content=b'{"error":"unknown route"}')

        url = f"{upstream}/{full_path}"
        headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
        body = await request.body()
        client: httpx.AsyncClient = request.app.state.http
        resp = await client.request(
            request.method, url, headers=headers, content=body, params=request.query_params
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers={k: v for k, v in resp.headers.items() if k.lower() not in {"content-length"}},
        )

    return app


def _resolve_upstream(path: str) -> str | None:
    leading = "/" + path.split("/", 1)[0]
    return ROUTES.get(leading)


app = create_app()
