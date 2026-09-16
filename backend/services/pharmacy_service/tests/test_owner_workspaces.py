from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from app.main import app
from app.models import PharmacyDeployment, PharmacyProfile
from shared.auth import Principal, get_current_principal
from sqlalchemy import select

from tests.test_activation import OWNER, activate, assign
from tests.test_activation import command as activation_command


@pytest.fixture
def command(monkeypatch):
    return activation_command.__wrapped__(monkeypatch)


def owner(subject=OWNER):
    async def principal():
        return Principal(subject=str(subject), role="user")

    app.dependency_overrides[get_current_principal] = principal


async def configured(client, command, session_factory):
    pharmacy_id = await activate(client, command)
    assert (await assign(client, pharmacy_id)).status_code == 200
    async with session_factory() as db:
        binding = await db.scalar(select(PharmacyDeployment))
        binding.activated_at = datetime.now(UTC)
        binding.version = 2
        await db.commit()
    owner()
    return pharmacy_id


async def test_owner_can_find_private_approved_workspace_without_global_pharmacy_role(
    client, command, session_factory
):
    pharmacy_id = await configured(client, command, session_factory)
    response = await client.get("/v1/pharmacy-workspaces")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.json() == [
        {
            "pharmacy_id": pharmacy_id,
            "pharmacy_name": command.name,
            "deployment_key": "accra",
            "web_origin": "https://pharmacy.example",
        }
    ]
    assert (
        await client.get(f"/v1/pharmacy-workspaces/{pharmacy_id}/access")
    ).json() == response.json()[0]
    assert (await client.get(f"/v1/pharmacies/{pharmacy_id}")).status_code == 404


async def test_another_account_cannot_discover_the_owner_workspace(
    client, command, session_factory
):
    pharmacy_id = await configured(client, command, session_factory)
    owner(uuid4())
    assert (await client.get("/v1/pharmacy-workspaces")).json() == []
    assert (await client.get(f"/v1/pharmacy-workspaces/{pharmacy_id}/access")).status_code == 404


@pytest.mark.parametrize("state", ["unconfirmed", "inactive", "unconfigured"])
async def test_workspace_is_unavailable_until_activation_and_configuration_are_confirmed(
    client, command, session_factory, monkeypatch, state
):
    pharmacy_id = await configured(client, command, session_factory)
    async with session_factory() as db:
        if state == "unconfirmed":
            (await db.scalar(select(PharmacyDeployment))).activated_at = None
        elif state == "inactive":
            (await db.get(PharmacyProfile, UUID(pharmacy_id))).is_active = False
        else:
            from app.config import settings

            monkeypatch.setattr(settings, "pms_deployments", {})
        await db.commit()
    assert (await client.get("/v1/pharmacy-workspaces")).json() == []
    assert (await client.get(f"/v1/pharmacy-workspaces/{pharmacy_id}/access")).status_code == 404
