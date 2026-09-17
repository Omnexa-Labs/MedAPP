import httpx
from app.config import settings
from app.main import _resolve_upstream, _rewrite_path, create_app
from fastapi.testclient import TestClient


def test_exact_signed_delivery_post_reaches_receiver_but_patient_history_requires_login(
    monkeypatch,
):
    monkeypatch.setattr(settings, "jwt_secret", "gateway-pharmacy-sync-qa-secret-2026")
    captured = []

    def handler(request):
        captured.append(request)
        return httpx.Response(401, json={"detail": "Invalid delivery credentials."})

    with TestClient(create_app()) as client:
        client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        body = b'{"schema_version":1}'
        assert (
            client.post(
                "/v1/pharmacy-sync/events",
                content=body,
                headers={"X-MedApp-Deployment": "accra", "X-MedApp-Signature": "qa"},
            ).status_code
            == 401
        )
        assert len(captured) == 1
        assert captured[0].content == body and captured[0].headers["x-medapp-signature"] == "qa"
        assert str(captured[0].url) == settings.pharmacy_service_url + "/v1/pharmacy-sync/events"
        for method, path in [
            ("GET", "/v1/pharmacy-sync/events"),
            ("POST", "/v1/pharmacy-sync/events/extra"),
            ("GET", "/v1/me/pharmacy-prescriptions"),
        ]:
            assert client.request(method, path).status_code == 401
        assert len(captured) == 1
    assert _resolve_upstream("/v1/me/pharmacy-prescriptions") == settings.pharmacy_service_url
    assert (
        _rewrite_path("/v1/me/pharmacy-prescriptions", settings.pharmacy_service_url)
        == "v1/me/pharmacy-prescriptions"
    )
