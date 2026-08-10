# API contract — `analytics_service`

**Prefixes:** `/v1/admin` (gateway-routed, admin-only) and `/v1/internal` (**not** gateway-routed)
· **Client:** none, deliberately — see below.

> No new endpoints created. **No mobile client written**, and that is the finding rather than an
> omission.

## Routes

| Method | Path | Guard | Verified live |
| --- | --- | --- | --- |
| GET | `/v1/admin/metrics/funnel?from=&to=` | admin only | patient token → **403** |
| GET | `/v1/admin/metrics/retention` | admin only | — |
| GET | `/v1/admin/doctors/{id}/scorecard` | admin only | — |
| POST | `/v1/internal/events` | **none** | public → **404 unknown route** |

## Why no client was written

Every read is `_ensure_admin(principal)` → `403 admin access required`, confirmed live with a
patient token. **MedApp mobile is a patient and practitioner app; it has no admin surface at all.**

Shipping a client for admin metrics into a patient build would put funnel conversion, retention
cohorts and per-doctor scorecards one careless import away from a screen — the same reasoning that
kept `/v1/social/moderation` and `/v1/onboarding/{id}/review` unwrapped. There is nothing here for
the app to call, so the honest deliverable is this document and no code.

If an admin console is ever built, it is a **separate product surface** with its own auth story,
not a role branch inside the patient app.

## `POST /v1/internal/events` — unauthenticated, and safe only because it is unrouted

`ingest()` takes no principal. It is not in the gateway `ROUTES` table, so it is reachable only
inside the compose network — the same pattern as `user_service`'s `GET /users/{id}`.

**That safety is entirely network isolation.** Two things follow:

1. **It must never be added to `ROUTES`.** A public unauthenticated ingest is an open write endpoint
   into the analytics store — anyone could forge booking, payment and doctor events, and the funnel
   and retention numbers are what the business reads.
2. The payload carries `subject_user_id`, `booking_id`, `doctor_id`, `payment_id`, `amount_cents`
   and a free-form `metadata` dict. Whatever a caller puts in `metadata` lands in an analytics
   table, so **health details must not be sent through it** — a symptom string in an analytics
   event is PHI in a system with no consent record and no purge job.

## `EventIngest` fields

`event_id` (UUID, caller-supplied), `event_type`, `source`, `subject_user_id?`, `occurred_at`,
`booking_id?`, `doctor_id?`, `payment_id?`, `amount_cents?` (**cents**, `ge=0`), `currency?`,
`status?`, `metadata` (free-form dict), `notes?`.

`event_id` being caller-supplied is what makes ingest idempotent — a retried publish should reuse
the same id rather than double-counting a booking.

## Wiring status

| Surface | State |
| --- | --- |
| Mobile client | **None, by decision.** No admin surface exists in this app. |
| Admin console | Does not exist. Would be a separate product. |
| Event ingest | Service-to-service only. No service currently publishes to it — the funnel and retention endpoints will return zeros until something does. |
