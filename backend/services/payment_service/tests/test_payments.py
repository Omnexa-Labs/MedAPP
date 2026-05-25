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

    refund = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "customer request"},
        headers={"Idempotency-Key": "refund-key-1"},
    )
    assert refund.status_code == 200, refund.text
    assert refund.json()["status"] == "requested"


# Audit findings C-8 + B-16: webhook secrets come from env now, not from
# a hardcoded literal. Keep these aligned with what conftest sets.
_STRIPE_SECRET = b"stripe-test-secret-for-pytest"
_MPESA_SECRET = b"mpesa-test-secret-for-pytest"


@pytest.mark.asyncio
async def test_payment_webhook_idempotency(client, payment_payload):
    created = await client.post("/v1/payments/intent", json=payment_payload)
    payment_id = created.json()["payment_id"]
    payload = {
        "id": "evt_123",
        "data": {"object": {"id": created.json()["provider_reference"], "status": "succeeded"}},
    }
    raw = json.dumps(payload).encode()
    signature = hmac.new(_STRIPE_SECRET, raw, hashlib.sha256).hexdigest()
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
    refund = await client.post(
        f"/v1/payments/{payment_id}/refund",
        json={"reason": "too soon"},
        headers={"Idempotency-Key": "too-soon-key"},
    )
    assert refund.status_code == 409


# ── Audit finding C-8 regression: Stripe must use configured secret ─────────


@pytest.mark.asyncio
async def test_stripe_no_longer_accepts_change_me_signature(client):
    """A perfectly-signed forgery against the old hardcoded literal must now
    be rejected — proof the `"change-me"` literal is gone from the code."""
    payload = {"id": "evt_change_me", "data": {"object": {"id": "pi_x", "status": "succeeded"}}}
    raw = json.dumps(payload).encode()
    old_forged_sig = hmac.new(b"change-me", raw, hashlib.sha256).hexdigest()
    response = await client.post(
        "/v1/webhooks/stripe",
        content=raw,
        headers={"Stripe-Signature": old_forged_sig},
    )
    assert response.status_code == 401


# ── Audit finding B-16 regression: M-Pesa webhook must verify signature ─────


@pytest.mark.asyncio
async def test_mpesa_webhook_rejects_unsigned(client, payment_payload):
    """B-16: M-Pesa used to accept any payload with no signature check at all."""
    payload = {
        "event_id": "mpesa_evt_unsigned",
        "payment_reference": "ref",
        "status": "succeeded",
    }
    response = await client.post("/v1/webhooks/mpesa", json=payload)
    assert response.status_code == 401
    assert "mpesa" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_mpesa_webhook_rejects_bad_signature(client):
    payload = {"event_id": "mpesa_evt_bad", "payment_reference": "ref", "status": "succeeded"}
    raw = json.dumps(payload).encode()
    response = await client.post(
        "/v1/webhooks/mpesa",
        content=raw,
        headers={"X-MPESA-Signature": "bad-signature"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mpesa_webhook_accepts_valid_signature(client, payment_payload):
    created = await client.post(
        "/v1/payments/intent",
        json={**payment_payload, "method": "mpesa", "idempotency_key": "idem-mpesa"},
    )
    payload = {
        "event_id": "mpesa_evt_ok",
        "payment_reference": created.json()["provider_reference"],
        "status": "succeeded",
    }
    raw = json.dumps(payload).encode()
    signature = hmac.new(_MPESA_SECRET, raw, hashlib.sha256).hexdigest()
    response = await client.post(
        "/v1/webhooks/mpesa",
        content=raw,
        headers={"X-MPESA-Signature": signature},
    )
    assert response.status_code == 200, response.text