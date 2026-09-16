from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from app.config import settings
from app.models import HospitalDirectoryEvent, HospitalProfile
from pydantic import SecretStr
from shared.onboarding.receipts import ActivationReceipt
from sqlalchemy import func, select

pytestmark = pytest.mark.asyncio
SECRET = "isolated-hospital-directory-management-secret-2026"
ACTIVATION = "isolated-hospital-directory-approval-secret-2026"
HEADERS = {"X-Hospital-Directory-Secret": SECRET}


@pytest_asyncio.fixture
async def managed(anonymous_client, monkeypatch, hospital_sample):
    monkeypatch.setattr(settings, "hms_directory_secret", SecretStr(SECRET))
    monkeypatch.setattr(settings, "onboarding_activation_secret", SecretStr(ACTIVATION))
    owner = uuid4()
    command = {
        "application_id": str(uuid4()),
        "applicant_id": str(owner),
        "reviewer_id": str(uuid4()),
        "approval_version": 3,
        "role": "hospital",
        **{
            key: hospital_sample[key]
            for key in (
                "name",
                "specialty",
                "address_line1",
                "city",
                "country",
                "contact_email",
                "contact_phone",
                "website_url",
            )
        },
    }
    response = await anonymous_client.post(
        "/internal/hospital-activations", json=command, headers={"X-Activation-Secret": ACTIVATION}
    )
    assert response.status_code == 200, response.text
    hospital_id = response.json()["resource_id"]
    return (
        anonymous_client,
        hospital_id,
        {"owner_user_id": str(owner), "actor_id": str(owner)},
        command,
    )


async def read(client, hospital_id, actor):
    response = await client.get(
        f"/internal/hospital-profiles/{hospital_id}",
        params={"owner_user_id": actor["owner_user_id"]},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


async def edit(client, hospital_id, actor, version, changes):
    return await client.patch(
        f"/internal/hospital-profiles/{hospital_id}",
        json={**actor, "version": version, "changes": changes},
        headers=HEADERS,
    )


async def action(client, hospital_id, actor, version, operation):
    return await client.post(
        f"/internal/hospital-profiles/{hospital_id}/{operation}",
        json={**actor, "version": version},
        headers=HEADERS,
    )


async def test_draft_publish_edit_withdraw_and_republish_preserve_identity(managed, sessionmaker):
    client, hospital_id, actor, approval = managed
    initial = await read(client, hospital_id, actor)
    assert initial["version"] == 1 and not initial["is_listed"]
    assert initial["published"] is None and initial["publication_issues"] == []
    assert (await client.get("/v1/hospitals")).json() == {"items": []}
    changes = {
        "name": "Nile Heart Centre",
        "description": "Care near your home.",
        "insurance_accepted": ["NHIF", "Axa", "nhif"],
    }
    saved = await edit(client, hospital_id, actor, 1, changes)
    assert saved.status_code == 200, saved.text
    assert saved.json()["draft"]["insurance_accepted"] == ["NHIF", "Axa"]
    assert saved.json()["version"] == 2 and not saved.json()["is_listed"]
    assert (await client.get(f"/v1/hospitals/{hospital_id}")).status_code == 404
    published = await action(client, hospital_id, actor, 2, "publish")
    assert published.status_code == 200, published.text
    assert published.json()["version"] == 3 and published.json()["is_listed"]
    assert not published.json()["has_unpublished_changes"]
    # Avoid a same-second timestamp accidentally hiding a draft metadata leak.
    async with sessionmaker() as db:
        row = await db.get(HospitalProfile, UUID(hospital_id))
        row.updated_at = datetime(2001, 1, 1, tzinfo=UTC)
        await db.commit()
    public = (await client.get(f"/v1/hospitals/{hospital_id}")).json()
    assert public["name"] == changes["name"] and public["description"] == changes["description"]
    assert public["accreditation_status"] == "pending"
    assert not {"directory_draft", "directory_version", "owner_user_id"} & public.keys()
    for insurer in ("nhif", "AXA"):
        assert (
            len((await client.get("/v1/hospitals", params={"insurance": insurer})).json()["items"])
            == 1
        )
    assert (await client.get("/v1/hospitals", params={"insurance": "NHI"})).json() == {"items": []}

    next_draft = await edit(
        client,
        hospital_id,
        actor,
        3,
        {"description": "Expanded services.", "insurance_accepted": ["New insurer"]},
    )
    assert next_draft.json()["version"] == 4 and next_draft.json()["has_unpublished_changes"]
    assert (await client.get(f"/v1/hospitals/{hospital_id}")).json() == public
    assert (await client.get("/v1/hospitals", params={"insurance": "New insurer"})).json() == {
        "items": []
    }
    republished = await action(client, hospital_id, actor, 4, "publish")
    assert republished.json()["version"] == 5
    assert (await client.get(f"/v1/hospitals/{hospital_id}")).json()[
        "description"
    ] == "Expanded services."
    withdrawn = await action(client, hospital_id, actor, 5, "withdraw")
    assert withdrawn.json()["version"] == 6 and not withdrawn.json()["is_listed"]
    assert (await client.get("/v1/hospitals")).json() == {"items": []}
    for suffix in ("", "/reviews"):
        assert (await client.get(f"/v1/hospitals/{hospital_id}{suffix}")).status_code == 404
    assert (await action(client, hospital_id, actor, 6, "withdraw")).json()["version"] == 6
    assert (await action(client, hospital_id, actor, 6, "publish")).json()["version"] == 7
    assert (await action(client, hospital_id, actor, 7, "publish")).json()["version"] == 7

    history = await client.get(
        f"/internal/hospital-profiles/{hospital_id}/history",
        params={"owner_user_id": actor["owner_user_id"]},
        headers=HEADERS,
    )
    rows = history.json()["items"]
    assert [row["version"] for row in rows] == [7, 6, 5, 4, 3, 2]
    assert rows[1]["action"] == "profile.withdrawn" and rows[1]["after"] == {"is_listed": False}
    assert all(row["actor_id"] == actor["actor_id"] for row in rows)
    assert SECRET not in history.text
    async with sessionmaker() as db:
        hospital = await db.get(HospitalProfile, UUID(hospital_id))
        receipt = await db.get(ActivationReceipt, UUID(approval["application_id"]))
        assert str(hospital.owner_user_id) == actor["owner_user_id"]
        assert receipt.resource_id == hospital.id and receipt.role == "hospital"


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"name": None},
        {"name": "   "},
        {"insurance_accepted": None},
        {"insurance_accepted": [" "]},
        {"website_url": "javascript:alert(1)"},
        {"website_url": "https://user:password@example.com"},
        {"contact_email": "not-an-email"},
        {"latitude": 91, "longitude": 0},
        {"latitude": 5},
        {"is_listable": True},
        {"is_active": False},
        {"owner_user_id": str(uuid4())},
        {"accreditation_status": "approved"},
    ],
)
async def test_invalid_or_authority_edits_never_change_the_saved_profile(managed, changes):
    client, hospital_id, actor, _ = managed
    response = await edit(client, hospital_id, actor, 1, changes)
    assert response.status_code == 422, response.text
    assert (await read(client, hospital_id, actor))["version"] == 1


async def test_incomplete_profile_can_be_saved_but_not_published(managed):
    client, hospital_id, actor, _ = managed
    saved = await edit(
        client,
        hospital_id,
        actor,
        1,
        {"address_line1": "", "contact_phone": None, "contact_email": None},
    )
    assert saved.status_code == 200 and saved.json()["publication_issues"]
    refused = await action(client, hospital_id, actor, 2, "publish")
    assert refused.status_code == 422
    assert {issue["loc"][-1] for issue in refused.json()["detail"]} == {"address_line1", "contact"}
    assert not (await read(client, hospital_id, actor))["is_listed"]


async def test_stale_edits_publish_and_withdraw_do_not_overwrite_current_state(
    managed, sessionmaker
):
    client, hospital_id, actor, _ = managed
    assert (
        await edit(client, hospital_id, actor, 1, {"description": "Saved by another administrator"})
    ).status_code == 200
    assert (await edit(client, hospital_id, actor, 1, {"description": "Stale"})).status_code == 409
    for operation in ("publish", "withdraw"):
        assert (await action(client, hospital_id, actor, 1, operation)).status_code == 409
    current = await read(client, hospital_id, actor)
    assert current["draft"]["description"] == "Saved by another administrator"
    assert not current["is_listed"]
    # Saving identical normalized values does not manufacture a new revision/event.
    assert (
        await edit(client, hospital_id, actor, 2, {"description": "Saved by another administrator"})
    ).json()["version"] == 2
    async with sessionmaker() as db:
        assert await db.scalar(select(func.count()).select_from(HospitalDirectoryEvent)) == 1


@pytest.mark.parametrize("change", ["owner", "inactive", "receipt", "missing"])
async def test_changed_ownership_inactive_or_unreceipted_hospital_cannot_be_managed(
    managed, sessionmaker, change
):
    client, hospital_id, actor, approval = managed
    async with sessionmaker() as db:
        hospital = await db.get(HospitalProfile, UUID(hospital_id))
        if change == "owner":
            hospital.owner_user_id = uuid4()
        elif change == "inactive":
            hospital.is_active = False
        elif change == "receipt":
            await db.delete(await db.get(ActivationReceipt, UUID(approval["application_id"])))
        else:
            await db.delete(hospital)
        await db.commit()
    response = await client.get(
        f"/internal/hospital-profiles/{hospital_id}",
        params={"owner_user_id": actor["owner_user_id"]},
        headers=HEADERS,
    )
    assert response.status_code == 404
    assert (await action(client, hospital_id, actor, 1, "publish")).status_code == 404


async def test_service_credential_and_recorded_owner_are_required(managed, monkeypatch):
    client, hospital_id, actor, _ = managed
    path = f"/internal/hospital-profiles/{hospital_id}"
    params = {"owner_user_id": actor["owner_user_id"]}
    for headers in (
        {},
        {"X-Hospital-Directory-Secret": "wrong"},
        {"Authorization": "Bearer platform-token"},
    ):
        assert (await client.get(path, params=params, headers=headers)).status_code == 401
    assert (
        await client.get(path, params={"owner_user_id": str(uuid4())}, headers=HEADERS)
    ).status_code == 404
    for value in ("", ACTIVATION):
        monkeypatch.setattr(settings, "hms_directory_secret", SecretStr(value))
        assert (await client.get(path, params=params, headers=HEADERS)).status_code == 503


async def test_name_conflict_keeps_existing_publication_and_saved_draft(
    managed, admin_client, hospital_sample
):
    client, hospital_id, actor, _ = managed
    other = {**hospital_sample, "name": "Existing hospital", "slug": "existing-hospital"}
    assert (await admin_client.post("/v1/hospitals", json=other)).status_code == 201
    assert (await action(client, hospital_id, actor, 1, "publish")).status_code == 200
    assert (await edit(client, hospital_id, actor, 2, {"name": other["name"]})).status_code == 200
    response = await action(client, hospital_id, actor, 3, "publish")
    assert response.status_code == 409
    current = await read(client, hospital_id, actor)
    assert current["version"] == 3 and current["draft"]["name"] == other["name"]
    assert current["published"]["name"] == hospital_sample["name"]


async def test_history_paging_is_stable_and_scoped(managed, sessionmaker):
    client, hospital_id, actor, _ = managed
    async with sessionmaker() as db:
        for version in range(2, 25):
            db.add(
                HospitalDirectoryEvent(
                    hospital_id=UUID(hospital_id),
                    actor_id=UUID(actor["actor_id"]),
                    version=version,
                    action="draft.saved",
                    changed_fields=["description"],
                    before={},
                    after={"description": str(version)},
                )
            )
        await db.commit()
    path = f"/internal/hospital-profiles/{hospital_id}/history"
    first = await client.get(
        path, params={"owner_user_id": actor["owner_user_id"]}, headers=HEADERS
    )
    second = await client.get(
        path, params={"owner_user_id": actor["owner_user_id"], "offset": 20}, headers=HEADERS
    )
    assert [row["version"] for row in first.json()["items"]] == list(range(24, 4, -1))
    assert first.json()["has_more"] and not second.json()["has_more"]
    assert [row["version"] for row in second.json()["items"]] == [4, 3, 2]
