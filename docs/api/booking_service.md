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
- **No reschedule endpoint.** Cancel-and-rebook is the only path and it is **not atomic** — a
  failure between the two calls leaves the patient with no appointment at all.
- **No pagination** on `GET /v1/bookings`.
