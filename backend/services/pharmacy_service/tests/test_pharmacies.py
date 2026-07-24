from __future__ import annotations

from fastapi import status


# ---------------------------------------------------------------------------
# CRUD flow
# ---------------------------------------------------------------------------


async def test_pharmacy_crud_flow(client) -> None:
    payload = {
        "name": "CarePlus Pharmacy",
        "slug": "careplus",
        "description": "24/7 community pharmacy",
        "license_number": "GH-PH-12345",
        "license_categories": ["general", "controlled_substances"],
        "address_line1": "12 High Street",
        "city": "Accra",
        "country": "GH",
        "latitude": 5.6037,
        "longitude": -0.1870,
        "phone": "+233 30 0000000",
        "email": "hello@careplus.example",
        "website_url": "https://careplus.example",
        "insurance_accepted": ["NHIS"],
        "operating_hours": {"monday": "08:00-22:00", "sunday": "closed"},
        "photo_url": "https://example.com/careplus.jpg",
        "is_listable": True,
    }

    # POST
    create_resp = await client.post("/v1/pharmacies", json=payload)
    assert create_resp.status_code == status.HTTP_201_CREATED, create_resp.text
    created = create_resp.json()
    pharmacy_id = created["pharmacy_id"]
    assert created["name"] == "CarePlus Pharmacy"
    assert created["license_categories"] == ["general", "controlled_substances"]
    assert created["operating_hours"] == {"monday": "08:00-22:00", "sunday": "closed"}

    # GET one
    read_resp = await client.get(f"/v1/pharmacies/{pharmacy_id}")
    assert read_resp.status_code == status.HTTP_200_OK
    assert read_resp.json()["slug"] == "careplus"

    # PATCH
    update_resp = await client.patch(
        f"/v1/pharmacies/{pharmacy_id}",
        json={"description": "Updated description", "phone": "+233 30 1111111"},
    )
    assert update_resp.status_code == status.HTTP_200_OK
    updated = update_resp.json()
    assert updated["description"] == "Updated description"
    assert updated["phone"] == "+233 30 1111111"

    # GET list with pagination
    list_resp = await client.get("/v1/pharmacies", params={"limit": 10, "offset": 0})
    assert list_resp.status_code == status.HTTP_200_OK
    body = list_resp.json()
    assert body["total"] == 1
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert len(body["items"]) == 1

    # DELETE
    delete_resp = await client.delete(f"/v1/pharmacies/{pharmacy_id}")
    assert delete_resp.status_code == status.HTTP_204_NO_CONTENT

    # 404 after delete
    missing_resp = await client.get(f"/v1/pharmacies/{pharmacy_id}")
    assert missing_resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Search + filters
# ---------------------------------------------------------------------------


async def _seed_three(client) -> None:
    """Three distinct pharmacies the search/filter tests share.

    Distinct emails / slugs / cities so each filter has a different
    hit set. Each is `is_listable=True` so the default-listable filter
    doesn't suppress them.
    """
    await client.post(
        "/v1/pharmacies",
        json={
            "name": "Accra Health Pharmacy",
            "slug": "accra-health",
            "description": "Inner-city pharmacy near Korle Bu",
            "city": "Accra",
            "country": "GH",
            "insurance_accepted": ["NHIS"],
            "is_listable": True,
        },
    )
    # Different user_id so the "one pharmacy per user" rule doesn't
    # collide. We swap the principal between posts.
    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    async def _principal2():
        return Principal(subject="22222222-2222-2222-2222-222222222222", role="pharmacy")

    async def _principal3():
        return Principal(subject="33333333-3333-3333-3333-333333333333", role="pharmacy")

    pharm_app.dependency_overrides[get_current_principal] = _principal2
    await client.post(
        "/v1/pharmacies",
        json={
            "name": "Kumasi Drug Store",
            "slug": "kumasi-ds",
            "description": "Family-run drug store with delivery",
            "city": "Kumasi",
            "country": "GH",
            "insurance_accepted": [],
            "is_listable": True,
        },
    )
    pharm_app.dependency_overrides[get_current_principal] = _principal3
    await client.post(
        "/v1/pharmacies",
        json={
            "name": "Takoradi Med Center",
            "slug": "takoradi-mc",
            "description": "Coastal regional center",
            "city": "Takoradi",
            "country": "GH",
            "insurance_accepted": ["Acme Health"],
            "is_listable": True,
        },
    )
    # Restore the default principal for downstream assertions.
    async def _default():
        return Principal(subject="11111111-1111-1111-1111-111111111111", role="pharmacy")

    pharm_app.dependency_overrides[get_current_principal] = _default


async def test_search_by_q(client) -> None:
    await _seed_three(client)

    # Match by city via the q= text search.
    accra = await client.get("/v1/pharmacies", params={"q": "Accra"})
    assert accra.status_code == status.HTTP_200_OK
    accra_body = accra.json()
    assert accra_body["total"] == 1
    assert accra_body["items"][0]["name"] == "Accra Health Pharmacy"

    # Match by description substring.
    drug = await client.get("/v1/pharmacies", params={"q": "drug store"})
    assert drug.status_code == status.HTTP_200_OK
    assert drug.json()["total"] == 1

    # No hits → empty items, total 0 (NOT 404).
    none = await client.get("/v1/pharmacies", params={"q": "zzz-no-such-pharmacy"})
    assert none.status_code == status.HTTP_200_OK
    assert none.json()["total"] == 0
    assert none.json()["items"] == []


async def test_filter_by_city(client) -> None:
    await _seed_three(client)
    resp = await client.get("/v1/pharmacies", params={"city": "Kumasi"})
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["city"] == "Kumasi"


async def test_pagination_caps_at_200(client) -> None:
    # limit > 200 must be rejected via the Query(le=200) constraint.
    resp = await client.get("/v1/pharmacies", params={"limit": 500})
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


async def test_slug_conflict_returns_409(client) -> None:
    await client.post(
        "/v1/pharmacies",
        json={"name": "Original", "slug": "dup-slug", "is_listable": True},
    )
    # Same user can't create two pharmacies (existing rule); swap the
    # principal so the conflict is on `slug`, not on `user_id`.
    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    async def _other():
        return Principal(subject="44444444-4444-4444-4444-444444444444", role="pharmacy")

    pharm_app.dependency_overrides[get_current_principal] = _other
    conflict = await client.post(
        "/v1/pharmacies",
        json={"name": "Copycat", "slug": "dup-slug", "is_listable": True},
    )
    assert conflict.status_code == status.HTTP_409_CONFLICT
    assert "slug" in conflict.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Ownership / role enforcement
# ---------------------------------------------------------------------------


async def test_user_role_cannot_create(client) -> None:
    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    async def _user():
        return Principal(subject="55555555-5555-5555-5555-555555555555", role="user")

    pharm_app.dependency_overrides[get_current_principal] = _user
    resp = await client.post(
        "/v1/pharmacies",
        json={"name": "Sneaky", "slug": "sneaky", "is_listable": True},
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


async def test_admin_can_edit_any(client) -> None:
    # Owner creates.
    create = await client.post(
        "/v1/pharmacies",
        json={"name": "Owned", "slug": "owned", "is_listable": True},
    )
    pharmacy_id = create.json()["pharmacy_id"]

    # Different non-admin user cannot edit.
    from app.main import app as pharm_app
    from shared.auth import Principal, get_current_principal

    async def _other_pharmacy():
        return Principal(subject="66666666-6666-6666-6666-666666666666", role="pharmacy")

    pharm_app.dependency_overrides[get_current_principal] = _other_pharmacy
    denied = await client.patch(f"/v1/pharmacies/{pharmacy_id}", json={"name": "Hijack"})
    assert denied.status_code == status.HTTP_403_FORBIDDEN

    # Admin can.
    async def _admin():
        return Principal(subject="77777777-7777-7777-7777-777777777777", role="admin")

    pharm_app.dependency_overrides[get_current_principal] = _admin
    allowed = await client.patch(f"/v1/pharmacies/{pharmacy_id}", json={"name": "Admin Edit"})
    assert allowed.status_code == status.HTTP_200_OK
    assert allowed.json()["name"] == "Admin Edit"


# ---------------------------------------------------------------------------
# Stock endpoint
# ---------------------------------------------------------------------------


async def test_stock_returns_404_when_no_pms(client) -> None:
    # No pms_base_url set → router maps StockLookupError to 404.
    create = await client.post(
        "/v1/pharmacies",
        json={"name": "No PMS", "slug": "no-pms", "is_listable": True},
    )
    pharmacy_id = create.json()["pharmacy_id"]
    resp = await client.get(
        f"/v1/pharmacies/{pharmacy_id}/stock",
        params={"drug_name": "Paracetamol"},
    )
    assert resp.status_code == status.HTTP_404_NOT_FOUND


async def test_stock_degrades_gracefully_on_network_error(client) -> None:
    # Point at an unroutable URL → check_drug_at_pharmacy should return
    # `available=False, source="unknown"` rather than 5xx.
    create = await client.post(
        "/v1/pharmacies",
        json={
            "name": "Broken Upstream",
            "slug": "broken",
            "is_listable": True,
            "pms_base_url": "http://127.0.0.1:1",
        },
    )
    pharmacy_id = create.json()["pharmacy_id"]
    resp = await client.get(
        f"/v1/pharmacies/{pharmacy_id}/stock",
        params={"drug_name": "Paracetamol"},
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["available"] is False
    assert body["source"] == "unknown"
