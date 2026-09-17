from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared.observability import configure_logging, instrument_app

from . import events
from .config import settings
from .routers import medication_reminders, medications, prescriptions, records, root


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    await events.init_bus(app)
    try:
        yield
    finally:
        await events.close_bus(app)


def create_app() -> FastAPI:
    app = FastAPI(
        title="MedApp - EHR Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    app.include_router(root.router)
    app.include_router(records.router)
    app.include_router(prescriptions.router)
    app.include_router(medication_reminders.router)
    app.include_router(medications.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
