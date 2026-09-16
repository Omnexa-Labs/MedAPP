from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest
from app.config import PmsDeploymentConfig, settings
from app.main import app
from app.models import (
    ActivationReceipt,
    PharmacyDeployment,
    PharmacyDeploymentEvent,
    PharmacyProfile,
)
from app.services import deployment_service, stock_service
from pydantic import SecretStr, ValidationError
from shared.auth import Principal, get_current_principal
from shared.onboarding.pharmacies import (
    PharmacyActivation,
    PharmacyWorkspaceResult,
    pharmacy_resource_id,
)
from sqlalchemy import func, select

OWNER = UUID("11111111-1111-1111-1111-111111111111")
REVIEWER = uuid4()
SECRET = "directory-activation-credential-2026"
HEADERS = {"X-Activation-Secret": SECRET}


@pytest.fixture
def command(monkeypatch):
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(SECRET))
    monkeypatch.setattr(
        settings,
        "pms_deployments",
        {
            "accra": PmsDeploymentConfig(
                label="Accra PMS",
                api_url="http://pms.test",
                web_origin="https://pharmacy.example",
                activation_secret="pms-bootstrap-separate-credential-2026",
                stock_secret="pms-stock-separate-credential-2026",
            )
        },
    )
    return PharmacyActivation(
        application_id=uuid4(),
        applicant_id=OWNER,
        reviewer_id=REVIEWER,
        approval_version=7,
        name="Care Pharmacy",
        license_number="L" * 240,
        address_line1="12 High Street",
        city="Accra",
        country="Ghana",
        contact_email="office@pharmacy.example",
        contact_phone="+233200000000",
    )


async def activate(client, command):
    response = await client.post(
        "/internal/pharmacy-activations", json=command.model_dump(mode="json"), headers=HEADERS
    )
    assert response.status_code == 200, response.text
    return response.json()["resource_id"]


def admin(subject=REVIEWER):
    async def principal():
        return Principal(subject=str(subject), role="admin")

    app.dependency_overrides[get_current_principal] = principal


async def assign(client, pharmacy_id, version=0, key="accra"):
    admin()
    return await client.put(
        f"/v1/pharmacy-workspaces/{pharmacy_id}/deployment",
        json={"deployment_key": key},
        headers={"If-Match": str(version)},
    )


async def test_activation_is_private_idempotent_and_preserves_later_edits(
    client, command, session_factory
):
    pharmacy_id = await activate(client, command)
    assert pharmacy_id == str(pharmacy_resource_id(command.application_id))
    for path in [
        f"/v1/pharmacies/{pharmacy_id}",
        f"/v1/pharmacies/{pharmacy_id}/stock?drug_name=aspirin",
    ]:
        assert (await client.get(path)).status_code == 404
    assert (await client.get("/v1/pharmacies?only_listable=false")).json()["total"] == 0
    async with session_factory() as db:
        profile = await db.get(PharmacyProfile, UUID(pharmacy_id))
        assert profile.license_number == command.license_number
        profile.name = "Later business edit"
        await db.commit()
    await activate(client, command)
    async with session_factory() as db:
        assert (await db.get(PharmacyProfile, UUID(pharmacy_id))).name == "Later business edit"
        assert await db.scalar(select(func.count()).select_from(ActivationReceipt)) == 1
    changed = command.model_copy(update={"name": "Replaced approval"})
    assert (
        await client.post(
            "/internal/pharmacy-activations", json=changed.model_dump(mode="json"), headers=HEADERS
        )
    ).status_code == 409


@pytest.mark.parametrize("headers", [{}, {"X-Activation-Secret": "wrong"}])
async def test_activation_requires_dedicated_credential(client, command, headers):
    assert (
        await client.post(
            "/internal/pharmacy-activations", json=command.model_dump(mode="json"), headers=headers
        )
    ).status_code == 401


async def test_existing_owner_is_not_adopted(client, command):
    assert (
        await client.post("/v1/pharmacies", json={"name": "Legacy", "slug": "legacy"})
    ).status_code == 201
    assert (
        await client.post(
            "/internal/pharmacy-activations", json=command.model_dump(mode="json"), headers=HEADERS
        )
    ).status_code == 409


async def test_managed_profile_cannot_be_published_or_deleted_through_legacy_crud(client, command):
    pharmacy_id = await activate(client, command)
    admin()
    assert (
        await client.patch(f"/v1/pharmacies/{pharmacy_id}", json={"is_listable": True})
    ).status_code == 409
    assert (await client.delete(f"/v1/pharmacies/{pharmacy_id}")).status_code == 409


async def test_assignment_requires_independent_admin_and_version_and_is_permanent(
    client, command, monkeypatch
):
    pharmacy_id = await activate(client, command)
    path = f"/v1/pharmacy-workspaces/{pharmacy_id}/deployment"
    assert (await client.get(path)).status_code == 403
    admin(OWNER)
    assert (
        await client.put(path, json={"deployment_key": "accra"}, headers={"If-Match": "0"})
    ).status_code == 403
    admin()
    assert (await client.put(path, json={"deployment_key": "accra"})).status_code == 428
    assert (await assign(client, pharmacy_id)).json()["version"] == 1
    assert (await assign(client, pharmacy_id)).status_code == 412
    other = settings.pms_deployments["accra"].model_copy(update={"api_url": "http://other.test"})
    monkeypatch.setattr(settings, "pms_deployments", {**settings.pms_deployments, "other": other})
    assert (await assign(client, pharmacy_id, 1, "other")).status_code == 409
    assert (await assign(client, pharmacy_id, 1)).status_code == 200
    choices = (await client.get("/v1/pharmacy-workspaces/deployments")).json()
    assert choices[0] == {"deployment_key": "accra", "label": "Accra PMS", "assigned": True}
    assert "secret" not in str(choices) and "http" not in str(choices)


async def test_workspace_activation_waits_for_assignment_and_confirms_retry(
    client, command, monkeypatch, session_factory
):
    pharmacy_id = await activate(client, command)
    path = "/internal/pharmacy-workspace-activations"
    body = command.model_dump(mode="json")
    assert (await client.post(path, json=body, headers=HEADERS)).json()[
        "detail"
    ] == "workspace_setup_required"
    assert (await assign(client, pharmacy_id)).status_code == 200
    calls = []

    async def receiver(config, payload):
        calls.append(payload)
        return PharmacyWorkspaceResult(
            application_id=payload.application_id,
            applicant_id=payload.applicant_id,
            resource_id=payload.pharmacy_id,
            deployment_key=payload.deployment_key,
        )

    monkeypatch.setattr(deployment_service, "request_workspace", receiver)
    for _ in range(2):
        assert (await client.post(path, json=body, headers=HEADERS)).status_code == 200
    assert calls[0] == calls[1]
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(PharmacyDeploymentEvent)) == 2
        binding = await db.scalar(select(PharmacyDeployment))
        assert binding.version == 2 and binding.activated_at
    assert (await client.get(f"/v1/pharmacies/{pharmacy_id}")).status_code == 404


@pytest.mark.parametrize("reply", ["wrong_identity", "redirect", "invalid_json", "unavailable"])
async def test_unconfirmed_remote_write_does_not_confirm_binding(
    client, command, monkeypatch, session_factory, reply
):
    pharmacy_id = await activate(client, command)
    await assign(client, pharmacy_id)
    original = httpx.AsyncClient

    def remote(request):
        assert request.url.host == "pms.test"
        assert (
            request.headers["X-Activation-Secret"]
            == settings.pms_deployments["accra"].activation_secret.get_secret_value()
        )
        if reply == "wrong_identity":
            return httpx.Response(
                200,
                json={
                    "application_id": str(command.application_id),
                    "applicant_id": str(OWNER),
                    "resource_id": str(uuid4()),
                    "role": "pharmacy",
                    "deployment_key": "accra",
                },
            )
        return httpx.Response(
            {"redirect": 307, "invalid_json": 200, "unavailable": 503}[reply], text="unconfirmed"
        )

    def http(**kwargs):
        assert kwargs["follow_redirects"] is False and kwargs["trust_env"] is False
        return original(transport=httpx.MockTransport(remote), **kwargs)

    monkeypatch.setattr(deployment_service.httpx, "AsyncClient", http)
    response = await client.post(
        "/internal/pharmacy-workspace-activations",
        json=command.model_dump(mode="json"),
        headers=HEADERS,
    )
    assert response.status_code == 503
    async with session_factory() as db:
        assert (await db.scalar(select(PharmacyDeployment))).activated_at is None


@pytest.mark.parametrize(
    "variant,source,quantity,price",
    [
        ("exact", "pms", 4, 0),
        ("different_drug", "pms", 0, None),
        ("different_pharmacy", "unknown", None, None),
        ("malformed", "unknown", None, None),
        ("network", "unknown", None, None),
    ],
)
async def test_stock_uses_confirmed_assignment_and_validates_identity(
    client, command, session_factory, monkeypatch, variant, source, quantity, price
):
    pharmacy_id = await activate(client, command)
    await assign(client, pharmacy_id)
    async with session_factory() as db:
        profile = await db.get(PharmacyProfile, UUID(pharmacy_id))
        profile.is_listable = True
        profile.pms_base_url = "http://untrusted.test"
        (await db.scalar(select(PharmacyDeployment))).activated_at = datetime.now(UTC)
        await db.commit()
    original = httpx.AsyncClient

    def remote(request):
        assert request.url.host == "pms.test"
        if variant == "network":
            raise httpx.ConnectError("unavailable", request=request)
        if variant == "malformed":
            return httpx.Response(200, text="not-json")
        return httpx.Response(
            200,
            json={
                "pharmacy_id": str(uuid4()) if variant == "different_pharmacy" else pharmacy_id,
                "items": [
                    {
                        "drug_name": "Other drug" if variant == "different_drug" else "Paracetamol",
                        "quantity_on_hand": 4,
                        "selling_price_cents": 0,
                        "currency": "GHS",
                    }
                ],
            },
        )

    monkeypatch.setattr(
        stock_service.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(remote), **kwargs),
    )
    response = await client.get(f"/v1/pharmacies/{pharmacy_id}/stock?drug_name=Paracetamol")
    assert response.status_code == 200
    assert (
        response.json()["source"],
        response.json()["quantity"],
        response.json()["price_cents"],
    ) == (source, quantity, price)
    public = (await client.get(f"/v1/pharmacies/{pharmacy_id}")).json()
    assert not {"user_id", "pms_base_url", "pms_partner_secret_id"} & public.keys()


@pytest.mark.parametrize(
    "url",
    [
        "file:///tmp",
        "http://pms.test/path",
        "http://user:password@pms.test",
        "http://pms.test:99999",
    ],
)
def test_deployment_config_rejects_invalid_origins(url):
    with pytest.raises(ValidationError):
        PmsDeploymentConfig(
            label="PMS",
            api_url=url,
            web_origin="https://pharmacy.example",
            activation_secret="a" * 32,
            stock_secret="s" * 32,
        )
