"""Disposable loopback server fixture; never a production launch entry point."""

import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.compiler import compiles

BACKEND = Path(__file__).resolve().parents[1]
name, port = sys.argv[1], int(sys.argv[2])
sys.path.insert(0, str(BACKEND / "shared"))
service_folder = name if name == "api_gateway" else f"{name}_service"
service_path = BACKEND / "services" / service_folder
if not service_path.is_dir():
    raise RuntimeError("unknown integration service")
sys.path.insert(0, str(service_path))


@compiles(UUID, "sqlite")
def compile_uuid(element, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def compile_json(element, compiler, **kw):
    return "JSON"


from app.main import create_app  # noqa: E402

if name == "api_gateway":
    engine = None
elif name == "hms":
    from app.db import mgmt_engine as engine
else:
    from app.db import engine

app = create_app()
if name == "onboarding":
    from app.storage import get_storage

    class MemoryDocuments:
        def __init__(self):
            self.objects = {}

        async def write(self, key, data, content_type):
            self.objects[key] = data
            return "1"

        async def read(self, key, generation, maximum):
            return self.objects[key][: maximum + 1]

    storage = MemoryDocuments()
    app.dependency_overrides[get_storage] = lambda: storage


async def main():
    import uvicorn

    if engine is not None and os.getenv("MEDAPP_TEST_MIGRATED") != "1":
        from app.models import Base

        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    try:
        await uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
        ).serve()
    finally:
        if engine is not None:
            await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
