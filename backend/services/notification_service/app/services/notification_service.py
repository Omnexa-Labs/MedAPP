from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.notification import DeliveryChannel, DeliveryStatus, NotificationDelivery, NotificationPreference
from ..schemas.notification import NotificationPreferenceUpdate, SendNotificationIn


class NotificationError(RuntimeError):
    pass


_TEMPLATES: dict[str, dict[str, tuple[str, str]]] = {
    "en": {
        "booking.confirmed": ("Booking confirmed", "Your booking is confirmed."),
        "booking.cancelled": ("Booking cancelled", "Your booking has been cancelled."),
        "payment.succeeded": ("Payment received", "Your payment was successful."),
    },
    "fr": {
        "booking.confirmed": ("Réservation confirmée", "Votre réservation est confirmée."),
        "booking.cancelled": ("Réservation annulée", "Votre réservation a été annulée."),
        "payment.succeeded": ("Paiement reçu", "Votre paiement a réussi."),
    },
    "tw": {
        "booking.confirmed": ("Booking adanso", "Wo booking no wɔ hɔ."),
        "booking.cancelled": ("Booking eto", "Wo booking no atoato."),
        "payment.succeeded": ("Sika aba", "Wo sika no akɔ yiye."),
    },
    "sw": {
        "booking.confirmed": ("Uwekaji umethibitishwa", "Uwekaji wako umethibitishwa."),
        "booking.cancelled": ("Uwekaji umefutwa", "Uwekaji wako umefutwa."),
        "payment.succeeded": ("Malipo yamepokelewa", "Malipo yako yamefanikiwa."),
    },
}


def _principal_uuid(principal) -> UUID:
    try:
        return UUID(str(principal["subject"]) if isinstance(principal, dict) else str(principal.subject))
    except ValueError as exc:  # noqa: BLE001
        raise NotificationError("invalid principal subject") from exc


def _principal_role(principal) -> str:
    return str(principal["role"] if isinstance(principal, dict) else principal.role)


def render_message(locale: str, event_type: str, fallback_title: str, fallback_body: str) -> tuple[str, str]:
    templates = _TEMPLATES.get(locale.lower(), _TEMPLATES["en"])
    return templates.get(event_type, (fallback_title, fallback_body))


async def get_or_create_preferences(session: AsyncSession, principal) -> NotificationPreference:
    user_id = _principal_uuid(principal)
    preference = await session.scalar(select(NotificationPreference).where(NotificationPreference.user_id == user_id))
    if preference is not None:
        return preference
    preference = NotificationPreference(user_id=user_id, locale="en")
    session.add(preference)
    await session.flush()
    return preference


async def update_preferences(session: AsyncSession, principal, payload: NotificationPreferenceUpdate) -> NotificationPreference:
    preference = await get_or_create_preferences(session, principal)
    preference.locale = payload.locale.lower()
    preference.push_enabled = payload.push_enabled
    preference.sms_enabled = payload.sms_enabled
    preference.email_enabled = payload.email_enabled
    preference.in_app_enabled = payload.in_app_enabled
    await session.flush()
    return preference


async def send_notification(session: AsyncSession, principal, payload: SendNotificationIn) -> list[NotificationDelivery]:
    role = _principal_role(principal)
    if role not in {"service", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    existing = await session.scalars(
        select(NotificationDelivery)
        .where(NotificationDelivery.event_id == payload.event_id)
        .order_by(NotificationDelivery.created_at.asc())
    )
    existing_deliveries = list(existing.all())
    if existing_deliveries:
        return existing_deliveries

    recipient_preferences = await session.scalar(
        select(NotificationPreference).where(NotificationPreference.user_id == payload.recipient_user_id)
    )
    locale = (recipient_preferences.locale if recipient_preferences else payload.locale).lower()
    title, body = render_message(locale, payload.event_type, payload.title, payload.body)

    deliveries: list[NotificationDelivery] = []
    for channel in payload.channels:
        if recipient_preferences is not None:
            enabled = {
                DeliveryChannel.PUSH: recipient_preferences.push_enabled,
                DeliveryChannel.SMS: recipient_preferences.sms_enabled,
                DeliveryChannel.EMAIL: recipient_preferences.email_enabled,
                DeliveryChannel.IN_APP: recipient_preferences.in_app_enabled,
            }[DeliveryChannel(channel.value)]
            if not enabled:
                continue

        delivery = NotificationDelivery(
            event_id=payload.event_id,
            recipient_user_id=payload.recipient_user_id,
            actor_user_id=payload.actor_user_id,
            channel=channel.value,
            locale=locale,
            event_type=payload.event_type,
            title=title,
            body=body,
            status=DeliveryStatus.SENT,
            provider_reference=f"notif_{uuid4().hex}",
            delivered_at=datetime.now(UTC),
        )
        session.add(delivery)
        deliveries.append(delivery)

    if not deliveries:
        delivery = NotificationDelivery(
            event_id=payload.event_id,
            recipient_user_id=payload.recipient_user_id,
            actor_user_id=payload.actor_user_id,
            channel=DeliveryChannel.IN_APP.value,
            locale=locale,
            event_type=payload.event_type,
            title=title,
            body=body,
            status=DeliveryStatus.FAILED,
            error="all channels opted out",
        )
        session.add(delivery)
        deliveries.append(delivery)

    await session.flush()
    return deliveries


async def list_inbox(session: AsyncSession, principal) -> list[NotificationDelivery]:
    user_id = _principal_uuid(principal)
    result = await session.scalars(
        select(NotificationDelivery)
        .where(NotificationDelivery.recipient_user_id == user_id)
        .order_by(NotificationDelivery.created_at.desc())
    )
    return list(result.all())