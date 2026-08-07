# API contract — `payment_service`

**Prefixes:** `/v1/payments`, `/v1/webhooks` · **Client:** none, deliberately — see below.

> No new endpoints created. **No mobile client written.** The reason is not effort: this service
> does not take money.

## NO PROVIDER IS INTEGRATED. PAYMENTS ARE SIMULATED.

`create_payment_intent` sets:

```python
provider_reference = f"{_provider_prefix(payload.method)}_{uuid4().hex}"
```

That is the whole of it. There is **no Stripe SDK, no M-Pesa HTTP call, no provider client anywhere
in the service** — `app/services/` contains only `payment_service.py`, `idempotency.py` and
`root_service.py`. `POST /stripe` and `POST /mpesa` mint a random reference and record a row.

**A payment can therefore reach `confirmed` without a single currency unit moving.** Wiring a
"Pay now" button to this would show a patient a successful payment for a consultation nobody has
been charged for — and for a booking that may then be treated as paid.

That is why no client exists. This is the one service where shipping a plausible-looking client is
actively dangerous, and it needs a product and provider decision before any UI touches it.

## Routes

| Method | Path | Note |
| --- | --- | --- |
| GET | `/v1/payments/` | list — needs the TRAILING SLASH (`/v1/payments` is 404) |
| GET | `/v1/payments/{id}` | one payment |
| POST | `/v1/payments/intent` | creates a row; no provider call |
| POST | `/v1/payments/mpesa` · `/stripe` | simulated, see above |
| POST | `/v1/payments/{id}/refund` | records a refund row |
| POST | `/v1/webhooks/*` | provider callbacks — nothing calls them today |

Auth is fine: a fresh patient token reaches the service (an earlier 401 was an expired token, not a
secret mismatch — `PAYMENT_JWT_SECRET` matches the `PAYMENT_` prefix, unlike the `SOCIAL_` bug).

## What IS solid here

**Idempotency is real and worth keeping.** `PaymentCreate.idempotency_key` is looked up before
insert, an existing payment is returned unchanged, and **a key reused by a DIFFERENT user is a
409** rather than a silent cross-account read. There is a dedicated `idempotency_records` table
(migration `20260523_0002`, audit finding B-17). Whoever integrates a real provider should build on
this rather than around it.

`amount_cents` is `gt=0` and `currency` is a strict 3-character code.

## Gaps and hazards

- **`amount_cents` is CENTS.** A raw render is 100x the price, same as the doctor and nurse fees.
- **`metadata_json` is `dict[str, str]`** and lands in the payments table. Not a place for anything
  clinical.
- **Refund takes an optional `amount_cents`** — omitted means full refund. A UI must be explicit
  about which it is doing; "Refund" with no amount is a full refund, not a no-op.
- **`status` and refund `status` are separate fields with separate lifecycles.** A refunded payment
  is not the same as a failed one.
- **No pagination** on the payment list.

## Wiring status

| Surface | State |
| --- | --- |
| Mobile client | **None, by decision.** No provider is integrated; a client would misrepresent money. |
| Booking payment step | Not wired. `booking_service` has no payment gate either — a booking is created regardless. |

**Decision needed before any of this moves:** which provider (Stripe? M-Pesa? both, by region),
who holds the keys, and whether a booking may be confirmed before payment succeeds. Those answers
shape the client entirely, and none of them is a wiring question.
