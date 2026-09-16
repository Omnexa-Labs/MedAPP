"""Aggregated read models for the reports dashboard."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.core import (
    Prescription,
    Sale,
    SaleCorrection,
    SaleCorrectionItem,
    SaleItem,
    SaleRefund,
    StockMovement,
)
from .inventory_service import pharmacy_currency


def _range(start: date | None, end: date | None) -> tuple[datetime, datetime]:
    today = date.today()
    end_d = end or today
    start_d = start or (end_d - timedelta(days=min(29, (end_d - date.min).days)))
    if start_d > end_d or (end_d - start_d).days > 365 or end_d == date.max:
        raise HTTPException(422, "Choose a date range of at most 366 days with start before end.")
    start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=UTC)
    end_dt = datetime.combine(end_d + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
    return start_dt, end_dt


async def sales_summary(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> dict:
    start_dt, end_dt = _range(start, end)
    currency = await pharmacy_currency(db)
    at = func.coalesce(Sale.completed_at, Sale.created_at)
    stmt = select(
        func.count(Sale.id),
        func.coalesce(func.sum(Sale.total_cents), 0),
        func.coalesce(func.sum(Sale.discount_cents), 0),
    ).where(
        at >= start_dt,
        at < end_dt,
        Sale.status == "completed",
        Sale.currency == currency,
    )
    count, total, discount = (await db.execute(stmt)).one()
    by_method = (
        await db.execute(
            select(
                Sale.payment_method,
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total_cents), 0),
            )
            .where(
                at >= start_dt,
                at < end_dt,
                Sale.status == "completed",
                Sale.currency == currency,
            )
            .group_by(Sale.payment_method)
        )
    ).all()
    credits = await db.scalar(
        select(func.coalesce(func.sum(SaleCorrection.credit_cents), 0))
        .join(Sale, Sale.id == SaleCorrection.sale_id)
        .where(
            SaleCorrection.created_at >= start_dt,
            SaleCorrection.created_at < end_dt,
            Sale.status == "completed",
            Sale.currency == currency,
        )
    )
    refunds = await db.scalar(
        select(func.coalesce(func.sum(SaleRefund.amount_cents), 0))
        .join(Sale, Sale.id == SaleRefund.sale_id)
        .where(
            SaleRefund.created_at >= start_dt,
            SaleRefund.created_at < end_dt,
            SaleRefund.status == "recorded",
            Sale.currency == currency,
        )
    )
    return {
        "currency": currency,
        "start_date": start_dt.date().isoformat(),
        "end_date": (end_dt.date() - timedelta(days=1)).isoformat(),
        "sale_count": int(count),
        "gross_total_cents": int(total),
        "discount_cents": int(discount),
        "credit_total_cents": int(credits),
        "refund_total_cents": int(refunds),
        "net_sales_cents": int(total) - int(credits),
        "by_payment_method": [
            {"method": m, "count": int(c), "total_cents": int(t)} for m, c, t in by_method
        ],
    }


async def daily_sales_series(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> list[dict]:
    start_dt, end_dt = _range(start, end)
    currency = await pharmacy_currency(db)
    at = func.coalesce(Sale.completed_at, Sale.created_at)
    day = func.date(at).label("day")
    stmt = (
        select(day, func.count(Sale.id), func.coalesce(func.sum(Sale.total_cents), 0))
        .where(
            at >= start_dt,
            at < end_dt,
            Sale.status == "completed",
            Sale.currency == currency,
        )
        .group_by(day)
        .order_by(day)
    )
    rows = (await db.execute(stmt)).all()
    points = {
        str(d): {
            "day": str(d),
            "sale_count": int(c),
            "total_cents": int(t),
            "credit_cents": 0,
            "refund_cents": 0,
        }
        for d, c, t in rows
    }
    for model, amount, column in (
        (SaleCorrection, SaleCorrection.credit_cents, "credit_cents"),
        (SaleRefund, SaleRefund.amount_cents, "refund_cents"),
    ):
        activity_day = func.date(model.created_at)
        query = (
            select(activity_day, func.sum(amount))
            .join(Sale, Sale.id == model.sale_id)
            .where(
                model.created_at >= start_dt, model.created_at < end_dt, Sale.currency == currency
            )
        )
        query = (
            query.where(Sale.status == "completed")
            if model is SaleCorrection
            else query.where(SaleRefund.status == "recorded")
        )
        for d, value in (await db.execute(query.group_by(activity_day))).all():
            point = points.setdefault(
                str(d),
                {
                    "day": str(d),
                    "sale_count": 0,
                    "total_cents": 0,
                    "credit_cents": 0,
                    "refund_cents": 0,
                },
            )
            point[column] = int(value)
    return [
        {**points[day], "net_sales_cents": points[day]["total_cents"] - points[day]["credit_cents"]}
        for day in sorted(points)
    ]


async def top_selling_drugs(
    db: AsyncSession,
    start: date | None = None,
    end: date | None = None,
    limit: int = 10,
) -> list[dict]:
    start_dt, end_dt = _range(start, end)
    currency = await pharmacy_currency(db)
    corrected = (
        select(
            SaleCorrectionItem.sale_item_id, func.sum(SaleCorrectionItem.quantity).label("quantity")
        )
        .group_by(SaleCorrectionItem.sale_item_id)
        .subquery()
    )
    remaining = SaleItem.quantity - func.coalesce(corrected.c.quantity, 0)
    at = func.coalesce(Sale.completed_at, Sale.created_at)
    stmt = (
        select(
            SaleItem.drug_id,
            SaleItem.drug_name_snapshot,
            func.sum(remaining).label("qty"),
            func.sum(remaining * SaleItem.unit_price_cents).label("revenue"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .outerjoin(corrected, corrected.c.sale_item_id == SaleItem.id)
        .where(
            at >= start_dt,
            at < end_dt,
            Sale.status == "completed",
            Sale.currency == currency,
        )
        .group_by(SaleItem.drug_id, SaleItem.drug_name_snapshot)
        .having(func.sum(remaining) > 0)
        .order_by(func.sum(remaining).desc(), SaleItem.drug_id)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "drug_id": str(drug_id),
            "drug_name": name,
            "units_sold": int(qty),
            "revenue_cents": int(rev),
        }
        for drug_id, name, qty, rev in rows
    ]


async def dispensing_volume(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> dict:
    start_dt, end_dt = _range(start, end)
    by_status = (
        await db.execute(
            select(Prescription.status, func.count(Prescription.id))
            .where(Prescription.created_at >= start_dt, Prescription.created_at < end_dt)
            .group_by(Prescription.status)
        )
    ).all()
    by_source = (
        await db.execute(
            select(Prescription.source, func.count(Prescription.id))
            .where(Prescription.created_at >= start_dt, Prescription.created_at < end_dt)
            .group_by(Prescription.source)
        )
    ).all()
    return {
        "by_status": [{"status": s, "count": int(c)} for s, c in by_status],
        "by_source": [{"source": s, "count": int(c)} for s, c in by_source],
    }


async def movement_breakdown(
    db: AsyncSession, start: date | None = None, end: date | None = None
) -> list[dict]:
    start_dt, end_dt = _range(start, end)
    stmt = (
        select(
            StockMovement.reason,
            func.count(StockMovement.id),
            func.coalesce(func.sum(StockMovement.delta), 0),
        )
        .where(StockMovement.created_at >= start_dt, StockMovement.created_at < end_dt)
        .group_by(StockMovement.reason)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"reason": reason, "movement_count": int(c), "net_units": int(net)}
        for reason, c, net in rows
    ]
