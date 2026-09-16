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


## Slot-time contract (2026-09-13)

Availability weekdays use Python's calendar convention: Monday=0 through Sunday=6. Rule times are local wall clocks without an offset, paired with a valid IANA timezone. Invalid timezone names or offset-bearing rule clocks are rejected without replacing prior rules. Slot queries cover at most 31 calendar days, with `slot_minutes` constrained to 5–240.

Slot start/end values are explicit UTC instants derived from the rule timezone. Durations measure elapsed time across daylight-saving transitions: repeated clocks produce distinct instants, missing clocks are skipped, and a rule boundary inside a nonexistent local clock produces no slots for that day. Duplicate windows across overlapping rules are deduplicated. The doctor-service endpoint describes offerings; patient booking uses `/v1/bookings/slots` to remove occupied windows and revalidates at confirmation.


## Authenticated self profile (2026-09-14)

`GET /v1/doctors/me` and `PATCH /v1/doctors/me` resolve the JWT subject to the
unique doctor profile. The caller supplies no doctor/account ID. These static
routes are registered before `/{doctor_id}` and require doctor or admin role;
even an admin resolves only their own record here. Missing profiles return 404,
invalid subjects 401, and unrelated roles 403. GET includes an inactive owner's
profile so the UI can explain its state; PATCH refuses inactive profiles with 403.
The existing public ID-based read still excludes inactive records.

PATCH retains the DoctorUpdate field contract and sends only supplied fields.
Unknown/privileged fields are rejected, required name/listing/language fields
cannot be explicitly null, names are trimmed and bounded to 255 characters,
specialty is bounded to 255, biography to 10,000, and languages to 20 nonempty
names of at most 120 characters. Languages are trimmed and deduplicated. Optional
biography and specialty can be cleared with null. Fees/photo fields retain their
existing contract; the mobile editor currently changes name, specialty, biography,
languages and listing only. License verification, fee/currency administration,
affiliations and availability editing remain separate B03/B04 work.
