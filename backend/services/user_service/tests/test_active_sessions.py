from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import RefreshToken
from app.services.auth_service import _hash_token, _now, decode_access_token

pytestmark = pytest.mark.asyncio


async def account(client, email="sessions@example.com"):
    result = await client.post("/auth/signup", json={"email": email, "password": "Password123!",
        "first_name": "Ama", "last_name": "Mensah"})
    assert result.status_code == 201, result.text
    return email


async def login(client, email, device="device-a"):
    result = await client.post("/auth/login", json={"email": email, "password": "Password123!"},
        headers={"X-Device-Id": device, "User-Agent": f"MedApp QA {device}"})
    assert result.status_code == 200, result.text
    return result.json()


def headers(tokens, device="device-a"):
    return {"Authorization": f"Bearer {tokens['access_token']}", "X-Device-Id": device}


async def rotate(client, tokens, device="device-a"):
    return await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]},
                             headers={"X-Device-Id": device})


async def test_session_listing_is_private_and_contains_only_safe_metadata(client):
    email = await account(client)
    first = await login(client, email)
    second = await login(client, email, "device-b")
    other = await login(client, await account(client, "other@example.com"), "device-c")
    response = await client.get("/me/sessions", headers=headers(first))
    assert response.status_code == 200, response.text
    page = response.json()
    assert len(page["items"]) == 2
    assert page["current_session_known"] is True
    assert page["sign_out_delay_seconds"] == 900
    assert sum(item["is_current"] for item in page["items"]) == 1
    assert next(item for item in page["items"] if item["is_current"])["id"] == decode_access_token(first["access_token"])["sid"]
    assert decode_access_token(other["access_token"])["sid"] not in str(page)
    for item in page["items"]:
        assert set(item) == {"id", "started_at", "last_refreshed_at", "expires_at", "user_agent", "ip_address", "is_current"}
    assert first["refresh_token"] not in response.text and second["refresh_token"] not in response.text
    assert (await client.get("/me/sessions")).status_code == 401


async def test_rotation_keeps_one_stable_session_and_stale_selection_revokes_it(client):
    email = await account(client)
    first = await login(client, email)
    observer = await login(client, email, "device-b")
    old_page = (await client.get("/me/sessions", headers=headers(first))).json()
    old = next(item for item in old_page["items"] if item["is_current"])
    rotated = await rotate(client, first)
    assert rotated.status_code == 200, rotated.text
    newest = rotated.json()
    page = (await client.get("/me/sessions", headers=headers(newest))).json()
    current = next(item for item in page["items"] if item["is_current"])
    assert len(page["items"]) == 2
    assert current["id"] == old["id"] and current["started_at"] == old["started_at"]
    revoked = await client.delete(f"/me/sessions/{old['id']}", headers=headers(observer, "device-b"))
    assert revoked.status_code == 200 and revoked.json()["current_session_revoked"] is False
    assert (await rotate(client, newest)).status_code == 401
    assert (await rotate(client, first)).status_code == 401
    # Attempts from the intentionally revoked family cannot eject the observer.
    assert (await rotate(client, observer, "device-b")).status_code == 200


async def test_revoke_current_is_idempotent_and_cannot_revoke_another_account(client):
    first = await login(client, await account(client))
    other = await login(client, await account(client, "other@example.com"))
    sid = decode_access_token(first["access_token"])["sid"]
    assert (await client.delete(f"/me/sessions/{sid}", headers=headers(other))).status_code == 404
    assert (await client.delete(f"/me/sessions/{uuid4()}", headers=headers(first))).status_code == 404
    for _ in range(2):
        response = await client.delete(f"/me/sessions/{sid}", headers=headers(first))
        assert response.status_code == 200 and response.json()["current_session_revoked"] is True
    assert (await rotate(client, other)).status_code == 200


async def test_logout_of_rotated_token_closes_family_but_preserves_other_session(client):
    email = await account(client)
    first = await login(client, email)
    other = await login(client, email, "device-b")
    newest = (await rotate(client, first)).json()
    assert (await client.post("/auth/logout", json={"refresh_token": first["refresh_token"]})).status_code == 204
    assert (await rotate(client, newest)).status_code == 401
    assert (await rotate(client, first)).status_code == 401
    assert (await rotate(client, other, "device-b")).status_code == 200


async def test_expired_sessions_are_excluded_and_pages_are_complete(client, session_factory):
    email = await account(client)
    tokens = [await login(client, email, f"device-{n}") for n in range(3)]
    async with session_factory() as db:
        row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(tokens[2]["refresh_token"])))
        row.expires_at = _now() - timedelta(seconds=1)
        await db.commit()
    first = (await client.get("/me/sessions?limit=1", headers=headers(tokens[0]))).json()
    second = (await client.get(f"/me/sessions?limit=1&offset={first['next_offset']}", headers=headers(tokens[0]))).json()
    assert first["next_offset"] == 1 and second["next_offset"] is None
    assert first["items"][0]["id"] != second["items"][0]["id"]


async def test_legacy_refresh_rows_upgrade_without_losing_the_selected_session(client, session_factory):
    tokens = await login(client, await account(client))
    async with session_factory() as db:
        row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(tokens["refresh_token"])))
        row.session_id = None
        row.session_started_at = None
        legacy_id = str(row.id)
        await db.commit()
    page = (await client.get("/me/sessions", headers=headers(tokens))).json()
    assert page["items"][0]["id"] == legacy_id
    newest = (await rotate(client, tokens)).json()
    assert decode_access_token(newest["access_token"])["sid"] == legacy_id
    assert (await client.delete(f"/me/sessions/{legacy_id}", headers=headers(newest))).status_code == 200
    assert (await rotate(client, newest)).status_code == 401
