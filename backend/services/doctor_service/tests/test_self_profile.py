from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.main import create_app
from app.deps import get_db
from app.models import DoctorProfile
from shared.auth import get_current_principal
from shared.auth import Principal

OWNER = UUID("11111111-1111-1111-1111-111111111111")
OTHER = UUID("22222222-2222-2222-2222-222222222222")

@pytest_asyncio.fixture
async def scoped_client(session_factory):
    app = create_app()
    identity = {"principal": Principal(subject=str(OWNER), role="doctor")}
    async def current():
        return identity["principal"]
    async def db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    app.dependency_overrides[get_current_principal] = current
    app.dependency_overrides[get_db] = db
    async with session_factory() as session:
        session.add_all([DoctorProfile(user_id=OWNER, first_name="Own", last_name="Profile", languages=["English"], is_listable=False), DoctorProfile(user_id=OTHER, first_name="Other", last_name="Profile", languages=[], is_listable=True)])
        await session.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client, identity

async def test_me_resolves_unlisted_owner_without_directory(scoped_client):
    client, _ = scoped_client
    response = await client.get("/v1/doctors/me", params={"user_id": str(OTHER)})
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == str(OWNER)
    assert body["doctor_id"] != str(OWNER)
    assert body["is_listable"] is False

async def test_patch_me_persists_only_own_profile(scoped_client):
    client, identity = scoped_client
    response = await client.patch("/v1/doctors/me", json={"bio": "Updated biography", "specialty": None, "languages": [" English ", "Twi", "Twi"], "is_listable": True})
    assert response.status_code == 200
    assert response.json()["languages"] == ["English", "Twi"]
    assert (await client.get("/v1/doctors/me")).json()["bio"] == "Updated biography"
    identity["principal"] = Principal(subject=str(OTHER), role="doctor")
    assert (await client.get("/v1/doctors/me")).json()["bio"] is None

@pytest.mark.parametrize("role", ["user", "patient", "hospital_admin", "pharmacist", "nurse"])
async def test_unrelated_roles_cannot_read_or_write(scoped_client, role):
    client, identity = scoped_client
    identity["principal"] = Principal(subject=str(OWNER), role=role)
    assert (await client.get("/v1/doctors/me")).status_code == 403
    assert (await client.patch("/v1/doctors/me", json={"bio": "tampered"})).status_code == 403

async def test_missing_profile_and_invalid_subject(scoped_client):
    client, identity = scoped_client
    identity["principal"] = Principal(subject=str(uuid4()), role="doctor")
    assert (await client.get("/v1/doctors/me")).status_code == 404
    identity["principal"] = Principal(subject="not-a-uuid", role="doctor")
    assert (await client.get("/v1/doctors/me")).status_code == 401

async def test_inactive_profile_can_be_read_but_not_changed(scoped_client, session_factory):
    client, _ = scoped_client
    body = (await client.get("/v1/doctors/me")).json()
    async with session_factory() as session:
        profile = await session.get(DoctorProfile, UUID(body["doctor_id"]))
        profile.is_active = False
        await session.commit()
    assert (await client.get("/v1/doctors/me")).json()["is_active"] is False
    assert (await client.patch("/v1/doctors/me", json={"is_listable": True})).status_code == 403
    assert (await client.get("/v1/doctors/" + body["doctor_id"])).status_code == 404

@pytest.mark.parametrize("payload", [{"user_id": str(OTHER)}, {"is_active": True}, {"role": "admin"}, {"first_name": None}, {"last_name": "  "}, {"languages": None}, {"languages": [" "]}, {"is_listable": None}, {"first_name": "x"*256}, {"bio": "x"*10001}])
async def test_rejects_privileged_and_invalid_fields(scoped_client, payload):
    client, _ = scoped_client
    assert (await client.patch("/v1/doctors/me", json=payload)).status_code == 422
    assert (await client.get("/v1/doctors/me")).json()["first_name"] == "Own"
