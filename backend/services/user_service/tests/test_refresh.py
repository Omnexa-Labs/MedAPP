import pytest

pytestmark = pytest.mark.asyncio


async def _signup_login(client):
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
    return r.json()


async def test_refresh_rotates_tokens(client):
    tokens = await _signup_login(client)
    r = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert new["access_token"]


async def test_old_refresh_token_cannot_be_reused(client):
    tokens = await _signup_login(client)
    await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    # Try to reuse the original refresh — must fail.
    r = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


async def test_reuse_revokes_chain(client):
    """Reusing an already-revoked refresh token revokes all active tokens."""
    tokens = await _signup_login(client)
    first_refresh = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    new_token = first_refresh.json()["refresh_token"]
    # Reuse the original (already-revoked) refresh
    await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    # Now the rotated one should also be revoked
    r = await client.post("/auth/refresh", json={"refresh_token": new_token})
    assert r.status_code == 401


async def test_logout_revokes_refresh(client):
    tokens = await _signup_login(client)
    r = await client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    after = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert after.status_code == 401


async def test_logout_is_idempotent(client):
    tokens = await _signup_login(client)
    await client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    r = await client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
