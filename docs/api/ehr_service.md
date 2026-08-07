# API contract — `ehr_service`

**Base prefix:** `/v1/patients` · **Source of truth:** `backend/services/ehr_service/app/schemas/record.py`
· **Client:** `frontend/mobile/MedAPP/src/features/overview/api.ts`

> **No new endpoints were created.** Per the CTO's rule, every route below already existed. Two
> *bugs* were fixed so they could answer at all — see "Two stacked bugs" below.

---

## Routes

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/v1/patients/{patient_id}/records` | — | `PatientBundleOut` |
| `GET` | `/v1/patients/{patient_id}/summary` | — | `PatientSummaryOut` |
| `GET` | `/v1/patients/{patient_id}/vitals` | — | `VitalTimelineOut` |
| `POST` | `/v1/patients/{patient_id}/vitals` | `VitalCreate` | `VitalOut` (201) |
| `POST` | `/v1/patients/{patient_id}/consents` | `ConsentCreate` | `ConsentOut` (201) |
| `DELETE` | `/v1/patients/{patient_id}/consents/{consent_id}` | — | `ConsentOut` |

**`GET /v1/patients` (the list) 404s through the gateway.** Verified 2026-08-07.

### The path parameter is a USER id, not a patient id
`{patient_id}` is a misnomer. The service resolves the patient row from the **user** id, creating it
lazily on first access. `PatientOut` then returns *both*, and its `patient_id` is a **different
value** from the one in the path. Do not feed the response's `patientId` back into these calls.

---

## Schemas

**`PatientOut`** — `patient_id`, `user_id`, `display_name` (nullable).

**`VitalOut`** — `vital_id`, `patient_id`, `recorded_by_user_id`, `kind`, `value`, `unit`
(nullable), `recorded_at`, `note` (nullable).

- `kind` is **free text** (`max_length=64`), *not* an enum. Do not `switch` on it exhaustively.
- `value` is a **string** ("122/80"). Never parse it as a number.

**`ConsentOut`** — `consent_id`, `patient_id`, `doctor_user_id`, `scope`, `granted_by_user_id`,
`granted_at`.

**Envelopes differ:** `summary` and `records` return bare objects; `vitals` returns `{ items }`.

---

## Two stacked bugs, fixed 2026-08-07

Every PHI route returned 500. Reproduced live rather than taken on trust; the second only became
visible once the first was fixed.

1. **`server_default` missing in the migration.** `20260518_0001` is hand-written and spells
   `created_at`/`updated_at` as `nullable=False` with no default. `TimestampMixin` declares one,
   but a hand-written migration never consults model metadata — so the live columns had NOT NULL
   and no DEFAULT. Each read lazily creates the patient row, so the INSERT raised
   `NotNullViolationError` and the whole route 500'd. Fixed by `20260807_0002` (backfill → set
   default → re-assert NOT NULL), not by editing an applied migration.
2. **`deps.get_current_principal` returned a `dict`** while every consumer is annotated
   `principal: Principal` and reaches for `principal.subject`. FastAPI does not enforce a
   dependency's return type. **The suites mock this dependency, so the mismatch only ever existed
   against the real one** — which is why the conftest appeared to be "hiding" the failure.

Also: `docker-compose.ports.yml` moves `api_gateway` 8000 → 8010, colliding with `ehr_service`'s own
published 8010. `ehr_service` now maps to 8020.

### Verified live
`summary`, `vitals` and `records` all `200` as the seeded patient. **All three come back empty** —
`display_name: null`, no vitals, no consents. The seeder does not cover this service yet.

---

## Wiring status

| Screen | State |
| --- | --- |
| `OverviewScreen` | **Wired** — `GET /{userId}/summary`, mapping `latestVitals` onto the trend cards. |
| `PatientRecordScreen` | **Not wired.** See below — this is a decision, not an omission. |

### Why `OverviewScreen` still keeps placeholder readings
`ehr_service` has no seeded content, so a live-but-empty account would render an Overview with no
numbers at all — which reads as *"your readings are gone"* rather than *"nothing recorded yet"*.
The design's placeholders are used **only when the service returns zero vitals**, and they are
FLAGGED to be removed the moment the seeder covers this service: placeholder numbers on a health
screen are indistinguishable from real ones.

Sparkline `bars` are **not** derived from live data. They are static design heights with no dates or
units; synthesising a trend from a single latest value would draw a line that was never measured.
Charting the real timeline needs `GET /{id}/vitals` plus a real chart component.

### Why `PatientRecordScreen` was NOT wired
It is a **practitioner** screen viewing *someone else's* record, and three things block a
straight swap:

1. **It is keyed by slug, not UUID.** `mock-data.ts` uses ids like `amina-mensah`; these routes take
   user UUIDs. There is no mapping, and the roster it is reached from is itself mock data.
2. **Clinician access is consent-gated.** `_authorize_patient_access` admits a clinician only via
   the consents table. With no seeded consents, a doctor gets 403 — so wiring it without also
   building consent-granting produces a screen that always fails.
3. **It is a preview harness.** The screen is driven by `PREVIEW_STATES`
   (`loading`/`offline`/`not-found`/`vitals-unavailable`/`discharge-saved`) selected by a query
   param, for design QA. Live data and a state-picker are two different screens wearing one name;
   untangling that is a design decision.

**Consent create/delete are deliberately not wrapped in the client either.** Granting a doctor
access to a medical record carries legal weight (Ghana DPA 2012 §20, GDPR Art. 9). It needs a
designed confirmation flow, not a client method sitting ready for someone to bind to a button.
