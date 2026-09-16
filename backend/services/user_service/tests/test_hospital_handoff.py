from datetime import timedelta

import pytest
from app.config import settings
from app.models import PartnerHandoff, User
from app.services import auth_service as auth
from pydantic import SecretStr
from sqlalchemy import select
from test_partner_handoff import account, code, headers

pytestmark = pytest.mark.asyncio
SECRET = "hospital-handoff-test-credential-2026-separate"
PARTNER = "partner-handoff-test-credential-2026-separate"
DEVICE = "a" * 64
STATE = "s" * 32


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "hms_handoff_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "hms_web_origin", "http://127.0.0.1:3001")
    monkeypatch.setattr(settings, "hms_return_uris", "medapp://hospital-workspaces")
    monkeypatch.setattr(settings, "partner_handoff_secret", SecretStr(PARTNER))
    monkeypatch.setattr(settings, "partner_web_origin", "http://127.0.0.1:3003")
    monkeypatch.setattr(settings, "partner_return_uris", "medapp://onboarding-status")


async def start(client, tokens, **extra):
    return await client.post(
        "/auth/hospital-handoffs",
        headers=headers(tokens),
        json={
            "return_uri": "medapp://hospital-workspaces",
            "return_state": STATE,
            **extra,
        },
    )


async def exchange(client, raw, stage="redeem", secret=SECRET, device=DEVICE):
    return await client.post(
        f"/auth/hospital-handoffs/{stage}",
        json={"code": raw},
        headers={
            "X-Hms-Handoff-Secret": secret,
            "X-Device-Id": device,
        },
    )


async def test_hospital_handoff_is_single_use_device_bound_and_does_not_grant_a_global_role(client):
    source = await account(client)
    issued = await start(client, source)
    raw = code(issued)
    assert issued.json()["url"].startswith("http://127.0.0.1:3001/handoff#code=")
    assert source["access_token"] not in issued.text and "?" not in issued.json()["url"]
    preview = await exchange(client, raw, "inspect")
    assert preview.status_code == 200 and "tokens" not in preview.json()
    redeemed = await exchange(client, raw)
    assert redeemed.status_code == 200, redeemed.text
    body = redeemed.json()
    assert body["destination"] == "/workspaces"
    assert body["return_url"] == f"medapp://hospital-workspaces?handoff_state={STATE}"
    previous = auth.decode_access_token(source["access_token"])
    current = auth.decode_access_token(body["tokens"]["access_token"])
    assert current["sub"] == previous["sub"] and current["role"] == previous["role"]
    assert current["sid"] != previous["sid"]
    assert (await exchange(client, raw)).status_code == 410
    refreshed = await client.post(
        "/auth/refresh",
        headers={"X-Device-Id": DEVICE},
        json={
            "refresh_token": body["tokens"]["refresh_token"],
        },
    )
    assert refreshed.status_code == 200
    assert (
        await client.post("/auth/logout", json={"refresh_token": refreshed.json()["refresh_token"]})
    ).status_code == 204
    assert (await client.get("/me", headers=headers(source))).status_code == 200


async def test_wrong_browser_device_revokes_the_handoff_session_family(client):
    raw = code(await start(client, await account(client)))
    tokens = (await exchange(client, raw)).json()["tokens"]
    for device in ["other", DEVICE]:
        response = await client.post(
            "/auth/refresh",
            headers={"X-Device-Id": device},
            json={"refresh_token": tokens["refresh_token"]},
        )
        assert response.status_code == 401


async def test_handoff_portals_cannot_inspect_redeem_or_cancel_each_others_proofs(client):
    source = await account(client)
    hospital = await start(client, source)
    partner = await client.post(
        "/auth/partner-handoffs",
        headers=headers(source),
        json={
            "return_uri": "medapp://onboarding-status",
            "return_state": STATE,
        },
    )
    assert (await exchange(client, code(partner), "inspect")).status_code == 410
    assert (await exchange(client, code(partner))).status_code == 410
    assert (
        await client.post(
            "/auth/partner-handoffs/redeem",
            headers={
                "X-Partner-Handoff-Secret": PARTNER,
            },
            json={"code": code(hospital)},
        )
    ).status_code == 410
    await client.delete(
        f"/auth/partner-handoffs/{hospital.json()['handoff_id']}", headers=headers(source)
    )
    assert (await exchange(client, code(hospital))).status_code == 200


async def test_server_secret_and_browser_device_are_required_before_consumption(client):
    raw = code(await start(client, await account(client)))
    assert (await exchange(client, raw, secret=PARTNER)).status_code == 403
    assert (await exchange(client, raw, device="")).status_code == 400
    assert (await exchange(client, raw)).status_code == 200


@pytest.mark.parametrize("change", ["expired", "inactive", "password", "logout", "cancel"])
async def test_changed_source_or_cancelled_link_cannot_create_a_hospital_session(
    client, db, change
):
    source = await account(client)
    issued = await start(client, source)
    record = await db.scalar(select(PartnerHandoff))
    if change == "expired":
        record.expires_at = auth._now() - timedelta(seconds=1)
    elif change == "inactive":
        (await db.get(User, record.user_id)).is_active = False
    elif change == "password":
        (await db.get(User, record.user_id)).password_hash = auth._hasher.hash("Changed123!")
    elif change == "logout":
        await client.post("/auth/logout", json={"refresh_token": source["refresh_token"]})
    elif change == "cancel":
        await client.delete(
            f"/auth/hospital-handoffs/{issued.json()['handoff_id']}", headers=headers(source)
        )
    await db.commit()
    assert (await exchange(client, code(issued))).status_code == 410


async def test_hospital_link_does_not_accept_application_targets_or_other_return_routes(client):
    source = await account(client)
    assert (
        await start(client, source, application_id="11111111-1111-4111-8111-111111111111")
    ).status_code == 422
    assert (await start(client, source, return_uri="medapp://onboarding-status")).status_code == 400


async def test_reusing_the_partner_server_secret_disables_hospital_handoff(client, monkeypatch):
    monkeypatch.setattr(settings, "hms_handoff_secret", SecretStr(PARTNER))
    assert (await start(client, await account(client))).status_code == 503
