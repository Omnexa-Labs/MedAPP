"""Idempotent dev/demo seed.

Usable two ways:
- `uv run python -m app.seed` from the service directory (CLI).
- `POST /v1/dev/seed` when PMS_DEV_MODE=true (routed in dev_auth.py).

The seed is idempotent: it short-circuits if a pharmacy profile already exists.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import SessionLocal
from .models.core import (
    Drug,
    DrugBatch,
    PharmacyProfile,
    Staff,
    StockMovement,
    Supplier,
)

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


DEFAULT_ADMIN_EMAIL = "admin@pharmacy.local"
DEFAULT_ADMIN_PASSWORD = "ChangeMe!123"

DRUGS_DATA = [
    ("Amoxicillin", "Amoxil", "antibiotic", "capsule", "500mg", "capsule", 100, 250),
    ("Paracetamol", "Tylenol", "analgesic", "tablet", "500mg", "tablet", 200, 50),
    ("Metformin", "Glucophage", "antidiabetic", "tablet", "850mg", "tablet", 150, 180),
    ("Amlodipine", "Norvasc", "antihypertensive", "tablet", "5mg", "tablet", 120, 220),
    ("Ibuprofen", "Brufen", "analgesic", "tablet", "400mg", "tablet", 180, 120),
    ("Omeprazole", "Losec", "antacid", "capsule", "20mg", "capsule", 80, 350),
    ("Ciprofloxacin", "Cipro", "antibiotic", "tablet", "500mg", "tablet", 60, 400),
    (
        "Artemether/Lumefantrine",
        "Coartem",
        "antimalarial",
        "tablet",
        "20/120mg",
        "tablet",
        50,
        1200,
    ),
    ("ORS", "Oralyte", "supplement", "sachet", "20.5g", "sachet", 100, 80),
    ("Cetirizine", "Zyrtec", "antihistamine", "tablet", "10mg", "tablet", 80, 90),
    ("Loratadine", "Claritin", "antihistamine", "tablet", "10mg", "tablet", 80, 110),
    ("Diclofenac", "Voltaren", "analgesic", "tablet", "50mg", "tablet", 100, 90),
    ("Salbutamol Inhaler", "Ventolin", "respiratory", "inhaler", "100mcg", "puff", 20, 4500),
    ("ACT (DHA-PPQ)", "Eurartesim", "antimalarial", "tablet", "40/320mg", "tablet", 30, 1500),
    ("Multivitamin", "Centrum", "supplement", "tablet", "1 daily", "tablet", 100, 70),
    ("Vitamin C", "Redoxon", "supplement", "tablet", "1000mg", "tablet", 200, 60),
    ("Hydrocortisone Cream", "Hytone", "dermatological", "cream", "1%", "tube", 30, 600),
    ("Doxycycline", "Vibramycin", "antibiotic", "capsule", "100mg", "capsule", 60, 280),
    ("Folic Acid", "Folvite", "supplement", "tablet", "5mg", "tablet", 100, 40),
    ("Albendazole", "Zentel", "antihelminthic", "tablet", "400mg", "tablet", 50, 200),
]


async def seed(db: AsyncSession) -> dict:
    existing = (await db.execute(select(PharmacyProfile))).scalar_one_or_none()
    if existing is not None:
        return {"already_seeded": True, "pharmacy_id": str(existing.id)}

    profile = PharmacyProfile(
        name=settings.pharmacy_name,
        slug=settings.pharmacy_slug,
        country=settings.pharmacy_country,
        currency=settings.pharmacy_currency,
        city="Accra",
        region="Greater Accra",
        phone="+233 30 000 0000",
        email="info@pharmacy.local",
        medapp_partner_id=settings.medapp_partner_id,
    )
    db.add(profile)

    admin = Staff(
        full_name="Pharmacy Admin",
        email=DEFAULT_ADMIN_EMAIL,
        phone="+233 24 000 0000",
        role="pharmacy_admin",
        password_hash=_pwd.hash(DEFAULT_ADMIN_PASSWORD),
        is_active=True,
    )
    pharmacist = Staff(
        full_name="Lead Pharmacist",
        email="pharmacist@pharmacy.local",
        phone="+233 24 000 0001",
        role="pharmacist",
        password_hash=_pwd.hash(DEFAULT_ADMIN_PASSWORD),
        is_active=True,
    )
    cashier = Staff(
        full_name="Front Cashier",
        email="cashier@pharmacy.local",
        phone="+233 24 000 0002",
        role="cashier",
        password_hash=_pwd.hash(DEFAULT_ADMIN_PASSWORD),
        is_active=True,
    )
    db.add_all([admin, pharmacist, cashier])

    supplier = Supplier(
        name="PharmaCo Ghana Ltd",
        contact_person="Sales Desk",
        phone="+233 30 222 3344",
        email="sales@pharmaco.gh",
        address="Industrial Area, Accra",
        is_active=True,
    )
    db.add(supplier)

    await db.flush()

    today = date.today()
    expiry = today + timedelta(days=365 * 2)
    drugs: list[Drug] = []
    for name, brand, cat, form, strength, unit, reorder, price in DRUGS_DATA:
        d = Drug(
            name=name,
            brand_name=brand,
            category=cat,
            form=form,
            strength=strength,
            unit=unit,
            reorder_level=reorder,
            default_selling_price_cents=price,
            currency=settings.pharmacy_currency,
            requires_prescription=cat
            in ("antibiotic", "antimalarial", "antidiabetic", "antihypertensive"),
            is_active=True,
        )
        db.add(d)
        drugs.append(d)
    await db.flush()

    for i, d in enumerate(drugs):
        starting = d.reorder_level + 50 if i % 4 != 0 else max(d.reorder_level - 5, 0)
        batch = DrugBatch(
            drug_id=d.id,
            supplier_id=supplier.id,
            batch_number=f"SEED-{i + 1:03d}",
            quantity_received=starting + 100,
            quantity_on_hand=starting,
            unit_cost_cents=max(d.default_selling_price_cents * 60 // 100, 1),
            selling_price_cents=d.default_selling_price_cents,
            currency=settings.pharmacy_currency,
            received_at=today,
            expiry_date=expiry,
        )
        db.add(batch)
        await db.flush()
        db.add(
            StockMovement(
                drug_id=d.id,
                batch_id=batch.id,
                delta=starting,
                reason="receive",
                ref_type="seed",
                note="initial seed batch",
            )
        )

    await db.flush()

    return {
        "already_seeded": False,
        "pharmacy_id": str(profile.id),
        "staff": 3,
        "drugs": len(drugs),
        "batches": len(drugs),
        "suppliers": 1,
        "default_admin": {
            "email": DEFAULT_ADMIN_EMAIL,
            "password": DEFAULT_ADMIN_PASSWORD,
        },
    }


async def _run_cli() -> None:
    async with SessionLocal() as session:
        try:
            result = await seed(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
    print(result)


if __name__ == "__main__":
    asyncio.run(_run_cli())
