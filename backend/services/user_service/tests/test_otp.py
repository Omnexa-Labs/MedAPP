import pytest

pytestmark = pytest.mark.asyncio


async def test_otp_full_flow(client, notifier):
    # Create a user with a phone first
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
            "phone": "+233241234567",
        },
    )
    r = await client.post(
        "/auth/otp/start", json={"phone": "+233241234567", "purpose": "login"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["sent"] is True
    assert len(notifier.sms) == 1
    sms_body = notifier.sms[0]["body"]
    # Body shape: "MedApp code: 123456"
    code = sms_body.rsplit(" ", 1)[-1]

    r = await client.post(
        "/auth/otp/verify",
        json={"phone": "+233241234567", "code": code, "purpose": "login"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


async def test_otp_wrong_code_is_400(client, notifier):
    await client.post(
        "/auth/signup",
        json={
            "email": "a@b.com",
            "password": "password123",
            "first_name": "T",
            "last_name": "U",
            "phone": "+233241234567",
        },
    )
    await client.post("/auth/otp/start", json={"phone": "+233241234567"})
    r = await client.post(
        "/auth/otp/verify",
        json={"phone": "+233241234567", "code": "000000", "purpose": "login"},
    )
    assert r.status_code == 400


async def test_otp_rejects_bad_phone_format(client):
    r = await client.post("/auth/otp/start", json={"phone": "0241234567"})
    assert r.status_code == 422
