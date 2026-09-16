from contextlib import asynccontextmanager

from fastapi import FastAPI
from shared.observability import configure_logging, instrument_app

from . import events
from .config import settings
from .routers import (
    activation,
    admin,
    admin_sso,
    auth,
    hospital_handoff,
    kyc,
    otp,
    partner_handoff,
    password,
    pharmacy_handoff,
    profiles,
    provider_auth,
    sessions,
    two_factor,
    users,
)


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
    app.include_router(sessions.router, prefix="/me/sessions", tags=["sessions"])
    app.include_router(two_factor.router, prefix="/me/two-factor", tags=["two-factor"])
    app.include_router(two_factor.login_router, prefix="/auth/two-factor", tags=["auth"])
    app.include_router(provider_auth.router, prefix="/auth/providers", tags=["auth"])
    app.include_router(admin_sso.router, prefix="/auth/admin-sso", tags=["auth"])
    app.include_router(partner_handoff.router, prefix="/auth/partner-handoffs", tags=["auth"])
    app.include_router(hospital_handoff.router, prefix="/auth/hospital-handoffs", tags=["auth"])
    app.include_router(pharmacy_handoff.router, prefix="/auth/pharmacy-handoffs", tags=["auth"])
    app.include_router(provider_auth.account_router, prefix="/me/providers", tags=["profile"])
    app.include_router(kyc.router, prefix="/me/kyc", tags=["kyc"])
    app.include_router(admin.router, prefix="/admin", tags=["admin"])
    # Service-to-service identity lookup. NOT in api_gateway ROUTES on purpose -
    # see the module docstring: a public look-up-any-user-by-id is a patient
    # enumeration surface.
    app.include_router(users.router, prefix="/users", tags=["users"])
    app.include_router(activation.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        # Keep health checks dependency-free so they stay fast and reliable.
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
