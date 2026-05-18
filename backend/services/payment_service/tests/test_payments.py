from __future__ import annotations

import hashlib
import hmac
import json
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.payment import Payment, PaymentEvent, PaymentRefund, PaymentStatus


@pytest.mark.asyncio
async def test_create_payment_intent(client, payment_payload):
    response = await client.post("/v1/payments/intent", json=payment_payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == PaymentStatus.PENDING.value
    assert body["method"] == "stripe"
    assert body["amount_cents"] == 12500
    assert body["metadata_json"] == {"source": "test"}


@pytest.mark.asyncio
async def test_get_payment_and_refund(client, sessionmaker, payment_payload, principal_user, succeeded_payment):
    created = await client.post("/v1/payments/intent", json=payment_payload)
    payment_id = created.json()["payment_id"]

    async with sessionmaker() as session:
        payment = await session.get(Payment, UUID(payment_id))
        payment.status = PaymentStatus.SUCCEEDED
        await session.commit()

    fetched = await client.get(f"/v1/payments/{payment_id}")
    assert fetched.status_code == 200

    refund = await client.post(f"/v1/payments/{payment_id}/refund", json={"reason": "customer request"})
    assert refund.status_code == 200, refund.text
    assert refund.json()["status"] == "requested"


@pytest.mark.asyncio
async def test_payment_webhook_idempotency(client, payment_payload):
    created = await client.post("/v1/payments/intent", json=payment_payload)
    payment_id = created.json()["payment_id"]
    payload = {
        "id": "evt_123",
        "data": {"object": {"id": created.json()["provider_reference"], "status": "succeeded"}},
    }
    raw = json.dumps(payload).encode()
    signature = hmac.new(b"change-me", raw, hashlib.sha256).hexdigest()
    first = await client.post("/v1/webhooks/stripe", content=raw, headers={"Stripe-Signature": signature})
    assert first.status_code == 200, first.text
    second = await client.post("/v1/webhooks/stripe", content=raw, headers={"Stripe-Signature": signature})
    assert second.status_code == 200


@pytest.mark.asyncio
async def test_webhook_signature_rejects_tamper(client, payment_payload):
    payload = {
        "id": "evt_bad",
        "data": {"object": {"id": "pi_bad", "status": "succeeded"}},
    }
    raw = json.dumps(payload).encode()
    response = await client.post("/v1/webhooks/stripe", content=raw, headers={"Stripe-Signature": "bad"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_non_succeeded_refund_fails(client, payment_payload):
    created = await client.post("/v1/payments/intent", json=payment_payload)
    payment_id = created.json()["payment_id"]
    refund = await client.post(f"/v1/payments/{payment_id}/refund", json={"reason": "too soon"})
    assert refund.status_code == 409