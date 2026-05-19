from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from shared.observability import configure_logging, instrument_app

from .config import settings
from .routers import router as wearables_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    app.state.http = httpx.AsyncClient(timeout=10.0)
    try:
        yield
    finally:
        await app.state.http.aclose()


def create_app() -> FastAPI:
    app = FastAPI(title="MedApp - Wearable Sync Service", version="0.1.0", lifespan=lifespan)
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    app.include_router(wearables_router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()