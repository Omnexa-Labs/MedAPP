import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from shared.observability import configure_logging, instrument_app

from .config import settings
from .middleware import TenantContextMiddleware
from .routers import (
    activation,
    appointments,
    billing,
    dashboard,
    dev_auth,
    hospital_directory,
    patients,
    pharmacy,
    staff,
    staff_access,
    tenants,
    workspace_sessions,
)
from .tenant import tenant_db_manager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    if settings.dev_mode:
        await _init_dev_db()
    yield
    await tenant_db_manager.close_all()


async def _init_dev_db():
    from shared.db import Base

    import app.models  # noqa: F401

    from .deps import _DevDB

    _DevDB.get_factory()
    async with _DevDB.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _validate_dev_mode() -> None:
    """Audit finding B-4: HMS's dev_auth router can mint admin tokens for
    any patient. The router only mounts when `settings.dev_mode` is True
    (good), but `HMS_DEV_MODE=true` can still be set in any environment
    via env vars. Production must refuse to boot with dev_mode on, even
    if a misconfigured deploy slips the flag through."""
    env = os.getenv("ENV", "").lower()
    if env == "production" and settings.dev_mode:
        raise RuntimeError(
            "hms_service: HMS_DEV_MODE=true is forbidden when ENV=production "
            "(dev_auth would mint admin tokens for any patient)"
        )
    if settings.dev_mode:
        logger.warning(
            "hms_service.dev_mode_enabled — dev_auth /v1/auth/login is mounted "
            "and will mint admin tokens for the dev hospital. Never enable "
            "in production."
        )


def create_app() -> FastAPI:
    _validate_dev_mode()
    app = FastAPI(
        title="MedApp - Hospital Management System",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    if settings.dev_mode:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:3001", "http://127.0.0.1:3001"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.add_middleware(TenantContextMiddleware)
    app.include_router(tenants.router)
    app.include_router(activation.router)
    app.include_router(workspace_sessions.router)
    app.include_router(patients.router)
    app.include_router(staff.router)
    app.include_router(staff_access.router)
    app.include_router(hospital_directory.router)
    app.include_router(appointments.router)
    app.include_router(pharmacy.router)
    app.include_router(billing.router)
    app.include_router(dashboard.router)

    if settings.dev_mode:
        app.include_router(dev_auth.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
