from datetime import UTC, date, datetime, timedelta

from sqlalchemy import extract, func, select

from ..models.core import Drug, DrugBatch, Prescription, Sale
from . import inventory_service as inventory
from . import reports_service as reports


async def dashboard(db, period):
    today = date.today()
    currency = await inventory.pharmacy_currency(db)
    start = today if period == "today" else today - timedelta(days=6)
    start_dt, end_dt = reports._range(start, today)
    at = func.coalesce(Sale.completed_at, Sale.created_at)
    bucket = extract("hour", at) if period == "today" else func.date(at)
    sales = (
        await db.execute(
            select(bucket, func.count(Sale.id))
            .where(
                Sale.status == "completed",
                Sale.currency == currency,
                at >= start_dt,
                at < end_dt,
            )
            .group_by(bucket)
        )
    ).all()
    counts = {
        (str(int(key)) if period == "today" else str(key)): int(count) for key, count in sales
    }
    if period == "today":
        volume = [
            {"label": f"{hour:02d}:00", "count": counts.get(str(hour), 0)} for hour in range(24)
        ]
    else:
        volume = [
            {
                "label": (start + timedelta(days=day)).isoformat(),
                "count": counts.get((start + timedelta(days=day)).isoformat(), 0),
            }
            for day in range(7)
        ]
    pending = select(Prescription).where(
        Prescription.status.in_(("pending", "partially_dispensed"))
    )
    pending_count = await db.scalar(select(func.count()).select_from(pending.subquery()))
    queue = await db.scalars(pending.order_by(Prescription.created_at, Prescription.id).limit(5))
    low_stock = await inventory.low_stock_alerts(db)
    expiring = await inventory.expiring_soon(db, 90)
    expired = await db.scalar(
        select(func.count())
        .select_from(DrugBatch)
        .where(DrugBatch.expiry_date < today, DrugBatch.quantity_on_hand > 0)
    )
    return {
        "as_of": datetime.now(UTC),
        "inventory_date": today,
        "timezone": "UTC",
        "currency": currency,
        "period": period,
        "start_date": start,
        "end_date": today,
        "active_drugs": await db.scalar(
            select(func.count()).select_from(Drug).where(Drug.is_active.is_(True))
        ),
        "pending_prescriptions": pending_count,
        "low_stock_count": len(low_stock),
        "expiring_batch_count": len(expiring),
        "expired_batch_count": expired,
        "pending_queue": [
            {"id": rx.id, "number": rx.rx_number, "status": rx.status} for rx in queue
        ],
        "low_stock": low_stock[:5],
        "expiring_batches": expiring[:5],
        "volume": volume,
        "sales": await reports.sales_summary(db, start, today),
    }
