from uuid import uuid4

import httpx
import pytest
from app import main
from app.config import settings
from fastapi.testclient import TestClient
from shared.auth.jwt import issue_access_token


@pytest.fixture
def bearer(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "gateway-onboarding-test-signing-key-only")
    return {
        "Authorization": "Bearer "
        + issue_access_token(subject=str(uuid4()), role="patient", secret=settings.jwt_secret)
    }


def test_credentials_preserve_body_version_and_response_metadata(bearer):
    body = b"%PDF-1.7 test credential"
    captured = []

    def upstream(request):
        captured.append(request)
        return httpx.Response(
            200, json={"version": 2}, headers={"ETag": '"2"', "Cache-Control": "private, no-store"}
        )

    app = main.create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        response = client.post(
            f"/v1/onboarding/applications/{uuid4()}/documents/upload?kind=medical_license",
            content=body,
            headers={**bearer, "If-Match": '"1"', "Content-Type": "application/pdf"},
        )
        assert response.status_code == 200 and response.headers["etag"] == '"2"'
        assert response.headers["cache-control"] == "private, no-store"
        assert captured[0].content == body and captured[0].headers["if-match"] == '"1"'
        assert captured[0].url.host == "onboarding_service"
        assert captured[0].url.params["kind"] == "medical_license"
        assert captured[0].extensions["timeout"]["read"] == 70.0


def test_chunked_upload_is_bounded_before_forwarding(bearer, monkeypatch):
    monkeypatch.setattr(main, "MAX_BODY_BYTES", 10)
    captured = []

    def upstream(request):
        captured.append(request)
        return httpx.Response(200)

    app = main.create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        response = client.post(
            f"/v1/onboarding/applications/{uuid4()}/documents/upload?kind=government_id",
            content=iter([b"%PDF-1.7", b"more than ten bytes"]),
            headers={**bearer, "Content-Type": "application/pdf", "If-Match": "1"},
        )
        assert response.status_code == 413 and not captured


def test_unauthed_credentials_never_reach_upstream():
    app = main.create_app()
    with TestClient(app) as client:
        response = client.post(
            f"/v1/onboarding/applications/{uuid4()}/documents/upload?kind=government_id",
            content=b"%PDF-1.7",
            headers={"Content-Type": "application/pdf", "If-Match": "1"},
        )
        assert response.status_code == 401


def test_onboarding_timeout_instructs_readback(bearer):
    def upstream(request):
        raise httpx.ReadTimeout("storage is slow", request=request)

    app = main.create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        response = client.post(
            f"/v1/onboarding/applications/{uuid4()}/submit",
            json={"attestation_accepted": True},
            headers={**bearer, "If-Match": "3"},
        )
        assert response.status_code == 504 and "reload" in response.text


def test_credential_download_and_cors_expose_named_headers(bearer, monkeypatch):
    monkeypatch.setattr(settings, "cors_origins", "https://partners.example.test")
    monkeypatch.setattr(settings, "cors_origin_regex", "")

    def upstream(request):
        return httpx.Response(
            200,
            content=b"%PDF-1.7",
            headers={
                "Content-Disposition": 'attachment; filename="credential.pdf"',
                "Content-Type": "application/pdf",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    app = main.create_app()
    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
        response = client.get(
            f"/v1/onboarding/applications/{uuid4()}/documents/{uuid4()}/content",
            headers={**bearer, "Origin": "https://partners.example.test"},
        )
        assert response.status_code == 200 and response.content == b"%PDF-1.7"
        assert response.headers["content-disposition"].startswith("attachment;")
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "etag" in response.headers["access-control-expose-headers"].lower()
        preflight = client.options(
            f"/v1/onboarding/applications/{uuid4()}",
            headers={
                "Origin": "https://partners.example.test",
                "Access-Control-Request-Method": "PATCH",
                "Access-Control-Request-Headers": "Authorization, If-Match, Content-Type",
            },
        )
        assert preflight.status_code == 200
