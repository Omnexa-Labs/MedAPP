from fastapi.testclient import TestClient

from app.main import app


def test_healthz() -> None:
    c = TestClient(app)
    resp = c.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "pharmacist_service"}


def test_root() -> None:
    c = TestClient(app)
    resp = c.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"service": "pharmacist_service", "status": "ready"}
