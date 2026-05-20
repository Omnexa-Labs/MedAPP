from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from shared.observability import configure_logging, instrument_app

from .config import settings
from .middleware import TenantContextMiddleware
from .routers import appointments, billing, dashboard, patients, pharmacy, staff, tenants
from .routers import dev_auth
from .tenant import tenant_db_manager


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


def create_app() -> FastAPI:
    app = FastAPI(
        title="MedApp - Hospital Management System",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(
        app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint
    )
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
    app.include_router(patients.router)
    app.include_router(staff.router)
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
