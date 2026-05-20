from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.appointment import Appointment, QueueEntry
from ..models.billing import Invoice, Payment
from ..models.patient import Patient
from ..services.pharmacy_service import get_stock_alerts


async def get_dashboard_summary(db: AsyncSession) -> dict:
    now = datetime.now(tz=timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_patients_result = await db.execute(
        select(func.count(Patient.id)).where(Patient.is_active.is_(True))
    )
    total_patients = total_patients_result.scalar_one()

    patients_today_result = await db.execute(
        select(func.count(Patient.id)).where(Patient.created_at >= today_start)
    )
    patients_today = patients_today_result.scalar_one()

    appointments_today_result = await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.scheduled_date == now.date()
        )
    )
    appointments_today = appointments_today_result.scalar_one()

    appointments_completed_result = await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.scheduled_date == now.date(),
            Appointment.status == "completed",
        )
    )
    appointments_completed = appointments_completed_result.scalar_one()

    queue_waiting_result = await db.execute(
        select(func.count(QueueEntry.id)).where(QueueEntry.status == "waiting")
    )
    queue_waiting = queue_waiting_result.scalar_one()

    queue_serving_result = await db.execute(
        select(func.count(QueueEntry.id)).where(QueueEntry.status == "serving")
    )
    queue_serving = queue_serving_result.scalar_one()

    revenue_today_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount_cents), 0)).where(
            Payment.received_at >= today_start
        )
    )
    revenue_today = revenue_today_result.scalar_one()

    revenue_month_result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount_cents), 0)).where(
            Payment.received_at >= month_start
        )
    )
    revenue_month = revenue_month_result.scalar_one()

    alerts = await get_stock_alerts(db)

    return {
        "patients_registered_today": patients_today,
        "total_patients": total_patients,
        "appointments_today": appointments_today,
        "appointments_completed_today": appointments_completed,
        "queue_waiting": queue_waiting,
        "queue_serving": queue_serving,
        "revenue_today_cents": revenue_today,
        "revenue_this_month_cents": revenue_month,
        "currency": "GHS",
        "low_stock_count": len([a for a in alerts if a["alert_type"] == "low_stock"]),
        "stock_alerts": alerts[:10],
    }
