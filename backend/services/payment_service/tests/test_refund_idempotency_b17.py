"""Audit finding B-17 regression: /refund must be idempotent.

The refund route accepts an ``Idempotency-Key`` header. A retry with
the same key + same body returns the cached response without creating
a second refund row. A retry with the same key but a *different* body
returns 409.
"""
from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.payment import Payment, PaymentRefund, PaymentStatus
from app.models.idempotency import IdempotencyRecord


async def _make_succeeded_intent(client, sessionmaker, payment_payload) -> str:
    created = await client.post("/v1/payments/intent", json=payment_payload)
    payment_id = created.json()["payment_id"]
    async with sessionmaker() as session:
        payment = await session.get(Payment, UUID(payment_id))
        payment.status = PaymentStatus.SUCCEEDED
        await session.commit()
    return payment_id


@pytest.mark.asyncio
async def test_refund_requires_idempotency_key(client, sessionmaker, payment_payload):
    payment_id = await _make_succeeded_intent(client, sessionmaker, payment_payload)
    resp = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "no header"},
    )
    assert resp.status_code == 400
    assert "idempotency-key" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refund_empty_idempotency_key_rejected(client, sessionmaker, payment_payload):
    payment_id = await _make_succeeded_intent(client, sessionmaker, payment_payload)
    resp = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "blank"},
        headers={"Idempotency-Key": "   "},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_refund_replay_returns_cached_response_and_no_duplicate_row(
    client, sessionmaker, payment_payload
):
    """The exploit scenario: client retries the same refund (timeout, etc.).
    Second call must NOT create a second refund row, must NOT double-flip
    payment.status, and must return the same body."""
    payment_id = await _make_succeeded_intent(client, sessionmaker, payment_payload)

    first = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "customer request", "amount_cents": 5000},
        headers={"Idempotency-Key": "retry-key-1"},
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "customer request", "amount_cents": 5000},
        headers={"Idempotency-Key": "retry-key-1"},
    )
    assert second.status_code == 200, second.text
    assert second.json() == first.json()

    # Exactly one refund row, idempotency record stored.
    async with sessionmaker() as session:
        refunds = (await session.scalars(select(PaymentRefund))).all()
        assert len(refunds) == 1
        records = (await session.scalars(select(IdempotencyRecord))).all()
        assert len(records) == 1
        assert records[0].response_status == 200
        assert records[0].scope == f"refund:{payment_id}"


@pytest.mark.asyncio
async def test_refund_key_reuse_with_different_body_returns_409(
    client, sessionmaker, payment_payload
):
    """Same key, different body → 409. Without this, a client bug that
    reuses a key across two distinct refund requests would silently
    return the wrong cached response."""
    payment_id = await _make_succeeded_intent(client, sessionmaker, payment_payload)

    first = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "first", "amount_cents": 3000},
        headers={"Idempotency-Key": "shared-key"},
    )
    assert first.status_code == 200

    second = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "different", "amount_cents": 4000},
        headers={"Idempotency-Key": "shared-key"},
    )
    assert second.status_code == 409
    assert "different" in second.json()["detail"].lower()

    async with sessionmaker() as session:
        refunds = (await session.scalars(select(PaymentRefund))).all()
        assert len(refunds) == 1


@pytest.mark.asyncio
async def test_refund_same_key_different_payment_is_independent(
    client, sessionmaker, payment_payload
):
    """Idempotency is scoped to (user, payment_id, key). Reusing the same
    header value on a *different* payment is a separate scope, so it
    must process normally and create its own refund row."""
    first_payment_id = await _make_succeeded_intent(
        client, sessionmaker, payment_payload
    )
    second_payment_id = await _make_succeeded_intent(
        client,
        sessionmaker,
        {**payment_payload, "idempotency_key": "intent-key-2"},
    )

    a = await client.post(
        f"/v1/payments/{first_payment_id}/refund",
        json={"reason": "first refund"},
        headers={"Idempotency-Key": "same-header-value"},
    )
    b = await client.post(
        f"/v1/payments/{second_payment_id}/refund",
        json={"reason": "second refund"},
        headers={"Idempotency-Key": "same-header-value"},
    )
    assert a.status_code == 200
    assert b.status_code == 200
    assert a.json()["payment_id"] != b.json()["payment_id"]

    async with sessionmaker() as session:
        refunds = (await session.scalars(select(PaymentRefund))).all()
        assert len(refunds) == 2
        records = (await session.scalars(select(IdempotencyRecord))).all()
        assert len(records) == 2


@pytest.mark.asyncio
async def test_refund_idempotency_key_too_long_rejected(
    client, sessionmaker, payment_payload
):
    payment_id = await _make_succeeded_intent(client, sessionmaker, payment_payload)
    resp = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "too long"},
        headers={"Idempotency-Key": "x" * 129},
    )
    assert resp.status_code == 400
