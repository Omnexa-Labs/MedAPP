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


# ── Audit finding C-9 regression: privileged fields must not be PATCHable. ──


async def test_patch_role_is_rejected(client):
    """A patient cannot escalate to admin via PATCH /me."""
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"role": "admin"},
    )
    # Pydantic `extra="forbid"` returns 422 with the offending field name.
    assert r.status_code == 422, r.text
    # And the role on the actual user is unchanged.
    me = await client.get("/me", headers={"authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["role"] != "admin"


async def test_patch_other_privileged_fields_rejected(client):
    """Same protection for kyc_status, is_active, email_verified, etc."""
    token = await _bearer(client)
    for field, value in [
        ("kyc_status", "approved"),
        ("is_active", False),
        ("email_verified", True),
        ("phone_verified", True),
        ("email", "imposter@example.com"),
    ]:
        r = await client.patch(
            "/me",
            headers={"authorization": f"Bearer {token}"},
            json={field: value},
        )
        assert r.status_code == 422, (
            f"PATCH /me with {field}={value!r} should be 422; got {r.status_code}"
        )


async def test_patch_mixed_safe_and_privileged_rejected(client):
    """A safe field plus a privileged field rejects the whole call atomically."""
    token = await _bearer(client)
    r = await client.patch(
        "/me",
        headers={"authorization": f"Bearer {token}"},
        json={"first_name": "Innocent", "role": "admin"},
    )
    assert r.status_code == 422
    # Confirm the safe field was NOT applied (atomic rejection).
    me = await client.get("/me", headers={"authorization": f"Bearer {token}"})
    assert me.json()["first_name"] != "Innocent"
