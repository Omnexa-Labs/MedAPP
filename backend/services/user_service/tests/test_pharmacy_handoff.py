from datetime import timedelta
from uuid import UUID

import httpx
import pytest
from app.config import PmsHandoffDeployment, Settings, settings
from app.models import PartnerHandoff, User
from app.services import auth_service as auth
from app.services import pharmacy_handoff
from app.services.two_factor_service import FactorError
from pydantic import SecretStr, ValidationError
from sqlalchemy import select
from test_partner_handoff import account, code, headers

pytestmark = pytest.mark.asyncio
PHARMACY = UUID("22222222-2222-4222-8222-222222222222")
SECRET = "pharmacy-handoff-server-credential-only-2026"
OTHER = "other-pharmacy-handoff-credential-only-2026"
STATE = "s" * 32
DEVICE = "d" * 64
resolve_destination = pharmacy_handoff.destination


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(
        settings,
        "pms_handoff_deployments",
        {
            "accra": PmsHandoffDeployment(
                web_origin="https://pharmacy.example", handoff_secret=SECRET
            ),
            "kumasi": PmsHandoffDeployment(
                web_origin="https://other.example", handoff_secret=OTHER
            ),
        },
    )
    monkeypatch.setattr(settings, "pms_return_uris", "medapp://pharmacy-workspaces")
    monkeypatch.setattr(settings, "pharmacy_service_url", "http://directory.test")
    monkeypatch.setattr(
        settings, "partner_handoff_secret", SecretStr("partner-handoff-separate-credential-2026")
    )
    monkeypatch.setattr(settings, "partner_web_origin", "https://partner.example")

    async def destination(authorization, pharmacy_id):
        assert authorization.startswith("Bearer ")
        if pharmacy_id != PHARMACY:
            raise FactorError("Workspace unavailable", 404)
        origin, _ = pharmacy_handoff.configuration("accra")
        return {"pharmacy_id": pharmacy_id, "deployment_key": "accra", "origin": origin}

    monkeypatch.setattr(pharmacy_handoff, "destination", destination)


async def verified(client, db):
    tokens = await account(client)
    user = await db.get(User, UUID(auth.decode_access_token(tokens["access_token"])["sub"]))
    user.email_verified = True
    await db.commit()
    return tokens


async def start(client, source, **extra):
    return await client.post(
        "/auth/pharmacy-handoffs",
        headers=headers(source),
        json={
            "pharmacy_id": str(PHARMACY),
            "return_uri": "medapp://pharmacy-workspaces",
            "return_state": STATE,
            **extra,
        },
    )


async def exchange(client, raw, stage="redeem", key="accra", secret=SECRET):
    return await client.post(
        f"/auth/pharmacy-handoffs/{stage}",
        json={"code": raw},
        headers={
            "X-Pms-Deployment-Key": key,
            "X-Pms-Handoff-Secret": secret,
            "X-Device-Id": DEVICE,
        },
    )


async def test_handoff_binds_the_selected_pharmacy_and_mints_an_independent_device_session(
    client, db
):
    source = await verified(client, db)
    issued = await start(client, source)
    raw = code(issued)
    assert issued.json()["url"].startswith("https://pharmacy.example/handoff#code=")
    assert source["access_token"] not in issued.text and source["refresh_token"] not in issued.text
    record = await db.scalar(select(PartnerHandoff))
    assert record.pharmacy_id == PHARMACY and record.deployment_key == "accra"
    assert record.token_hash == auth._hash_token(raw)
    preview = await exchange(client, raw, "inspect")
    assert preview.status_code == 200 and "tokens" not in preview.json()
    assert preview.json()["pharmacy_id"] == str(PHARMACY)
    redeemed = await exchange(client, raw)
    assert redeemed.status_code == 200, redeemed.text
    value = redeemed.json()
    assert value["pharmacy_id"] == str(PHARMACY) and value["deployment_key"] == "accra"
    assert value["destination"] == "/dashboard"
    assert value["return_url"] == "medapp://pharmacy-workspaces?handoff_state=" + STATE
    parent, child = [
        auth.decode_access_token(v)
        for v in [source["access_token"], value["tokens"]["access_token"]]
    ]
    assert (
        parent["sub"] == child["sub"]
        and parent["sid"] != child["sid"]
        and parent["role"] == child["role"]
    )
    assert (await exchange(client, raw)).status_code == 410
    refresh = await client.post(
        "/auth/refresh",
        json={"refresh_token": value["tokens"]["refresh_token"]},
        headers={"X-Device-Id": DEVICE},
    )
    assert refresh.status_code == 200
    assert (
        await client.post("/auth/logout", json={"refresh_token": refresh.json()["refresh_token"]})
    ).status_code == 204
    assert (await client.get("/me", headers=headers(source))).status_code == 200


async def test_another_pms_cannot_inspect_or_redeem_the_proof_even_with_its_valid_credential(
    client, db
):
    raw = code(await start(client, await verified(client, db)))
    for stage in ["inspect", "redeem"]:
        assert (await exchange(client, raw, stage, key="kumasi", secret=OTHER)).status_code == 410
        assert (await exchange(client, raw, stage, key="accra", secret=OTHER)).status_code == 403
    assert (await exchange(client, raw)).status_code == 200


async def test_partner_portal_cannot_redeem_or_cancel_a_pharmacy_proof(client, db):
    source = await verified(client, db)
    issued = await start(client, source)
    response = await client.post(
        "/auth/partner-handoffs/redeem",
        json={"code": code(issued)},
        headers={"X-Partner-Handoff-Secret": settings.partner_handoff_secret.get_secret_value()},
    )
    assert response.status_code == 410
    await client.delete(
        "/auth/partner-handoffs/" + issued.json()["handoff_id"], headers=headers(source)
    )
    assert (await exchange(client, code(issued))).status_code == 200


@pytest.mark.parametrize(
    "change", ["expired", "inactive", "password", "logout", "cancel", "unverified"]
)
async def test_changed_source_cannot_open_pharmacy_access(client, db, change):
    source = await verified(client, db)
    issued = await start(client, source)
    record = await db.scalar(select(PartnerHandoff))
    user = await db.get(User, record.user_id)
    if change == "expired":
        record.expires_at = auth._now() - timedelta(seconds=1)
    elif change == "inactive":
        user.is_active = False
    elif change == "password":
        user.password_hash = auth._hasher.hash("Changed-password-2026!")
    elif change == "unverified":
        user.email_verified = False
    elif change == "logout":
        await client.post("/auth/logout", json={"refresh_token": source["refresh_token"]})
    else:
        await client.delete(
            "/auth/pharmacy-handoffs/" + issued.json()["handoff_id"], headers=headers(source)
        )
    await db.commit()
    assert (await exchange(client, code(issued))).status_code == 410


async def test_requires_verified_email_and_rejects_browser_supplied_routing(client, db):
    source = await account(client)
    assert (await start(client, source)).status_code == 403
    user = await db.get(User, UUID(auth.decode_access_token(source["access_token"])["sub"]))
    user.email_verified = True
    await db.commit()
    for extra in [
        {"web_origin": "https://attacker.example"},
        {"deployment_key": "kumasi"},
        {"application_id": str(PHARMACY)},
    ]:
        assert (await start(client, source, **extra)).status_code == 422
    assert (
        await start(client, source, return_uri="medapp://hospital-workspaces")
    ).status_code == 400


async def test_disabled_or_shared_handoff_configuration_fails_closed(client, db, monkeypatch):
    source = await verified(client, db)
    monkeypatch.setattr(settings, "pms_handoff_deployments", {})
    assert (await start(client, source)).status_code == 503
    monkeypatch.setattr(
        settings,
        "pms_handoff_deployments",
        {
            "accra": PmsHandoffDeployment(
                web_origin="https://pharmacy.example",
                handoff_secret=settings.partner_handoff_secret,
            )
        },
    )
    assert (await start(client, source)).status_code == 503


@pytest.mark.parametrize("mutation", ["pharmacy", "origin", "unknown-key", "missing", "redirect"])
async def test_directory_destination_must_match_the_requested_pharmacy_and_configured_origin(
    monkeypatch, mutation
):
    original = httpx.AsyncClient
    value = {
        "pharmacy_id": str(PHARMACY),
        "deployment_key": "accra",
        "web_origin": "https://pharmacy.example",
    }
    if mutation == "pharmacy":
        value["pharmacy_id"] = "33333333-3333-4333-8333-333333333333"
    elif mutation == "origin":
        value["web_origin"] = "https://attacker.example"
    elif mutation == "unknown-key":
        value["deployment_key"] = "unknown"
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            404 if mutation == "missing" else 302 if mutation == "redirect" else 200, json=value
        )
    )
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw))
    with pytest.raises(FactorError):
        await resolve_destination("Bearer current-account", PHARMACY)


async def test_configuration_rejects_shared_credentials_and_unsafe_origins():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            pms_handoff_deployments={
                "a": {"web_origin": "https://one.example", "handoff_secret": SECRET},
                "b": {"web_origin": "https://two.example", "handoff_secret": SECRET},
            },
        )
    for origin in [
        "http://remote.example",
        "https://user:pass@site.example",
        "https://site.example/path",
    ]:
        with pytest.raises(ValidationError):
            PmsHandoffDeployment(web_origin=origin, handoff_secret=SECRET)
