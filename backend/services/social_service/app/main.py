from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared.observability import configure_logging, instrument_app

from .config import settings
from .events import close_consumer, init_consumer
from .routers import social, root


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    # Subscribes to user.profile.updated so denormalised author names do not go
    # stale. Non-fatal by design — see app/events/__init__.py.
    await init_consumer(app)
    yield
    await close_consumer(app)


def create_app() -> FastAPI:
    app = FastAPI(
        title="MedApp - Social Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    app.include_router(root.router)
    app.include_router(social.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
