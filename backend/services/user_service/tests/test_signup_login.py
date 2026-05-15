import pytest

pytestmark = pytest.mark.asyncio


async def _signup(client, **overrides):
    payload = {
        "email": "a@b.com",
        "password": "password123",
        "first_name": "Test",
        "last_name": "User",
        "role": "user",
        **overrides,
    }
    return await client.post("/auth/signup", json=payload)


async def test_signup_creates_user(client):
    r = await _signup(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "a@b.com"
    assert body["first_name"] == "Test"
    assert body["last_name"] == "User"
    assert body["role"] == "user"
    assert body["kyc_status"] == "not_required"
    assert body["is_active"] is True


async def test_signup_duplicate_email_returns_409(client):
    r1 = await _signup(client)
    assert r1.status_code == 201
    r2 = await _signup(client)
    assert r2.status_code == 409


async def test_signup_doctor_starts_pending_kyc(client):
    r = await _signup(client, email="d@b.com", role="doctor")
    assert r.status_code == 201
    assert r.json()["kyc_status"] == "pending"


async def test_signup_rejects_invalid_role(client):
    r = await _signup(client, email="x@b.com", role="god")
    assert r.status_code == 422


async def test_login_returns_token_pair(client):
    await _signup(client)
    r = await client.post(
        "/auth/login", json={"email": "a@b.com", "password": "password123"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["expires_in"] > 0


async def test_login_wrong_password_is_401(client):
    await _signup(client)
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "wrong"})
    assert r.status_code == 401


async def test_login_unknown_user_is_401(client):
    r = await client.post("/auth/login", json={"email": "no@one.com", "password": "x" * 10})
    assert r.status_code == 401
