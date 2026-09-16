from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from app.services import profile_access
from fastapi import HTTPException

from tests.test_activation import command as activation_command
from tests.test_owner_workspaces import configured, owner


@pytest.fixture
def command(monkeypatch):
    return activation_command.__wrapped__(monkeypatch)


@pytest.fixture
async def workspace(client, command, session_factory, monkeypatch):
    pharmacy_id = await configured(client, command, session_factory)
    monkeypatch.setattr(profile_access, "check_pms_access", AsyncMock())
    client.headers["Authorization"] = "Bearer owner-session"
    return pharmacy_id, f"/v1/pharmacy-workspaces/{pharmacy_id}/profile"


COMPLETE = {
    "name": "Accra Care Pharmacy",
    "address_line1": "24 Oxford Street",
    "city": "Accra",
    "country": "Ghana",
    "phone": "+233200000000",
    "operating_hours": {
        day: "closed"
        for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    },
    "services_offered": ["Prescription refills", "Vaccinations"],
    "head_pharmacist_name": "Ama Mensah",
    "head_pharmacist_bio": "Community pharmacist.",
}


async def test_draft_publication_and_withdrawal_keep_patient_data_separate(client, workspace):
    pharmacy_id, path = workspace
    initial = await client.get(path)
    assert initial.status_code == 200, initial.text
    assert initial.json()["version"] == 1
    assert initial.headers["Cache-Control"] == "private, no-store"
    assert (await client.post(path + "/publish", json={"version": 1})).status_code == 422
    saved = await client.patch(path, json={"version": 1, "changes": COMPLETE})
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 2
    assert (await client.get(f"/v1/pharmacies/{pharmacy_id}")).status_code == 404
    published = await client.post(path + "/publish", json={"version": 2})
    assert published.status_code == 200, published.text
    live = (await client.get(f"/v1/pharmacies/{pharmacy_id}")).json()
    assert live["services_offered"] == COMPLETE["services_offered"]
    assert live["head_pharmacist_name"] == "Ama Mensah"
    assert not {"directory_draft", "directory_version", "user_id", "pms_base_url"} & live.keys()
    changed = await client.patch(path, json={"version": 3, "changes": {"name": "Unpublished name"}})
    assert changed.json()["published"]["name"] == COMPLETE["name"]
    assert (await client.get(f"/v1/pharmacies/{pharmacy_id}")).json()["name"] == COMPLETE["name"]
    assert (await client.post(path + "/withdraw", json={"version": 3})).status_code == 409
    withdrawn = await client.post(path + "/withdraw", json={"version": 4})
    assert withdrawn.status_code == 200
    assert withdrawn.json()["draft"]["name"] == "Unpublished name"
    assert (await client.get(f"/v1/pharmacies/{pharmacy_id}")).status_code == 404
    history = (await client.get(path + "/history")).json()
    assert [item["action"] for item in history["items"]] == [
        "profile.withdrawn",
        "draft.saved",
        "profile.published",
        "draft.saved",
    ]
    assert history["items"][0]["version"] == 5
    assert (await client.get(path + "/history?offset=20")).json() == {
        "items": [],
        "has_more": False,
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"license_number": "forged"},
        {"user_id": str(uuid4())},
        {"is_listable": True},
        {"slug": "other"},
        {"pms_base_url": "https://other.example"},
        {"services_offered": None},
        {"name": ""},
        {"name": None},
        {},
        {"operating_hours": {"monday": "25:00-26:00"}},
        {"operating_hours": {"monday": "08:00-08:00"}},
        {"operating_hours": {"holiday": "closed"}},
        {"latitude": 6},
        {"latitude": 91, "longitude": 2},
        {"email": "not-an-email"},
        {"website_url": "javascript:alert(1)"},
        {"photo_url": "http://photo.example/a.jpg"},
        {"photo_url": "https://user:secret@photo.example/a.jpg"},
    ],
)
async def test_rejects_invalid_or_protected_fields_without_changing_saved_version(
    client, workspace, changes
):
    _, path = workspace
    response = await client.patch(path, json={"version": 1, "changes": changes})
    assert response.status_code == 422, response.text
    assert (await client.get(path)).json()["version"] == 1


async def test_other_account_and_revoked_pms_owner_cannot_read_or_change(
    client, workspace, monkeypatch
):
    _, path = workspace
    owner(uuid4())
    assert (await client.get(path)).status_code == 404
    assert (await client.patch(path, json={"version": 1, "changes": COMPLETE})).status_code == 404
    owner()
    monkeypatch.setattr(
        profile_access,
        "check_pms_access",
        AsyncMock(side_effect=HTTPException(403, "Access revoked")),
    )
    assert (await client.get(path)).status_code == 403
    assert (await client.post(path + "/publish", json={"version": 1})).status_code == 403


async def test_stale_writes_cannot_overwrite_current_draft(client, workspace):
    _, path = workspace
    assert (await client.patch(path, json={"version": 1, "changes": COMPLETE})).status_code == 200
    response = await client.patch(path, json={"version": 1, "changes": {"name": "Stale"}})
    assert response.status_code == 409
    assert (await client.get(path)).json()["draft"]["name"] == COMPLETE["name"]


@pytest.mark.parametrize(
    "failure", [None, "expired", "wrong-pharmacy", "wrong-deployment", "wrong-role", "redirect"]
)
async def test_live_pms_access_checks_account_membership_and_destination(monkeypatch, failure):
    pharmacy_id, staff_id = uuid4(), str(uuid4())
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path.endswith("medapp-session"):
            if failure == "expired":
                return httpx.Response(401)
            if failure == "redirect":
                return httpx.Response(302, headers={"Location": "https://other.example"})
            return httpx.Response(
                200,
                json={
                    "access_token": "pharmacy-access-token",
                    "token_type": "bearer",
                    "user": {"id": staff_id},
                },
            )
        return httpx.Response(
            200,
            json={
                "pharmacy": {
                    "id": str(uuid4()) if failure == "wrong-pharmacy" else str(pharmacy_id),
                    "deployment_key": "other" if failure == "wrong-deployment" else "accra",
                },
                "user": {
                    "id": staff_id,
                    "role": "cashier" if failure == "wrong-role" else "pharmacy_admin",
                },
            },
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        profile_access.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    if failure:
        with pytest.raises(HTTPException):
            await profile_access.check_pms_access(
                "https://pms.example", "accra", pharmacy_id, "Bearer owner"
            )
    else:
        await profile_access.check_pms_access(
            "https://pms.example", "accra", pharmacy_id, "Bearer owner"
        )
        assert requests[0].headers["Authorization"] == "Bearer owner"
        assert requests[1].headers["Authorization"] == "Bearer pharmacy-access-token"
