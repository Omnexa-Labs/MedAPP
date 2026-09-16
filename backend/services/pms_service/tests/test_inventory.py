from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from shared.db import Base
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.deps import PmsPrincipal, get_db, get_principal
from app.main import app
from app.models.core import (
    AuditLog,
    DrugBatch,
    InventoryRequest,
    PharmacyProfile,
    Sale,
    Staff,
    StockMovement,
)


@pytest.fixture
async def setup():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    staff_id = uuid4()
    actor = {"id": staff_id, "role": "pharmacy_admin"}
    async with factory() as db, db.begin():
        db.add(PharmacyProfile(name="Test pharmacy", slug="qa", currency="GHS"))
        db.add(
            Staff(
                id=staff_id,
                full_name="QA Pharmacist",
                email="qa@example.test",
                role="pharmacy_admin",
            )
        )

    async def database():
        async with factory() as db:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    async def principal():
        return PmsPrincipal(
            subject=str(actor["id"]),
            email="qa@example.test",
            role=actor["role"],
            pharmacy_slug="qa",
        )

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_principal] = principal
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, factory, actor
    app.dependency_overrides.clear()
    await engine.dispose()


DRUG = {
    "name": "Paracetamol",
    "category": "analgesic",
    "form": "tablet",
    "strength": "500 mg",
    "unit": "tablet",
    "default_selling_price_cents": 300,
}


async def post(client, path, body, key=None):
    return await client.post(path, json=body, headers={"Idempotency-Key": str(key or uuid4())})


async def drug(client, **values):
    response = await post(client, "/v1/drugs", {**DRUG, **values})
    assert response.status_code == 201, response.text
    return response.json()


def receipt(drug_id, **values):
    return {
        "drug_id": drug_id,
        "batch_number": "LOT-01",
        "quantity_received": 20,
        "unit_cost_cents": 100,
        "selling_price_cents": 250,
        "received_at": date.today().isoformat(),
        "expiry_date": (date.today() + timedelta(days=30)).isoformat(),
        **values,
    }


async def batch(client, drug_id, **values):
    response = await post(client, "/v1/batches", receipt(drug_id, **values))
    assert response.status_code == 201, response.text
    return response.json()


async def test_catalog_replays_creates_validates_skus_and_rejects_stale_edits(setup):
    client, factory, actor = setup
    key = uuid4()
    first = await post(client, "/v1/drugs", {**DRUG, "sku": "PARA-1"}, key)
    replay = await post(client, "/v1/drugs", {**DRUG, "sku": "PARA-1"}, key)
    assert first.status_code == replay.status_code == 201
    assert replay.json() == first.json()
    assert (await post(client, "/v1/drugs", {**DRUG, "name": "Other"}, key)).status_code == 409
    assert (await post(client, "/v1/drugs", {**DRUG, "sku": "PARA-1"})).status_code == 409
    path = "/v1/drugs/" + first.json()["id"]
    edited = await client.patch(path, json={"version": 1, "name": "Renamed", "is_active": False})
    assert edited.status_code == 200 and edited.json()["version"] == 2
    assert (await client.patch(path, json={"version": 1, "name": "Stale"})).status_code == 409
    assert (await client.get("/v1/drugs")).json()["total"] == 0
    assert (await client.get("/v1/drugs?active=false")).json()["items"][0]["name"] == "Renamed"
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(InventoryRequest)) == 1
        assert await db.scalar(select(func.count()).select_from(AuditLog)) == 2
    actor["id"] = uuid4()
    assert (await post(client, "/v1/drugs", {**DRUG, "sku": "PARA-1"}, key)).status_code == 409


@pytest.mark.parametrize(
    "bad",
    [
        {"name": " "},
        {"strength": ""},
        {"reorder_level": -1},
        {"reorder_level": 1.5},
        {"default_selling_price_cents": -1},
        {"currency": "USD"},
        {"sku": "x" * 65},
        {"is_active": False},
    ],
)
async def test_bad_catalog_input_does_not_create_records(setup, bad):
    client, _, _ = setup
    assert (await post(client, "/v1/drugs", {**DRUG, **bad})).status_code == 422
    assert (await client.get("/v1/drugs")).json()["total"] == 0


async def test_catalog_search_and_paging_include_brand_sku_and_literal_wildcards(setup):
    client, _, _ = setup
    one = await drug(client, name="Alpha", sku="A_1", brand_name="CareBrand")
    await drug(client, name="Beta", sku="AB1")
    await batch(client, one["id"])
    first = (await client.get("/v1/drugs?limit=1")).json()
    assert first["total"] == 2 and first["items"][0]["name"] == "Alpha"
    assert (await client.get("/v1/drugs?limit=1&offset=1")).json()["items"][0]["name"] == "Beta"
    for search in ("CareBrand", "A_1"):
        response = (await client.get("/v1/drugs", params={"search": search})).json()
        assert response["total"] == 1 and response["items"][0]["id"] == one["id"]
    low = (await client.get("/v1/drugs?low_stock_only=true")).json()
    assert low["total"] == 1 and low["items"][0]["name"] == "Beta"


async def test_receipts_adjustments_ledger_free_price_and_idempotent_replay(setup):
    client, factory, actor = setup
    item = await drug(client)
    key = uuid4()
    payload = receipt(item["id"], selling_price_cents=0)
    first = await post(client, "/v1/batches", payload, key)
    replay = await post(client, "/v1/batches", payload, key)
    assert first.json() == replay.json() and first.json()["selling_price_cents"] == 0
    row = first.json()
    adjust_key = uuid4()
    change = {"version": 1, "delta": -4, "reason": "adjust", "note": "Four damaged tablets"}
    adjusted = await post(client, f"/v1/batches/{row['id']}/adjust", change, adjust_key)
    assert adjusted.status_code == 200, adjusted.text
    assert adjusted.json()["quantity_on_hand"] == 16 and adjusted.json()["version"] == 2
    assert (
        await post(client, f"/v1/batches/{row['id']}/adjust", change, adjust_key)
    ).json() == adjusted.json()
    assert (await post(client, f"/v1/batches/{row['id']}/adjust", change)).status_code == 409
    assert (
        await post(
            client, f"/v1/batches/{row['id']}/adjust", {**change, "version": 2, "delta": -17}
        )
    ).status_code == 409
    history = (await client.get(f"/v1/batches/{row['id']}/movements")).json()["items"]
    assert sorted(m["delta"] for m in history) == [-4, 20]
    assert all(m["actor_name"] == "QA Pharmacist" for m in history)
    async with factory() as db:
        assert (
            await db.scalar(
                select(func.sum(StockMovement.delta)).where(
                    StockMovement.batch_id == UUID(row["id"])
                )
            )
            == 16
        )
        assert await db.scalar(select(func.count()).select_from(DrugBatch)) == 1
    actor["role"] = "cashier"
    assert (
        await post(client, f"/v1/batches/{row['id']}/adjust", change, adjust_key)
    ).status_code == 403
    assert (await client.get(f"/v1/batches/{row['id']}/movements")).status_code == 403
    assert (await client.get("/v1/batches")).status_code == 200


@pytest.mark.parametrize(
    "bad",
    [
        {"quantity_received": 0},
        {"quantity_received": -3},
        {"quantity_received": True},
        {"unit_cost_cents": -1},
        {"expiry_date": "2020-01-01"},
        {"batch_number": ""},
        {"supplier_id": str(uuid4())},
        {"currency": "USD"},
    ],
)
async def test_invalid_stock_receipts_do_not_change_stock(setup, bad):
    client, _, _ = setup
    item = await drug(client)
    assert (await post(client, "/v1/batches", receipt(item["id"], **bad))).status_code == 422
    assert (await client.get("/v1/batches")).json()["total"] == 0
    assert (await client.get("/v1/drugs/" + item["id"])).json()["quantity_on_hand"] == 0


async def test_sale_dispense_and_void_keep_batch_revision_and_ledger_in_sync(setup):
    client, factory, _ = setup
    item = await drug(client)
    row = await batch(client, item["id"])
    sale = await post(client, "/v1/sales", {"items": [{"drug_id": item["id"], "quantity": 3}]})
    assert sale.status_code == 201, sale.text
    assert sale.json()["total_cents"] == 750
    assert (
        await post(
            client, f"/v1/sales/{sale.json()['id']}/void", {"version": 1, "reason": "Wrong sale"}
        )
    ).status_code == 200
    assert (
        await post(
            client, f"/v1/sales/{sale.json()['id']}/void", {"version": 2, "reason": "Wrong sale"}
        )
    ).status_code == 400
    rx = await post(
        client, "/v1/prescriptions", {"items": [{"drug_id": item["id"], "quantity_prescribed": 4}]}
    )
    assert rx.status_code == 201, rx.text
    dispensed = await post(
        client,
        f"/v1/prescriptions/{rx.json()['id']}/dispense",
        {
            "version": 1,
            "items": [{"prescription_item_id": rx.json()["items"][0]["id"], "quantity": 2}],
        },
    )
    assert dispensed.status_code == 200, dispensed.text
    assert dispensed.json()["rx_status"] == "partially_dispensed"
    async with factory() as db:
        stored = await db.get(DrugBatch, UUID(row["id"]))
        assert stored.quantity_on_hand == 18 and stored.version == 4
        assert (
            await db.scalar(
                select(func.sum(StockMovement.delta)).where(StockMovement.batch_id == stored.id)
            )
            == 18
        )
    assert (
        await post(
            client,
            f"/v1/sales/{dispensed.json()['sale_id']}/void",
            {"version": 1, "reason": "Wrong sale"},
        )
    ).status_code == 400


async def test_dashboard_uses_real_period_counts_and_excludes_expired_available_stock(setup):
    client, factory, _ = setup
    item = await drug(client)
    row = await batch(client, item["id"])
    async with factory() as db, db.begin():
        stored = await db.get(DrugBatch, UUID(row["id"]))
        stored.expiry_date = date.today() - timedelta(days=1)
        db.add_all(
            [
                Sale(
                    sale_number="QA-today",
                    currency="GHS",
                    total_cents=1200,
                    status="completed",
                    completed_at=datetime.now(UTC),
                ),
                Sale(
                    sale_number="QA-void",
                    currency="GHS",
                    total_cents=100,
                    status="voided",
                    completed_at=datetime.now(UTC),
                ),
                Sale(
                    sale_number="QA-old",
                    currency="GHS",
                    total_cents=500,
                    status="completed",
                    completed_at=datetime.now(UTC) - timedelta(days=2),
                ),
            ]
        )
    today = (await client.get("/v1/reports/dashboard?period=today")).json()
    assert (
        today["sales"]["gross_total_cents"] == 1200
        and sum(row["count"] for row in today["volume"]) == 1
    )
    assert today["expired_batch_count"] == 1 and today["low_stock_count"] == 1
    week = (await client.get("/v1/reports/dashboard?period=week")).json()
    assert (
        week["sales"]["gross_total_cents"] == 1700
        and sum(row["count"] for row in week["volume"]) == 2
    )
    assert len(week["volume"]) == 7
    assert (await client.get("/v1/drugs/" + item["id"])).json()["quantity_on_hand"] == 0
    assert (await client.get("/v1/batches?state=expired")).json()["total"] == 1


async def test_purchase_order_receipt_cannot_duplicate_stock_and_uses_catalog_price(setup):
    client, _, _ = setup
    item = await drug(client)
    supplier = (await client.post("/v1/suppliers", json={"name": "QA Supplier"})).json()
    po = await post(
        client,
        "/v1/purchase-orders",
        {
            "supplier_id": supplier["id"],
            "items": [{"drug_id": item["id"], "quantity": 10, "unit_cost_cents": 100}],
        },
    )
    assert po.status_code == 201, po.text
    assert (
        await post(client, f"/v1/purchase-orders/{po.json()['id']}/send", {"version": 1})
    ).status_code == 200
    body = {
        "version": 2,
        "received_at": date.today().isoformat(),
        "lines": [
            {
                "purchase_order_item_id": po.json()["items"][0]["id"],
                "quantity_received": 10,
                "batch_number": "PO-BATCH",
                "expiry_date": (date.today() + timedelta(days=60)).isoformat(),
            }
        ],
    }
    received = await post(client, f"/v1/purchase-orders/{po.json()['id']}/receive", body)
    assert received.status_code == 200, received.text
    assert (
        await post(client, f"/v1/purchase-orders/{po.json()['id']}/receive", body)
    ).status_code == 409
    batches = (await client.get("/v1/batches")).json()
    assert batches["total"] == 1 and batches["items"][0]["selling_price_cents"] == 300


@pytest.mark.parametrize(
    "change",
    [
        {"delta": 0},
        {"delta": -1.5},
        {"delta": True},
        {"delta": 2, "reason": "expire"},
        {"delta": -2, "reason": "return"},
        {"note": ""},
        {"version": 0},
    ],
)
async def test_invalid_adjustments_leave_stock_and_ledger_unchanged(setup, change):
    client, _, _ = setup
    item = await drug(client)
    row = await batch(client, item["id"])
    body = {"version": 1, "delta": -2, "reason": "adjust", "note": "Stock count check", **change}
    assert (await post(client, f"/v1/batches/{row['id']}/adjust", body)).status_code == 422
    assert (await client.get("/v1/batches")).json()["items"][0]["quantity_on_hand"] == 20
    assert len((await client.get(f"/v1/batches/{row['id']}/movements")).json()["items"]) == 1


async def test_sale_rejects_prescription_only_stock_and_overflow_without_deductions(setup):
    client, _, _ = setup
    rx_drug = await drug(client, requires_prescription=True)
    await batch(client, rx_drug["id"])
    item = await drug(client, name="Another drug")
    await batch(client, item["id"])
    for line in (
        {"drug_id": rx_drug["id"], "quantity": 1},
        {"drug_id": item["id"], "quantity": 2, "unit_price_cents": 2_147_483_647},
    ):
        sale = await post(client, "/v1/sales", {"items": [line]})
        assert sale.status_code == 400, sale.text
    assert all(
        row["quantity_on_hand"] == 20 for row in (await client.get("/v1/batches")).json()["items"]
    )


async def test_committed_receipt_can_be_replayed_after_its_expiry(setup, monkeypatch):
    from app.routers import batches as batch_routes

    client, _, _ = setup
    item = await drug(client)
    key = uuid4()
    payload = receipt(item["id"])
    initial = await post(client, "/v1/batches", payload, key)

    class LaterDate(date):
        @classmethod
        def today(cls):
            return date.today() + timedelta(days=60)

    monkeypatch.setattr(batch_routes, "date", LaterDate)
    assert (await post(client, "/v1/batches", payload, key)).json() == initial.json()
    assert (await post(client, "/v1/batches", payload)).status_code == 422
