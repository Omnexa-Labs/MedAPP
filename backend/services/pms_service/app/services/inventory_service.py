"""Inventory queries and stock-movement ledger writes.

All stock changes MUST go through `record_movement()` so the
stock_movements ledger stays the source of truth.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import Drug, DrugBatch, StockMovement


async def current_stock(drug_id: UUID, db: AsyncSession) -> int:
    today = date.today()
    stmt = select(func.coalesce(func.sum(DrugBatch.quantity_on_hand), 0)).where(
        DrugBatch.drug_id == drug_id,
        DrugBatch.expiry_date >= today,
    )
    return int((await db.execute(stmt)).scalar_one())


async def stock_map(drug_ids: Iterable[UUID], db: AsyncSession) -> dict[UUID, int]:
    """Bulk stock lookup. Returns {drug_id: quantity_on_hand_total}."""
    today = date.today()
    ids = list(drug_ids)
    if not ids:
        return {}
    stmt = (
        select(DrugBatch.drug_id, func.coalesce(func.sum(DrugBatch.quantity_on_hand), 0))
        .where(DrugBatch.drug_id.in_(ids), DrugBatch.expiry_date >= today)
        .group_by(DrugBatch.drug_id)
    )
    rows = (await db.execute(stmt)).all()
    out = {drug_id: 0 for drug_id in ids}
    for drug_id, qty in rows:
        out[drug_id] = int(qty)
    return out


async def low_stock_alerts(db: AsyncSession) -> list[dict]:
    today = date.today()
    sub = (
        select(
            DrugBatch.drug_id.label("drug_id"),
            func.coalesce(func.sum(DrugBatch.quantity_on_hand), 0).label("qty"),
        )
        .where(DrugBatch.expiry_date >= today)
        .group_by(DrugBatch.drug_id)
        .subquery()
    )
    stmt = (
        select(Drug.id, Drug.name, sub.c.qty, Drug.reorder_level)
        .outerjoin(sub, sub.c.drug_id == Drug.id)
        .where(Drug.is_active.is_(True))
    )
    rows = (await db.execute(stmt)).all()
    alerts = []
    for drug_id, name, qty, reorder in rows:
        qty_int = int(qty or 0)
        if qty_int <= reorder:
            alerts.append(
                {
                    "drug_id": drug_id,
                    "drug_name": name,
                    "quantity_on_hand": qty_int,
                    "reorder_level": reorder,
                }
            )
    alerts.sort(key=lambda a: a["quantity_on_hand"])
    return alerts


async def expiring_soon(db: AsyncSession, days: int = 90) -> list[dict]:
    today = date.today()
    cutoff = today + timedelta(days=days)
    stmt = (
        select(
            DrugBatch.id,
            DrugBatch.drug_id,
            Drug.name,
            DrugBatch.batch_number,
            DrugBatch.quantity_on_hand,
            DrugBatch.expiry_date,
        )
        .join(Drug, Drug.id == DrugBatch.drug_id)
        .where(
            DrugBatch.expiry_date <= cutoff,
            DrugBatch.expiry_date >= today,
            DrugBatch.quantity_on_hand > 0,
        )
        .order_by(DrugBatch.expiry_date.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "batch_id": r[0],
            "drug_id": r[1],
            "drug_name": r[2],
            "batch_number": r[3],
            "quantity_on_hand": r[4],
            "expiry_date": r[5].isoformat(),
        }
        for r in rows
    ]


async def fifo_batches(drug_id: UUID, db: AsyncSession) -> list[DrugBatch]:
    """Non-expired batches with stock, oldest expiry first (FEFO)."""
    today = date.today()
    stmt = (
        select(DrugBatch)
        .where(
            DrugBatch.drug_id == drug_id,
            DrugBatch.expiry_date >= today,
            DrugBatch.quantity_on_hand > 0,
        )
        .order_by(DrugBatch.expiry_date.asc(), DrugBatch.received_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


def record_movement(
    db: AsyncSession,
    *,
    drug_id: UUID,
    batch_id: UUID | None,
    delta: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: UUID | None = None,
    actor_staff_id: UUID | None = None,
    note: str | None = None,
) -> StockMovement:
    movement = StockMovement(
        drug_id=drug_id,
        batch_id=batch_id,
        delta=delta,
        reason=reason,
        ref_type=ref_type,
        ref_id=ref_id,
        actor_staff_id=actor_staff_id,
        note=note,
    )
    db.add(movement)
    return movement


async def stock_valuation(db: AsyncSession) -> dict:
    """Total at-cost and at-sell value of non-expired stock."""
    today = date.today()
    stmt = select(
        func.coalesce(func.sum(DrugBatch.quantity_on_hand * DrugBatch.unit_cost_cents), 0),
        func.coalesce(func.sum(DrugBatch.quantity_on_hand * DrugBatch.selling_price_cents), 0),
        func.coalesce(func.sum(DrugBatch.quantity_on_hand), 0),
    ).where(DrugBatch.expiry_date >= today)
    cost, sell, units = (await db.execute(stmt)).one()
    return {
        "cost_value_cents": int(cost),
        "sell_value_cents": int(sell),
        "total_units": int(units),
    }
