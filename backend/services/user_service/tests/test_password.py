import pytest

pytestmark = pytest.mark.asyncio


async def test_forgot_returns_202_even_for_unknown_email(client):
    r = await client.post("/auth/password/forgot", json={"email": "nope@nope.com"})
    assert r.status_code == 202


async def test_change_password_then_login_with_new(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
        },
    )
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    token = r.json()["access_token"]

    r = await client.post(
        "/auth/password/change",
        headers={"authorization": f"Bearer {token}"},
        json={"current_password": "password123", "new_password": "newpassword456"},
    )
    assert r.status_code == 204

    # Old password fails
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    assert r.status_code == 401

    # New one works
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "newpassword456"})
    assert r.status_code == 200


async def test_change_password_wrong_current_is_400(client):
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
        },
    )
    r = await client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    token = r.json()["access_token"]

    r = await client.post(
        "/auth/password/change",
        headers={"authorization": f"Bearer {token}"},
        json={"current_password": "WRONG", "new_password": "newpassword456"},
    )
    assert r.status_code == 400
