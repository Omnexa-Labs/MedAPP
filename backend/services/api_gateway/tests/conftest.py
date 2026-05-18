from __future__ import annotations

import sys
from pathlib import Path

import pytest


TEST_ROOT = Path(__file__).resolve().parent
SERVICE_ROOT = TEST_ROOT.parent
BACKEND_ROOT = SERVICE_ROOT.parent.parent
SHARED_ROOT = BACKEND_ROOT / "shared"


def _is_other_service_path(value: str) -> bool:
    normalized = value.replace("\\", "/").lower()
    return "/backend/services/" in normalized and "/backend/services/api_gateway" not in normalized


sys.path = [entry for entry in sys.path if not _is_other_service_path(entry)]

for path in (SERVICE_ROOT, SHARED_ROOT):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)


@pytest.fixture(autouse=True)
def clear_auth_rate_limit_state():
    from app.main import _auth_route_requests

    _auth_route_requests.clear()
    yield
    _auth_route_requests.clear()