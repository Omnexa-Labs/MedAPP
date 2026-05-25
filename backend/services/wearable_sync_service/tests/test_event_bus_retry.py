"""Audit finding B-19 — retry counter logic for the EventBus subscriber.

The full DLQ round-trip needs a real RabbitMQ (the DLX routing is
RabbitMQ-internal). What we CAN test here is the `_count_redeliveries`
function that drives the cap — given a message with the right
`x-death` header, the counter returns the prior attempt count, and the
subscriber knows when to nack-without-requeue to dead-letter the
message.
"""
from __future__ import annotations

from types import SimpleNamespace

from shared.events.bus import _count_redeliveries


def _message(*, headers: dict | None = None, redelivered: bool = False):
    """Build a minimal `AbstractIncomingMessage`-shaped object."""
    return SimpleNamespace(headers=headers, redelivered=redelivered)


def test_first_delivery_returns_zero() -> None:
    """No x-death header, not redelivered → first delivery."""
    assert _count_redeliveries(_message()) == 0


def test_first_delivery_with_redelivered_flag_returns_one() -> None:
    """When x-death is missing but the broker set `redelivered=True`,
    fall back to coarse counting — at least one prior delivery occurred."""
    assert _count_redeliveries(_message(redelivered=True)) == 1


def test_x_death_count_two_returns_two() -> None:
    """x-death's first entry's `count` is the canonical attempt counter."""
    msg = _message(headers={"x-death": [{"count": 2, "reason": "rejected"}]})
    assert _count_redeliveries(msg) == 2


def test_x_death_count_at_max_triggers_dlq_route() -> None:
    """At the retry cap (3 by default), the subscriber will
    nack-without-requeue → DLQ. The counter returning 3 is the signal."""
    msg = _message(headers={"x-death": [{"count": 3}]})
    assert _count_redeliveries(msg) == 3


def test_malformed_x_death_falls_back_to_zero() -> None:
    """Defensive: a bad x-death payload (wrong type, missing count) must
    not throw — return 0 and let the subscriber try once."""
    for bad in [
        {"x-death": "not-a-list"},
        {"x-death": []},
        {"x-death": [{}]},
        {"x-death": [{"count": "abc"}]},
        {"x-death": [None]},
    ]:
        assert _count_redeliveries(_message(headers=bad)) == 0


def test_empty_headers_returns_zero() -> None:
    assert _count_redeliveries(_message(headers={})) == 0
