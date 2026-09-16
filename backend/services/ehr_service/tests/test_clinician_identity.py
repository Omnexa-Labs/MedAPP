from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from app.services.clinician_identity import ClinicianLookup


def mock_transport(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(
        **kwargs, transport=httpx.MockTransport(handler)))


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["doctor", "nurse"])
async def test_verified_identity_forwards_patient_bearer(monkeypatch, role):
    recipient = uuid4()
    def handler(request):
        assert request.headers["Authorization"] == "Bearer patient-token"
        assert request.url.path == f"/users/{recipient}"
        return httpx.Response(200, json={"user_id": str(recipient), "display_name": "Ama Mensah", "role": role})
    mock_transport(monkeypatch, handler)
    identity = await ClinicianLookup("Bearer patient-token")(recipient)
    assert identity.user_id == recipient and identity.role == role


@pytest.mark.asyncio
@pytest.mark.parametrize("upstream,body,expected", [
    (404, {}, 400), (401, {}, 401), (500, {}, 503), (302, {}, 503),
    (200, {"role": "patient"}, 400), (200, {"role": "doctor"}, 503),
    (200, [], 503),
    (200, {"role": "nurse", "user_id": str(uuid4()), "display_name": "Other"}, 503),
])
async def test_unverified_recipient_fails_closed(monkeypatch, upstream, body, expected):
    mock_transport(monkeypatch, lambda request: httpx.Response(upstream, json=body))
    with pytest.raises(HTTPException) as failure:
        await ClinicianLookup("Bearer patient-token")(uuid4())
    assert failure.value.status_code == expected


@pytest.mark.asyncio
async def test_timeout_and_missing_authorization_never_allow_sharing(monkeypatch):
    def timeout(request):
        raise httpx.ReadTimeout("unavailable", request=request)
    mock_transport(monkeypatch, timeout)
    with pytest.raises(HTTPException) as failure:
        await ClinicianLookup("Bearer patient-token")(uuid4())
    assert failure.value.status_code == 503
    with pytest.raises(HTTPException) as missing:
        await ClinicianLookup(None)(uuid4())
    assert missing.value.status_code == 401
