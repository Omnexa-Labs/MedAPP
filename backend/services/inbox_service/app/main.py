import os
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI

from shared.observability import configure_logging, instrument_app

from .config import settings
from .routers import attachments, root, threads

logger = structlog.get_logger()


def _check_attachment_storage() -> None:
    """Create the attachment root at boot and prove it is writable.

    THIS EXISTS BECAUSE THE FAILURE IT CATCHES SHIPPED ONCE. The attachment
    volume was mounted at a path the image did not contain, so Docker created
    it root-owned while the container runs as UID 10001. The service started
    clean, `/healthz` was green, every text message worked — and every upload
    returned a 500 with `PermissionError` buried in the logs. Nothing surfaced
    the problem until someone tried to send a voice note.

    It LOGS rather than raising. Attachments are one feature of this service;
    messaging is the rest of it, and refusing to boot would turn "voice notes
    are broken" into "the inbox is down". The log line is loud, names the path,
    and says what to do.
    """
    root_path = Path(settings.attachment_root)
    try:
        root_path.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not os.access(root_path, os.W_OK):
            raise PermissionError(f"{root_path} is not writable")
    except OSError as exc:
        logger.error(
            "attachment_storage_unusable",
            path=str(root_path),
            error=str(exc),
            uid=os.getuid() if hasattr(os, "getuid") else None,
            remedy=(
                "EVERY UPLOAD WILL RETURN 500. The mounted volume must be writable by the container "
                "user (UID 10001). In compose, mount the volume at /app/var — which the image creates "
                "and chowns — not at a deeper path Docker would create as root."
            ),
        )
    else:
        logger.info("attachment_storage_ready", path=str(root_path))


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    _check_attachment_storage()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="MedApp - Inbox Service", version="0.1.0", lifespan=lifespan)
    instrument_app(app, service_name=settings.service_name, otlp_endpoint=settings.otlp_endpoint)
    app.include_router(root.router)
    app.include_router(threads.router)
    # Attachments share the /v1/threads prefix. NOTE: no StaticFiles mount is
    # added here and none should be — the attachment volume must not be
    # reachable except through the authorised handler in `routers/attachments.py`.
    app.include_router(attachments.router)

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.service_name}

    return app


app = create_app()