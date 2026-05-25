from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from shared.observability import configure_logging, instrument_app

from .config import settings
from .routers import (
    auth,
    batches,
    customers,
    dev_auth,
    drugs,
    integrations,
    prescriptions,
    purchase_orders,
    reports,
    sales,
    staff,
    suppliers,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    if settings.dev_mode:
        await _init_dev_db()
    yield


async def _init_dev_db() -> None:
    from shared.db import Base

    import app.models  # noqa: F401 — register all model classes on Base.metadata
    from .db import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def create_app() -> FastAPI:
    app = FastAPI(
        title="MedApp - Pharmacy Management System (Template)",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(
        app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint
    )

    origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(staff.router)
    app.include_router(suppliers.router)
    app.include_router(drugs.router)
    app.include_router(batches.router)
    app.include_router(purchase_orders.router)
    app.include_router(prescriptions.router)
    app.include_router(sales.router)
    app.include_router(customers.router)
    app.include_router(reports.router)
    app.include_router(integrations.router)

    if settings.dev_mode:
        app.include_router(dev_auth.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {
            "service": settings.service_name,
            "pharmacy": settings.pharmacy_name,
            "docs": "/docs",
        }

    return app


app = create_app()
