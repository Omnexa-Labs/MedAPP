from __future__ import annotations

from uuid import uuid4

from fastapi import status


async def test_pharmacist_crud_flow(client) -> None:
    payload = {
        "first_name": "David",
        "last_name": "Park",
        "license_number": "GH-PHM-99001",
        "bio": "Clinical pharmacist, 12 years",
        "languages": ["en", "kr"],
        "specialties": ["clinical", "geriatric"],
        "photo_url": "https://example.com/david.jpg",
        "is_listable": True,
    }
    create_resp = await client.post("/v1/pharmacists", json=payload)
    assert create_resp.status_code == status.HTTP_201_CREATED, create_resp.text
    created = create_resp.json()
    pid = created["pharmacist_id"]
    assert created["specialties"] == ["clinical", "geriatric"]

    read_resp = await client.get(f"/v1/pharmacists/{pid}")
    assert read_resp.status_code == status.HTTP_200_OK

    update_resp = await client.patch(
        f"/v1/pharmacists/{pid}",
        json={"bio": "Updated bio", "specialties": ["compounding"]},
    )
    assert update_resp.status_code == status.HTTP_200_OK
    upd = update_resp.json()
    assert upd["bio"] == "Updated bio"
    assert upd["specialties"] == ["compounding"]

    list_resp = await client.get("/v1/pharmacists")
    assert list_resp.status_code == status.HTTP_200_OK
    body = list_resp.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1

    del_resp = await client.delete(f"/v1/pharmacists/{pid}")
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT

    miss = await client.get(f"/v1/pharmacists/{pid}")
    assert miss.status_code == status.HTTP_404_NOT_FOUND


async def _seed_three(client) -> list[str]:
    """Three pharmacists across two pharmacies, distinct user_ids.

    Returns the pharmacy UUIDs used so the affiliation filter test can
    reuse them.
    """
    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    pharm_a = str(uuid4())
    pharm_b = str(uuid4())

    await client.post(
        "/v1/pharmacists",
        json={
            "first_name": "Anna",
            "last_name": "Park",
            "license_number": "GH-PHM-00001",
            "specialties": ["clinical"],
            "affiliated_pharmacy_id": pharm_a,
            "is_listable": True,
        },
    )

    async def _p2():
        return Principal(subject="22222222-2222-2222-2222-222222222222", role="pharmacist")

    pharm_app.dependency_overrides[get_current_principal] = _p2
    await client.post(
        "/v1/pharmacists",
        json={
            "first_name": "Beatrice",
            "last_name": "Owusu",
            "license_number": "GH-PHM-00002",
            "specialties": ["compounding"],
            "affiliated_pharmacy_id": pharm_a,
            "is_listable": True,
        },
    )

    async def _p3():
        return Principal(subject="33333333-3333-3333-3333-333333333333", role="pharmacist")

    pharm_app.dependency_overrides[get_current_principal] = _p3
    await client.post(
        "/v1/pharmacists",
        json={
            "first_name": "Carlos",
            "last_name": "Mensah",
            "license_number": "GH-PHM-00003",
            "specialties": ["clinical"],
            "affiliated_pharmacy_id": pharm_b,
            "is_listable": True,
        },
    )

    async def _default():
        return Principal(subject="11111111-1111-1111-1111-111111111111", role="pharmacist")

    pharm_app.dependency_overrides[get_current_principal] = _default
    return [pharm_a, pharm_b]


async def test_search_by_q(client) -> None:
    await _seed_three(client)

    by_name = await client.get("/v1/pharmacists", params={"q": "Owusu"})
    assert by_name.status_code == 200
    assert by_name.json()["total"] == 1
    assert by_name.json()["items"][0]["last_name"] == "Owusu"

    by_license = await client.get("/v1/pharmacists", params={"q": "00003"})
    assert by_license.status_code == 200
    assert by_license.json()["total"] == 1
    assert by_license.json()["items"][0]["license_number"] == "GH-PHM-00003"

    none = await client.get("/v1/pharmacists", params={"q": "zzz-no-match"})
    assert none.status_code == 200
    assert none.json()["total"] == 0


async def test_filter_by_pharmacy(client) -> None:
    pharm_a, _pharm_b = await _seed_three(client)
    resp = await client.get("/v1/pharmacists", params={"pharmacy_id": pharm_a})
    assert resp.status_code == 200
    body = resp.json()
    # Pharmacy A has Anna + Beatrice.
    assert body["total"] == 2
    names = sorted(item["first_name"] for item in body["items"])
    assert names == ["Anna", "Beatrice"]


async def test_pagination_caps_at_200(client) -> None:
    resp = await client.get("/v1/pharmacists", params={"limit": 1000})
    # FastAPI / Starlette renamed 422 in newer releases; both spellings
    # land on the same numeric status.
    assert resp.status_code == 422


async def test_user_role_cannot_create(client) -> None:
    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    async def _user():
        return Principal(subject="55555555-5555-5555-5555-555555555555", role="user")

    pharm_app.dependency_overrides[get_current_principal] = _user
    resp = await client.post(
        "/v1/pharmacists",
        json={"first_name": "Sneaky", "last_name": "User", "is_listable": True},
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


async def test_admin_can_edit_any(client) -> None:
    create = await client.post(
        "/v1/pharmacists",
        json={"first_name": "Owner", "last_name": "Pharm", "is_listable": True},
    )
    pid = create.json()["pharmacist_id"]

    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    async def _other_pharm():
        return Principal(subject="66666666-6666-6666-6666-666666666666", role="pharmacist")

    pharm_app.dependency_overrides[get_current_principal] = _other_pharm
    denied = await client.patch(f"/v1/pharmacists/{pid}", json={"first_name": "Hijack"})
    assert denied.status_code == status.HTTP_403_FORBIDDEN

    async def _admin():
        return Principal(subject="77777777-7777-7777-7777-777777777777", role="admin")

    pharm_app.dependency_overrides[get_current_principal] = _admin
    allowed = await client.patch(f"/v1/pharmacists/{pid}", json={"first_name": "AdminEdit"})
    assert allowed.status_code == status.HTTP_200_OK
    assert allowed.json()["first_name"] == "AdminEdit"
