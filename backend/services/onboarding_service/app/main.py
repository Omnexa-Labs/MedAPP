import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from shared.observability import configure_logging, instrument_app
from sqlalchemy.orm.exc import StaleDataError

from .config import settings
from .db import SessionLocal
from .routers import onboarding
from .services.activation import run_worker
from .services.partner_service import PartnerOnboardingError


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    worker = asyncio.create_task(run_worker(SessionLocal)) if settings.activation_enabled else None
    try:
        yield
    finally:
        if worker:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker


def create_app() -> FastAPI:
    app = FastAPI(title="MedApp - Partner Onboarding Service", version="0.1.0", lifespan=lifespan)
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    app.include_router(onboarding.router)

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/v1/onboarding"):
            response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.exception_handler(PartnerOnboardingError)
    async def invalid_application(request: Request, exc: PartnerOnboardingError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(StaleDataError)
    async def stale_application(request: Request, exc: StaleDataError):
        return JSONResponse(
            status_code=412, content={"detail": "application changed; reload before saving"}
        )

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
