from __future__ import annotations

from uuid import uuid4

import httpx
import jwt
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app, _resolve_upstream


def _token(role: str = "patient") -> str:
    return jwt.encode({"sub": str(uuid4()), "role": role}, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def test_gateway_routes_v1_prefixes_to_longest_match() -> None:
    assert _resolve_upstream("v1/auth/login") == settings.user_service_url
    assert _resolve_upstream("v1/admin/metrics/funnel") == settings.analytics_service_url
    assert _resolve_upstream("v1/me/inbox") == settings.notification_service_url
    assert _resolve_upstream("v1/onboarding/applications") == settings.onboarding_service_url


def test_healthz() -> None:
    app = create_app()
    with TestClient(app) as client:
        resp = client.get("/healthz")
        assert resp.status_code == 200


def test_gateway_injects_request_id_and_strips_internal_headers() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"ok": True}, headers={"X-Upstream": "yes"})

    app = create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://upstream")
        resp = client.get(
            "/v1/doctors",
            headers={"Authorization": f"Bearer {_token()}", "X-Internal-Test": "secret", "X-Request-Id": "req-123"},
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
        resp = client.get("/v1/admin/metrics/funnel", headers={"Authorization": f"Bearer {_token('doctor')}"})
        assert resp.status_code == 403


def test_auth_routes_allow_missing_token() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"token": "issued"})

    app = create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://upstream")
        resp = client.post("/v1/auth/login", json={"email": "patient@example.com", "password": "secret"})
        assert resp.status_code == 200, resp.text
        assert captured["url"].endswith("/v1/auth/login")


def test_auth_routes_are_rate_limited() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"token": "issued"})

    app = create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://upstream")
        for _ in range(10):
            resp = client.post("/v1/auth/login", json={"email": "patient@example.com", "password": "secret"})
            assert resp.status_code == 200, resp.text

        resp = client.post("/v1/auth/login", json={"email": "patient@example.com", "password": "secret"})
        assert resp.status_code == 429