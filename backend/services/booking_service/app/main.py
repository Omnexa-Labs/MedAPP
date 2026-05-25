from contextlib import asynccontextmanager

from fastapi import FastAPI

from shared.observability import configure_logging, instrument_app

from .config import settings
from .routers import bookings, root
from .services import BookingRateLimiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="MedApp - Booking Service",
        version="0.1.0",
        lifespan=lifespan,
    )
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)

    # Audit finding B-22: single shared limiter per process. Tests swap
    # this instance via app.state to use a tighter window.
    app.state.booking_rate_limiter = BookingRateLimiter(
        max_calls=settings.create_rate_max,
        window_seconds=settings.create_rate_window_seconds,
    )

    app.include_router(root.router)
    app.include_router(bookings.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()
