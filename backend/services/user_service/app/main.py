from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared.observability import configure_logging, instrument_app

from . import events
from .config import settings
from .routers import admin, auth, kyc, otp, password, profiles


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    await events.init_bus(app)
    try:
        yield
    finally:
        await events.close_bus(app)


def create_app() -> FastAPI:
    # Central application factory so tests and the ASGI entrypoint build the exact
    # same app wiring.
    app = FastAPI(
        title="MedApp — User Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    # Prefixes define the public surface of the service.
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(otp.router, prefix="/auth/otp", tags=["auth"])
    app.include_router(password.router, prefix="/auth/password", tags=["auth"])
    app.include_router(profiles.router, prefix="/me", tags=["profile"])
    app.include_router(kyc.router, prefix="/me/kyc", tags=["kyc"])
    app.include_router(admin.router, prefix="/admin", tags=["admin"])

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        # Keep health checks dependency-free so they stay fast and reliable.
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
