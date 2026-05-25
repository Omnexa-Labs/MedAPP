"""NotificationDispatcher — agent layer → notification_service.

Closes the loop between "agent detected something" and "patient hears
about it." Used by:

- `smart_recommend_agent` after each `write_recommendation` — fires when
  the signal's severity is `warn` or `urgent`.
- `vitals_watcher_agent` after each anomaly event publish — fires when
  the anomaly severity is `warning` or `critical`.

The dispatcher does three things:

1. **Severity → channel routing.** Conservative — `info` stays in-app
   only (visible when the patient opens the app). `warn`/`warning` adds
   push. `urgent`/`critical` adds push (and SMS later in a follow-up
   slice).
2. **Per-(patient, dedup_key) suppression.** A second-tier guard on top
   of agent throttles — even if a different upload squeezes past the
   60-300s agent throttle and re-fires the same dedup_key, the
   notification is suppressed for `suppression_seconds` (default 6h).
   Prevents notification fatigue on a single underlying issue.
3. **Best-effort send.** notification_service down → log and continue.
   The agent's user-visible reply is never blocked by a notification
   failure.

When `notification_service_url` is empty the dispatcher becomes a no-op
that returns `False` from every `notify()` call. Lets the agents run in
dev / test environments without infrastructure.
"""
from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx

logger = logging.getLogger(__name__)


# These match the severities used by smart_recommend (info/warn/urgent)
# and vitals_watcher (warning/critical). The dispatcher treats `warn` and
# `warning` as equivalent and `urgent` and `critical` as equivalent so
# callers don't have to translate.
Severity = Literal["info", "warn", "warning", "urgent", "critical"]

# Channels available on notification_service. See backend schemas/notification.py.
Channel = Literal["in_app", "push", "sms", "email"]


# Severity → channels routing. Conservative defaults; can be overridden
# at construction time if a specific deployment wants different policies.
DEFAULT_ROUTING: dict[Severity, tuple[Channel, ...]] = {
    "info": ("in_app",),
    "warn": ("in_app", "push"),
    "warning": ("in_app", "push"),
    "urgent": ("in_app", "push"),
    "critical": ("in_app", "push"),
}


class NotificationDispatcher:
    def __init__(
        self,
        *,
        notification_service_url: str | None,
        service_token: str,
        suppression_seconds: int = 6 * 3600,
        capacity: int = 4096,
        http_timeout: float = 5.0,
        routing: dict[Severity, tuple[Channel, ...]] | None = None,
    ) -> None:
        self._url = (notification_service_url or "").rstrip("/")
        self._token = service_token
        self._suppression = timedelta(seconds=suppression_seconds)
        self._capacity = capacity
        self._http_timeout = http_timeout
        self._routing = routing or DEFAULT_ROUTING
        # Per-pod LRU. When >1 replica is deployed, this becomes a noisy
        # but bounded source of duplicates — promote to Redis in slice 2.
        self._last_sent: OrderedDict[str, datetime] = OrderedDict()
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self._url)

    async def notify(
        self,
        *,
        patient_id: str,
        severity: Severity,
        event_type: str,
        title: str,
        body: str,
        dedup_key: str | None = None,
    ) -> bool:
        """Send a notification. Returns True iff the HTTP call returned 2xx.

        False covers four cases (all silent — caller doesn't need to care):
        - dispatcher disabled (no URL configured)
        - severity routes to no channels
        - the patient + dedup_key was already notified within the window
        - the HTTP call failed

        The agent's caller is the same in all cases: best-effort, fire,
        keep going.
        """
        if not self.enabled:
            logger.debug("notify.disabled severity=%s patient=%s", severity, patient_id)
            return False

        channels = self._routing.get(severity, ())
        if not channels:
            logger.debug("notify.no_channels_for_severity severity=%s", severity)
            return False

        if dedup_key and not await self._mark_sent(patient_id, dedup_key):
            logger.debug(
                "notify.suppressed patient=%s dedup_key=%s within_window=%ss",
                patient_id,
                dedup_key,
                self._suppression.total_seconds(),
            )
            return False

        payload = {
            # event_id is the service-side dedup signal. We compose it from
            # patient + dedup_key + a coarse time bucket so the service sees
            # the same id for a recurring issue within a window.
            "event_id": _stable_event_id(patient_id, dedup_key, event_type),
            "recipient_user_id": patient_id,
            "event_type": event_type,
            "title": title[:255],
            "body": body,
            "channels": list(channels),
        }
        return await self._post(payload)

    async def _mark_sent(self, patient_id: str, dedup_key: str) -> bool:
        """Returns True if the caller should send. Records the send time."""
        key = f"{patient_id}:{dedup_key}"
        async with self._lock:
            now = datetime.now(timezone.utc)
            last = self._last_sent.get(key)
            if last is not None and (now - last) < self._suppression:
                self._last_sent.move_to_end(key)
                return False
            self._last_sent[key] = now
            self._last_sent.move_to_end(key)
            while len(self._last_sent) > self._capacity:
                self._last_sent.popitem(last=False)
        return True

    async def _post(self, payload: dict) -> bool:
        url = f"{self._url}/v1/notifications/send"
        try:
            async with httpx.AsyncClient(timeout=self._http_timeout) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self._token}",
                        # Audit-trail hint for the notification service —
                        # who the notification is about.
                        "X-Patient-Id": payload["recipient_user_id"],
                    },
                    json=payload,
                )
        except httpx.HTTPError:
            logger.exception(
                "notify.http_failed event_type=%s patient=%s",
                payload.get("event_type"),
                payload.get("recipient_user_id"),
            )
            return False
        if resp.status_code >= 400:
            logger.warning(
                "notify.non_ok status=%s event_type=%s patient=%s body=%r",
                resp.status_code,
                payload.get("event_type"),
                payload.get("recipient_user_id"),
                resp.text[:200],
            )
            return False
        return True


# ── Helpers / factory ───────────────────────────────────────────────────────


def _stable_event_id(patient_id: str, dedup_key: str | None, event_type: str) -> str:
    """Build an event_id that's stable for the same underlying issue.

    Time bucket is the day, in UTC. A glucose-trend recommendation that
    fires on Mon and Tue gets two different event_ids (good — each is its
    own daily nudge); the same issue twice on Mon gets the same id (and
    the notification service can dedup).
    """
    day = datetime.now(timezone.utc).date().isoformat()
    if dedup_key:
        return f"{event_type}:{patient_id}:{dedup_key}:{day}"
    return f"{event_type}:{patient_id}:{day}"


def make_notification_dispatcher_from_env(
    *,
    notification_service_url: str,
    service_token: str,
    suppression_seconds: int = 6 * 3600,
) -> NotificationDispatcher:
    """Construct the dispatcher with config explicitly. Stays config-driven
    rather than reading env directly so each agent's config layer owns the
    settings name (`SMART_RECOMMEND_NOTIFICATION_SERVICE_URL` etc.).
    """
    return NotificationDispatcher(
        notification_service_url=notification_service_url or None,
        service_token=service_token,
        suppression_seconds=suppression_seconds,
    )


__all__ = [
    "Channel",
    "DEFAULT_ROUTING",
    "NotificationDispatcher",
    "Severity",
    "make_notification_dispatcher_from_env",
]
