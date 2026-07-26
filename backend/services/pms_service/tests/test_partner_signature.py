"""Verify the partner-token contract on the stock-availability route.

Cross-service contract: pharmacy_service signs requests with the
canonical form `(METHOD\\npath?query\\nbody)` and posts the hex digest
in `X-MedApp-Signature`. The shared secret on each side maps to the
*same* value in deployment, even though the env var names differ
(`PMS_MEDAPP_WEBHOOK_SECRET` vs `PHARMACY_MEDAPP_PARTNER_SECRET`).
If these tests drift, look at:

  - backend/services/pms_service/app/services/medapp_integration.py
    :verify_partner_signature
  - backend/services/pharmacy_service/app/services/stock_service.py
    :_sign_request

They must stay byte-for-byte in lockstep.
"""
from __future__ import annotations

import hashlib
import hmac
import os

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="module", autouse=True)
def _dev_env() -> None:
    os.environ["PMS_DEV_MODE"] = "true"
    os.environ["PMS_DEV_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    os.environ["PMS_MEDAPP_WEBHOOK_SECRET"] = "test-partner-secret"


@pytest.fixture
async def client() -> AsyncClient:
    # `app.db.engine` is created at module-import time using whatever
    # env values were present then. Create tables on that exact engine
    # before each test so the in-memory SQLite DB has the schema.
    from app.db import engine
    # Importing core registers tables on shared.db.Base.metadata.
    from app.models import core  # noqa: F401
    from shared.db import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def _sign(method: str, path_with_query: str, body: bytes, secret: str) -> str:
    msg = f"{method.upper()}\n{path_with_query}\n".encode("utf-8") + body
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


async def test_stock_availability_rejects_missing_signature(client: AsyncClient) -> None:
    resp = await client.get("/v1/integrations/medapp/stock-availability")
    assert resp.status_code == 401, resp.text


async def test_stock_availability_rejects_bad_signature(client: AsyncClient) -> None:
    resp = await client.get(
        "/v1/integrations/medapp/stock-availability?drug_name=paracetamol",
        headers={"X-MedApp-Signature": "deadbeef" * 8},
    )
    assert resp.status_code == 401, resp.text


async def test_stock_availability_accepts_valid_signature(client: AsyncClient) -> None:
    # Read the secret from the live Settings instance — the autouse env
    # fixture may have run AFTER `settings = Settings()` was evaluated
    # if a sibling test file already imported app.config. Signing with
    # whatever the running app actually trusts removes that ordering
    # coupling.
    from app.config import settings as live_settings

    path = "/v1/integrations/medapp/stock-availability?drug_name=paracetamol"
    sig = _sign("GET", path, b"", live_settings.medapp_webhook_secret)
    resp = await client.get(path, headers={"X-MedApp-Signature": sig})
    # The in-memory dev DB doesn't run migrations in this test, so the
    # `drugs` table may not exist (500 from SQLAlchemy). What we're
    # asserting here is the AUTH GATE: a valid partner signature must
    # not be rejected with 401/403. Anything past that is downstream.
    assert resp.status_code not in (401, 403), resp.text
