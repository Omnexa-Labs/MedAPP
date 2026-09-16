"""Bootstrap sys.path so `shared` resolves when tests run from this
service's directory. Mirrors the conftest pattern in doctor_service /
nurse_service / hospital_service."""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Test modules may import settings before their fixtures run. Never create a
# global engine for a retained database during test collection.
os.environ["PMS_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["PMS_DEV_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

TEST_ROOT = Path(__file__).resolve().parent
SERVICE_ROOT = TEST_ROOT.parent
BACKEND_ROOT = SERVICE_ROOT.parent.parent
SHARED_ROOT = BACKEND_ROOT / "shared"

for path in (SERVICE_ROOT, SHARED_ROOT):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)


# Models use the Postgres UUID type. Without a compile hook, SQLite
# (used by the in-memory test DB) doesn't know how to render it.
from sqlalchemy.dialects.postgresql import UUID  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):
    return "CHAR(36)"
