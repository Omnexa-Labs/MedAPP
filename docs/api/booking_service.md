# API contract — `booking_service`

**Prefix:** `/v1/bookings` · **Source:** `app/schemas/booking.py`
· **Clients:** `src/features/booking/api.ts`, `src/features/appointments/api.ts`

> Retro-documented 2026-08-07 (written before the documentation rule).

## Routes

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/v1/bookings` | `BookingCreate` | `BookingOut` |
| GET | `/v1/bookings` | — | `BookingList` |
| GET | `/v1/bookings/{booking_id}` | — | `BookingOut` |
| POST | `/v1/bookings/{booking_id}/cancel` | `BookingCancel` | `BookingOut` |
| GET | `/v1/bookings/summary` | — | `BookingSummaryOut` |
| GET | `/v1/bookings/schedule` | — | `BookingScheduleList` (practitioner view) |
| GET | `/v1/bookings/schedule/summary` | — | `BookingScheduleSummaryOut` |

## Schemas

**`BookingOut`** — `booking_id`, `user_id`, `doctor_id`, `starts_at`, `ends_at`, `status`
(`booked | cancelled`), `mode` (`in_person | video`), `room_id?`, `reason?`, `notes?`,
`cancelled_at?`, `cancellation_reason?`.

**`BookingScheduleOut`** is a **different shape** — `patient_id` instead of `user_id`, and no
`reason` / `notes`. The practitioner view deliberately withholds the stated reason.

## Gaps and hazards

- **`status` has only TWO values on the wire.** "Completed" is derived client-side from
  `ends_at <= now` (`appointments/api.ts::resolveStatus`); there is no completed state in the
  database. A past **cancelled** booking must be tested for `cancelled` FIRST, or it renders as
  completed — a cancelled appointment shown as attended is a clinical record error, not a cosmetic
  one.
- **`mode` is `in_person` on the wire and `in-person` in the app.** Mapped in `resolveMode`; sending
  the app spelling back falls through silently to in-person.
- **Atomic rescheduling is implemented.** Use `POST /v1/bookings/{id}/reschedule`, described below.

- **No pagination** on `GET /v1/bookings`.


## B02 availability and atomic rescheduling (2026-09-13)

`GET /v1/bookings/slots?doctor_id=<uuid>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`
requires authentication and returns `{"items": [{"doctor_id", "starts_at", "ends_at", "timezone"}]}` with `Cache-Control: no-store`. Dates refer to the clinician's availability rules, not the patient's timezone. Requests cover at most 31 calendar days. The booking grid uses 30-minute slots. Responses contain explicit UTC instants, omit past and already-booked windows, and never expose patient identifiers or booking notes. An empty response means no available slots. Directory outages or malformed/naive upstream instants return 503, not sample availability.

Creation now rechecks the exact offered start/end pair and resolves the clinician's user identity before confirming. Unoffered or occupied windows return 409. Unavailable clinician identity returns 503 without creating a booking. Historical NULL clinician links still deny practitioner access and remain eligible for the existing backfill.

`POST /v1/bookings/{booking_id}/reschedule` accepts the same body as creation. Only the patient who owns the booking or an admin may call it; the appointment must be upcoming and booked, and the clinician cannot change. The original is cancelled and a replacement is created in the same transaction. A failed availability, identity or conflict check rolls back the original cancellation. The response is the persisted replacement `BookingOut`. Retrying an identical request returns the same replacement; a different request against that original returns 409. Concurrent cancellation and rescheduling lock the original row. Rescheduling retains the original patient when performed by an admin.

Apply migration `20260913_0005` before deploying this service. It adds a unique replacement relation, positive-window check, and a PostgreSQL GiST exclusion constraint for overlapping booked windows per clinician (`[start, end)`, so adjacent visits remain valid). It requires the `btree_gist` extension. Existing overlaps or invalid windows stop the migration; reconcile them explicitly instead of silently cancelling appointments. Downgrade refuses while reschedule history exists.

Video replacement bookings use the existing room-provisioning flow. An unavailable room leaves a real booking with `room_id=null`. Cross-service room reconciliation and cancellation of old rooms remain part of consultation lifecycle work. The current booking endpoint does not collect payment or enforce a 24-hour free-cancellation policy.


### Mobile confirmation and appointment history — 2026-09-13

Review sends the persisted booking ID to confirmation. The confirmation/detail
screen reloads the booking and clinician independently, so a clinician-directory
outage does not erase the saved appointment. Caller-supplied names, clocks and
status are not confirmation data. Missing IDs, access failures and invalid time
windows show a recoverable state without claiming a booking was confirmed.

Upcoming and history cards both reopen that ID. History distinguishes cancelled
bookings from elapsed scheduled times (`past` in the mobile adapter); it does not
infer clinical completion. Cancelled and past details omit preparation and calendar
actions. Current appointments use the stored instants for calendar writes and
show device-local times with explicit UTC offsets, including changes across DST.
Refresh reloads status, and account/booking changes stop pending calendar actions
before a write when the permission prompt has not yet completed.
