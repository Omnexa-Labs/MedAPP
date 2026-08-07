# API contract — `doctor_service`

**Prefix:** `/v1/doctors` · **Client:** `src/features/care/api.ts`

> Retro-documented 2026-08-07 (written before the documentation rule).

## Routes

`GET /v1/doctors` (+ query) · `GET /{id}` · `POST /` · `PATCH /{id}` · `DELETE /{id}`
· `GET | PUT /{id}/availability` · `GET /{id}/slots`

## Schemas

**`DoctorBase`** — `first_name`, `last_name`, `specialty?`, `bio?`, `languages[]`,
`consultation_fee_cents?`, `photo_url?`, `is_listable`.

**`AvailabilityRuleBase`** — `day_of_week` (0–6), `start_time`, `end_time`, `timezone`
(default `"UTC"`).

**`SlotOut`** — `doctor_id`, `starts_at`, `ends_at`, `timezone`.
**`SlotQuery`** — `from_date`, `to_date`, `slot_minutes` (5–240, default 30).

## Gaps and hazards

- **`consultation_fee_cents` is in CENTS.** Rendering it raw shows a 100× price.
- **`is_listable` defaults to FALSE.** A newly created doctor is invisible in Find Care until it is
  flipped — the usual cause of "the doctor I created does not appear".
- **`day_of_week` is 0–6 with no documented anchor** (Monday or Sunday). Verify before building a
  weekly editor. Nothing depends on it yet: the practitioner profile renders a single summary line
  (`weeklyHours` returns `{label, closedLabel, timezone}`), not a day grid.
- **Slots are COMPUTED from availability rules, not stored, and are not reservations.** Two patients
  can be offered the same slot; only the booking POST resolves the conflict. Any "slot held" or
  "reserved for you" wording in the UI would be untrue.
