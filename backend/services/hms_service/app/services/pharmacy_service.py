from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.pharmacy import Dispensing, Drug, DrugBatch, Prescription, PrescriptionItem
from ..schemas.pharmacy import (
    DispenseRequest,
    DrugBatchCreate,
    DrugCreate,
    DrugUpdate,
    PrescriptionCreate,
)


async def create_drug(body: DrugCreate, db: AsyncSession) -> Drug:
    drug = Drug(
        name=body.name,
        brand_name=body.brand_name,
        category=body.category,
        form=body.form,
        strength=body.strength,
        unit=body.unit,
        reorder_level=body.reorder_level,
    )
    db.add(drug)
    await db.flush()
    return drug


async def list_drugs(
    db: AsyncSession,
    search: str | None = None,
    category: str | None = None,
    low_stock: bool = False,
) -> list[Drug]:
    query = select(Drug).where(Drug.is_active.is_(True))
    if search:
        query = query.where(Drug.name.ilike(f"%{search}%"))
    if category:
        query = query.where(Drug.category == category)
    result = await db.execute(query.order_by(Drug.name))
    return list(result.scalars().all())


async def get_drug(drug_id: UUID, db: AsyncSession) -> Drug | None:
    result = await db.execute(select(Drug).where(Drug.id == drug_id))
    return result.scalar_one_or_none()


async def update_drug(drug_id: UUID, body: DrugUpdate, db: AsyncSession) -> Drug | None:
    drug = await get_drug(drug_id, db)
    if drug is None:
        return None
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(drug, key, value)
    await db.flush()
    await db.refresh(drug, attribute_names=["updated_at"])
    return drug


async def add_batch(drug_id: UUID, body: DrugBatchCreate, db: AsyncSession) -> DrugBatch:
    batch = DrugBatch(
        drug_id=drug_id,
        batch_number=body.batch_number,
        quantity_received=body.quantity_received,
        quantity_remaining=body.quantity_received,
        unit_cost_cents=body.unit_cost_cents,
        selling_price_cents=body.selling_price_cents,
        currency=body.currency,
        supplier=body.supplier,
        received_at=body.received_at,
        expiry_date=body.expiry_date,
    )
    db.add(batch)
    await db.flush()
    return batch


async def get_stock_alerts(db: AsyncSession) -> list[dict]:
    alerts: list[dict] = []

    drugs_result = await db.execute(select(Drug).where(Drug.is_active.is_(True)))
    drugs = drugs_result.scalars().all()

    for drug in drugs:
        batches_result = await db.execute(
            select(func.coalesce(func.sum(DrugBatch.quantity_remaining), 0)).where(
                DrugBatch.drug_id == drug.id
            )
        )
        total_remaining = batches_result.scalar_one()

        if total_remaining <= drug.reorder_level:
            alerts.append({
                "drug_id": drug.id,
                "drug_name": drug.name,
                "category": drug.category,
                "quantity_remaining": total_remaining,
                "reorder_level": drug.reorder_level,
                "alert_type": "low_stock",
            })

    expiry_threshold = date.today() + timedelta(days=90)
    expiring_result = await db.execute(
        select(DrugBatch)
        .join(Drug, Drug.id == DrugBatch.drug_id)
        .where(
            DrugBatch.expiry_date <= expiry_threshold,
            DrugBatch.quantity_remaining > 0,
        )
    )
    for batch in expiring_result.scalars().all():
        drug_result = await db.execute(select(Drug).where(Drug.id == batch.drug_id))
        drug = drug_result.scalar_one()
        alerts.append({
            "drug_id": drug.id,
            "drug_name": drug.name,
            "category": drug.category,
            "quantity_remaining": batch.quantity_remaining,
            "reorder_level": drug.reorder_level,
            "alert_type": "expiring_soon",
        })

    return alerts


async def create_prescription(
    body: PrescriptionCreate, prescribed_by: UUID, db: AsyncSession
) -> Prescription:
    rx = Prescription(
        visit_id=body.visit_id,
        patient_id=body.patient_id,
        prescribed_by_staff_id=prescribed_by,
        notes=body.notes,
    )
    db.add(rx)
    await db.flush()

    for item in body.items:
        rx_item = PrescriptionItem(
            prescription_id=rx.id,
            drug_id=item.drug_id,
            dosage=item.dosage,
            quantity_prescribed=item.quantity_prescribed,
            duration_days=item.duration_days,
            instructions=item.instructions,
        )
        db.add(rx_item)
    await db.flush()
    return rx


async def list_prescriptions(
    db: AsyncSession,
    patient_id: UUID | None = None,
    status: str | None = None,
) -> list[Prescription]:
    query = select(Prescription)
    if patient_id:
        query = query.where(Prescription.patient_id == patient_id)
    if status:
        query = query.where(Prescription.status == status)
    result = await db.execute(query.order_by(Prescription.created_at.desc()))
    return list(result.scalars().all())


async def get_prescription(rx_id: UUID, db: AsyncSession) -> Prescription | None:
    result = await db.execute(select(Prescription).where(Prescription.id == rx_id))
    return result.scalar_one_or_none()


async def get_prescription_items(rx_id: UUID, db: AsyncSession) -> list[PrescriptionItem]:
    result = await db.execute(
        select(PrescriptionItem).where(PrescriptionItem.prescription_id == rx_id)
    )
    return list(result.scalars().all())


async def dispense(
    rx_id: UUID, body: DispenseRequest, dispensed_by: UUID, db: AsyncSession
) -> list[Dispensing]:
    now = datetime.now(tz=timezone.utc)
    dispensings: list[Dispensing] = []

    for item in body.items:
        batch_result = await db.execute(
            select(DrugBatch).where(DrugBatch.id == item.drug_batch_id)
        )
        batch = batch_result.scalar_one_or_none()
        if batch is None:
            raise ValueError(f"batch {item.drug_batch_id} not found")
        if batch.quantity_remaining < item.quantity:
            raise ValueError(
                f"batch {batch.batch_number} has only {batch.quantity_remaining} remaining"
            )

        batch.quantity_remaining -= item.quantity

        rx_item_result = await db.execute(
            select(PrescriptionItem).where(PrescriptionItem.id == item.prescription_item_id)
        )
        rx_item = rx_item_result.scalar_one_or_none()
        if rx_item:
            rx_item.quantity_dispensed += item.quantity

        disp = Dispensing(
            prescription_item_id=item.prescription_item_id,
            drug_batch_id=item.drug_batch_id,
            quantity=item.quantity,
            dispensed_by_staff_id=dispensed_by,
            dispensed_at=now,
        )
        db.add(disp)
        dispensings.append(disp)

    rx = await get_prescription(rx_id, db)
    if rx:
        items = await get_prescription_items(rx_id, db)
        all_dispensed = all(i.quantity_dispensed >= i.quantity_prescribed for i in items)
        any_dispensed = any(i.quantity_dispensed > 0 for i in items)
        if all_dispensed:
            rx.status = "fully_dispensed"
        elif any_dispensed:
            rx.status = "partially_dispensed"

    await db.flush()
    return dispensings
