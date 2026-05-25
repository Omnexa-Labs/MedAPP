"""NotificationDispatcher unit tests.

Verifies the four behaviour properties:

1. Severity → channels routing matches the documented policy.
2. Per-(patient, dedup_key) suppression holds for `suppression_seconds`.
3. The dispatcher is disabled (returns False) when no URL is configured.
4. HTTP failures are swallowed — `notify()` returns False, never raises.

We don't stand up a real notification_service. The `httpx.AsyncClient` is
patched with a `MockTransport` so the test can assert what the dispatcher
would send over the wire.
"""
from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from agents.shared.notify import (
    DEFAULT_ROUTING,
    NotificationDispatcher,
    _stable_event_id,
)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _make_dispatcher(
    *,
    url: str | None = "http://notif.test",
    suppression: int = 3600,
    transport: httpx.MockTransport | None = None,
) -> tuple[NotificationDispatcher, list[httpx.Request]]:
    """Build a dispatcher whose HTTP calls go to the supplied MockTransport
    (or a default one that 201s every call). Returns the call log."""
    captured: list[httpx.Request] = []

    def _default_handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            201,
            json=[
                {
                    "delivery_id": "00000000-0000-0000-0000-000000000001",
                    "event_id": "x",
                    "recipient_user_id": "00000000-0000-0000-0000-000000000002",
                    "actor_user_id": None,
                    "channel": "in_app",
                    "locale": "en",
                    "event_type": "x",
                    "title": "x",
                    "body": "x",
                    "status": "queued",
                    "provider_reference": None,
                    "delivered_at": None,
                    "error": None,
                }
            ],
        )

    t = transport or httpx.MockTransport(_default_handler)
    d = NotificationDispatcher(
        notification_service_url=url,
        service_token="test-service-token",
        suppression_seconds=suppression,
    )
    # Swap the dispatcher's underlying client builder. Easier than DI — the
    # `_post` method instantiates httpx.AsyncClient directly. We monkeypatch
    # the module's httpx.AsyncClient via a fixture in the actual tests.
    return d, captured


# ── Disabled mode ───────────────────────────────────────────────────────────


async def test_disabled_when_url_empty() -> None:
    d = NotificationDispatcher(
        notification_service_url="",
        service_token="x",
        suppression_seconds=60,
    )
    assert d.enabled is False
    sent = await d.notify(
        patient_id="p1",
        severity="critical",
        event_type="x",
        title="t",
        body="b",
    )
    assert sent is False


async def test_disabled_when_url_none() -> None:
    d = NotificationDispatcher(
        notification_service_url=None,
        service_token="x",
        suppression_seconds=60,
    )
    assert d.enabled is False


# ── Severity routing ────────────────────────────────────────────────────────


def test_default_routing_info_stays_in_app() -> None:
    assert DEFAULT_ROUTING["info"] == ("in_app",)


def test_default_routing_warn_adds_push() -> None:
    assert "push" in DEFAULT_ROUTING["warn"]
    assert "push" in DEFAULT_ROUTING["warning"]


def test_default_routing_critical_includes_push() -> None:
    assert "push" in DEFAULT_ROUTING["critical"]
    assert "push" in DEFAULT_ROUTING["urgent"]


async def test_unknown_severity_routes_to_no_channels(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No matching routing → notify returns False, no HTTP call attempted."""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=60,
    )
    sent = await d.notify(
        patient_id="p1",
        severity="bogus",  # type: ignore[arg-type]
        event_type="x",
        title="t",
        body="b",
    )
    assert sent is False
    assert requests == []  # never reached the HTTP layer


# ── Suppression window ──────────────────────────────────────────────────────


async def test_first_notify_succeeds_second_is_suppressed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=3600,
    )
    a = await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
        dedup_key="hr-spike",
    )
    b = await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
        dedup_key="hr-spike",
    )
    assert a is True
    assert b is False
    assert len(requests) == 1  # only the first call hit the HTTP layer


async def test_different_dedup_keys_are_not_suppressed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=3600,
    )
    await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
        dedup_key="hr-spike",
    )
    await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
        dedup_key="bp-spike",
    )
    assert len(requests) == 2


async def test_different_patients_are_not_suppressed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=3600,
    )
    await d.notify(
        patient_id="alice",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
        dedup_key="hr-spike",
    )
    await d.notify(
        patient_id="bob",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
        dedup_key="hr-spike",
    )
    assert len(requests) == 2


async def test_no_dedup_key_means_no_suppression(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Without a dedup_key, every notify hits the HTTP layer.

    Suppression is opt-in by passing dedup_key — callers without a stable
    key shouldn't accidentally be suppressed by a missing-key default.
    """
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=3600,
    )
    for _ in range(3):
        await d.notify(
            patient_id="p1",
            severity="warning",
            event_type="x",
            title="t",
            body="b",
        )
    assert len(requests) == 3


# ── Wire payload ────────────────────────────────────────────────────────────


async def test_payload_contains_required_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        captured["headers"] = dict(request.headers)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test/",  # trailing slash trimmed
        service_token="my-token",
        suppression_seconds=60,
    )
    await d.notify(
        patient_id="patient-uuid",
        severity="critical",
        event_type="vitals_watcher.critical",
        title="Important: vital sign needs attention",
        body="HR 185 critically high",
        dedup_key="heart_rate:2026-05-21T12:00",
    )
    body = captured["body"]
    assert body["recipient_user_id"] == "patient-uuid"
    assert body["event_type"] == "vitals_watcher.critical"
    assert body["title"] == "Important: vital sign needs attention"
    assert body["body"] == "HR 185 critically high"
    assert "in_app" in body["channels"]
    assert "push" in body["channels"]
    # event_id includes patient + dedup_key + date for service-side dedup.
    assert "patient-uuid" in body["event_id"]
    assert "heart_rate" in body["event_id"]
    assert captured["headers"]["authorization"] == "Bearer my-token"
    assert captured["headers"]["x-patient-id"] == "patient-uuid"


async def test_title_is_truncated_to_255_chars(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(201, json=[])

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=60,
    )
    long_title = "X" * 300
    await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title=long_title,
        body="b",
    )
    assert len(captured["body"]["title"]) == 255


# ── HTTP failure modes ──────────────────────────────────────────────────────


async def test_5xx_response_returns_false_does_not_raise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream down")

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=60,
    )
    sent = await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
    )
    assert sent is False


async def test_4xx_response_returns_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text="bad request")

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=60,
    )
    sent = await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
    )
    assert sent is False


async def test_network_failure_returns_false_does_not_raise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    _patch_httpx_with(monkeypatch, handler)

    d = NotificationDispatcher(
        notification_service_url="http://notif.test",
        service_token="x",
        suppression_seconds=60,
    )
    sent = await d.notify(
        patient_id="p1",
        severity="warning",
        event_type="x",
        title="t",
        body="b",
    )
    assert sent is False


# ── event_id stability ──────────────────────────────────────────────────────


def test_event_id_includes_patient_dedup_and_date() -> None:
    eid = _stable_event_id("alice", "hr-spike", "vitals_watcher.warning")
    assert "vitals_watcher.warning" in eid
    assert "alice" in eid
    assert "hr-spike" in eid


def test_event_id_without_dedup_key_still_valid() -> None:
    eid = _stable_event_id("alice", None, "smart_recommend.lifestyle.proposed")
    assert "alice" in eid
    assert "smart_recommend.lifestyle.proposed" in eid


def test_event_id_is_same_for_same_inputs_same_day() -> None:
    a = _stable_event_id("alice", "k", "e")
    b = _stable_event_id("alice", "k", "e")
    assert a == b


# ── httpx patching helper ───────────────────────────────────────────────────


def _patch_httpx_with(
    monkeypatch: pytest.MonkeyPatch, handler
) -> None:
    """Replace `httpx.AsyncClient` constructor so the dispatcher uses a
    MockTransport. Acts on the `notify` module's bound reference."""
    from agents.shared import notify as notify_module

    real_client = httpx.AsyncClient

    def _factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(notify_module.httpx, "AsyncClient", _factory)
