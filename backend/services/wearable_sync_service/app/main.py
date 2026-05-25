import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from shared.events import drain_outbox
from shared.observability import configure_logging, instrument_app

from . import events
from .config import settings
from .db import SessionLocal
from .routers import router as wearables_router

logger = logging.getLogger(__name__)


# Audit finding B-20: how often the background worker drains the outbox.
# 5s is fast enough that downstream consumers see events within seconds
# of the API response, and slow enough that an idle service isn't busy-
# looping. Configurable via env if needed.
_DRAIN_INTERVAL_SECONDS = 5


async def _drain_outbox_loop(app: FastAPI) -> None:
    """Periodically drain the outbox until cancelled.

    The loop is robust: if the bus is unset (rabbit unreachable at boot),
    we just sleep and retry — the outbox row stays put. If `drain_outbox`
    raises (DB error), we log and sleep.
    """
    while True:
        try:
            await asyncio.sleep(_DRAIN_INTERVAL_SECONDS)
            bus = getattr(app.state, "event_bus", None)
            if bus is None:
                continue
            async with SessionLocal() as session:
                try:
                    published = await drain_outbox(session, bus)
                    if published:
                        await session.commit()
                except Exception:
                    await session.rollback()
                    raise
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("outbox_drain_loop.iteration_failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    app.state.http = httpx.AsyncClient(timeout=10.0)
    await events.init_bus(app)
    drain_task: asyncio.Task | None = None
    if settings.publish_events:
        # Only start the drain loop when publishing is enabled — keeps
        # tests / dev quiet when there's no broker to publish to.
        drain_task = asyncio.create_task(_drain_outbox_loop(app), name="outbox-drain")
    try:
        yield
    finally:
        if drain_task is not None:
            drain_task.cancel()
            try:
                await drain_task
            except (asyncio.CancelledError, Exception):
                pass
        await events.close_bus(app)
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