from __future__ import annotations

from secrets import token_hex
from uuid import uuid4

import httpx
import pytest
from app.config import settings
from app.main import _resolve_upstream, create_app
from fastapi.testclient import TestClient
from shared.auth.jwt import issue_access_token


@pytest.fixture(autouse=True)
def signing_configuration(monkeypatch):
    # Tests supply a real signing configuration; runtime configuration stays required.
    monkeypatch.setattr(settings, "jwt_secret", token_hex(32))


def _token(role: str = "patient") -> str:
    return issue_access_token(
        subject=str(uuid4()),
        role=role,
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def test_gateway_routes_v1_prefixes_to_longest_match() -> None:
    assert _resolve_upstream("v1/auth/login") == settings.user_service_url
    assert _resolve_upstream("v1/admin/metrics/funnel") == settings.analytics_service_url
    assert _resolve_upstream("v1/me/inbox") == settings.notification_service_url
    assert _resolve_upstream("v1/onboarding/applications") == settings.onboarding_service_url
    assert _resolve_upstream("v1/wearables/sync") == settings.wearable_sync_service_url


def test_healthz() -> None:
    app = create_app()
    with TestClient(app) as client:
        resp = client.get("/healthz")
        assert resp.status_code == 200


def test_only_exact_public_photo_get_is_forwarded_without_token():
    pharmacy_id, photo_id = uuid4(), uuid4()
    path = f"/v1/pharmacies/{pharmacy_id}/photos/{photo_id}"
    captured = []
    def handler(request):
        captured.append(request)
        return httpx.Response(404, headers={"Cache-Control": "private, no-store"})
    with TestClient(create_app()) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        response = client.get(path)
        assert response.status_code == 404
        assert response.headers["cache-control"] == "private, no-store"
        assert len(captured) == 1
        for method, value in [("POST", path), ("DELETE", path), ("GET", path + "/extra"),
                              ("GET", f"/v1/pharmacies/{pharmacy_id}"),
                              ("GET", f"/v1/pharmacy-workspaces/{pharmacy_id}/profile/photos/{photo_id}")]:
            assert client.request(method, value).status_code == 401
        assert len(captured) == 1


def test_gateway_injects_request_id_and_strips_internal_headers() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"ok": True}, headers={"X-Upstream": "yes"})

    app = create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="http://upstream"
        )
        resp = client.get(
            "/v1/doctors",
            headers={
                "Authorization": f"Bearer {_token()}",
                "X-Internal-Test": "secret",
                "X-Request-Id": "req-123",
            },
        )
        assert resp.status_code == 200, resp.text
        assert resp.headers["X-Request-Id"] == "req-123"
        assert resp.headers["X-Upstream"] == "yes"
        headers = captured["headers"]
        assert headers["x-request-id"] == "req-123"
        assert "x-internal-test" not in headers
        assert captured["url"].endswith("/v1/doctors")


def test_gateway_requires_admin_token_for_admin_routes() -> None:
    app = create_app()
    with TestClient(app) as client:
        resp = client.get(
            "/v1/admin/metrics/funnel", headers={"Authorization": f"Bearer {_token('doctor')}"}
        )
        assert resp.status_code == 403


def test_auth_routes_allow_missing_token() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"token": "issued"})

    app = create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="http://upstream"
        )
        resp = client.post(
            "/v1/auth/login", json={"email": "patient@example.com", "password": "secret"}
        )
        assert resp.status_code == 200, resp.text
        assert captured["url"].endswith("/auth/login")


def test_auth_routes_are_rate_limited() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"token": "issued"})

    app = create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="http://upstream"
        )
        for _ in range(10):
            resp = client.post(
                "/v1/auth/login", json={"email": "patient@example.com", "password": "secret"}
            )
            assert resp.status_code == 200, resp.text

        resp = client.post(
            "/v1/auth/login", json={"email": "patient@example.com", "password": "secret"}
        )
        assert resp.status_code == 429
