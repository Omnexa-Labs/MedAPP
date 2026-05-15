import pytest

pytestmark = pytest.mark.asyncio


async def _bearer(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
        },
    )
    r = await client.post(
        "/auth/login", json={"email": "a@b.com", "password": "password123"}
    )
    return r.json()["access_token"]


async def test_me_requires_auth(client):
    r = await client.get("/me")
    assert r.status_code == 401


async def test_me_returns_profile(client):
    token = await _bearer(client)
    r = await client.get("/me", headers={"authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.com"


async def test_patch_me_updates_fields(client):
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"first_name": "Updated", "last_name": "User"},
    )
    assert r.status_code == 200
    assert r.json()["first_name"] == "Updated"
    assert r.json()["last_name"] == "User"


async def test_invalid_token_is_401(client):
    r = await client.get("/me", headers={"authorization": "Bearer garbage"})
    assert r.status_code == 401
