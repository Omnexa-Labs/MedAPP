import os
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="module", autouse=True)
def _dev_env() -> None:
    os.environ["PMS_DEV_MODE"] = "true"
    os.environ["PMS_DEV_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def client() -> AsyncClient:
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_healthz_returns_ok(client: AsyncClient) -> None:
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "pms_service"


async def test_root_returns_service_info(client: AsyncClient) -> None:
    resp = await client.get("/")
    assert resp.status_code == 200
    assert resp.json()["service"] == "pms_service"
