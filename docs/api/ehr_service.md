# API contract — `ehr_service`

Clinical prescribing now also belongs to this service. See [PRESCRIBING.md](../PRESCRIBING.md)
for `/v1/patients/{patient_user_id}/prescriptions`, doctor approval checks, explicit
`records_and_prescriptions` consent, immutable issued records, versioned commands,
patient reads, and durable pharmacy handoff. Existing read/vital grants do not
automatically grant access to clinical prescriptions.

Patient medication courses and dose reports also belong to EHR. See
[MEDICATION_TRACKING.md](../MEDICATION_TRACKING.md) for
`/v1/patients/{patient_user_id}/medications`, patient-only ownership, prescription
linkage, tracking states, retained dose corrections and migration `20260916_0006`.
Record and prescribing consent do not grant access to these patient reports.

Future tracking plans and opt-in reminder delivery are specified in
[MEDICATION_REMINDERS.md](../MEDICATION_REMINDERS.md), including EHR migration
`20260917_0007`, native device registration and the dedicated reminder worker.
New PostgreSQL/device verification remains pending; check the completion baseline.

**Base prefix:** `/v1/patients` · **Source of truth:** `backend/services/ehr_service/app/schemas/record.py`
· **Clients:** `frontend/mobile/MedAPP/src/features/overview/api.ts` and
`frontend/mobile/MedAPP/src/features/settings/care-team-api.ts`, plus
`frontend/mobile/MedAPP/src/features/records/vital-timeline-api.ts` for the paged patient timeline.

Updated 2026-09-13: patient-controlled care-team sharing now includes a bounded consent list,
verified clinician identity, explicit read/write scopes, expiry, revocation and retained history.

---

## Routes

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/v1/patients/{patient_id}/records` | — | `PatientBundleOut` |
| `GET` | `/v1/patients/{patient_id}/summary` | — | `PatientSummaryOut` |
| `GET` | `/v1/patients/{patient_id}/vitals` | — | `VitalTimelineOut` |
| `POST` | `/v1/patients/{patient_id}/vitals` | `VitalCreate` | `VitalOut` (201) |
| `POST` | `/v1/patients/{patient_id}/consents` | `ConsentCreate` | `ConsentOut` (201) |
| `GET` | `/v1/patients/{patient_id}/consents` | Query parameters below | `ConsentPage` |
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

**`ConsentCreate`** — `doctor_user_id` (identity UUID, including for a nurse),
`scope` (`records`, `records_and_vitals`, or doctor-only `records_and_prescriptions`; default `records`), `expires_in_days`
(`7`, `30`, or `90`, default `30`), and optional `reason` (at most 255 characters).
Other fields are rejected; clients cannot supply a recipient name/role or arbitrary expiry.

**`ConsentOut`** — `consent_id`, `patient_id`, `doctor_user_id`, `scope`, `granted_by_user_id`,
`granted_at`, nullable `revoked_at`, `revoked_by_user_id`, `expires_at`,
`clinician_display_name`, `clinician_role`, and `reason`; computed `status` is
`active`, `revoked`, or `expired`. The stored clinician name/role describes the recipient
at grant time. Legacy grants may have no name, role, or expiry.

**`ConsentPage`** — `{ items, limit, offset, next_offset }`. Only the patient or an administrator
can list/manage their grants. The list defaults to active permissions; `include_inactive=true`
includes history. `limit` defaults to 25 and is bounded to 1–100, `offset` defaults to 0,
and optional `clinician_user_id` filters the list when reconciling an uncertain mutation.
Results sort by grant time and ID, newest first. List/grant responses use `Cache-Control: no-store`.

**Envelopes differ:** `summary` and `records` return bare objects; `vitals` returns `{ items }`.

### Paged patient vitals

`GET /v1/patients/{user_id}/vitals?limit=25` returns `{ items, next_cursor }`, newest first,
ordered by recorded time and UUID. `limit` is bounded to 1–100. Pass the returned opaque cursor
unchanged with the same filters to retrieve the next page; `null` means the end. This uses a
keyset comparison, so a newly inserted reading ahead of the cursor does not shift subsequent
pages. Refresh to see newer entries. A cursor is not an authorization credential.

Optional `from_date` and `to_date` are inclusive timestamps; invalid ranges return 422. Optional
`kind` matches part of the recorded measurement type, ignoring case and treating underscores
as spaces, so `blood pressure` matches `blood_pressure`. Wildcard characters are escaped.
Kind/cursor parameters require a limit; malformed/oversized cursors and invalid limits return
422. Omit the limit for the existing complete, ascending timeline contract used by Overview;
that response has `next_cursor: null` and remains compatible with existing `{ items }` consumers.

Every page checks the existing patient/clinician/admin authorization, consent scope and expiry,
records a `vitals_read` audit, and returns `Cache-Control: no-store`. Values, units, dates and
notes are returned as recorded. Pagination supplies no clinical classifications or reference ranges.
Migration `20260913_0004` adds `(patient_id, recorded_at, id)` for the timeline. Its downgrade
drops only that index; reading data and consent history are retained.

## Care-team permission contract

| Permission | EHR bundle, summary and vitals reads | Add a new vital |
| --- | --- | --- |
| `records` | Allowed for the named doctor/nurse | Denied |
| `records_and_vitals` | Allowed for the named doctor/nurse | Allowed |
| `records_and_prescriptions` | Allowed for the named doctor | Denied; permits clinical prescribing under additional approval/author checks |
| Revoked, expired, missing or unsupported scope | Denied for other clinicians | Denied |

Patients retain access to their own record. Patient accounts cannot create clinical vitals.
The existing administrator override remains and is tagged `[admin_override]` in access audits,
including vital writes. This override does not grant clinical prescribing access.
Only the explicit prescribing scope grants clinical prescription access. These grants do not govern uploaded files, labs,
messages, research data, HMS or PMS. Those cross-service contracts remain scheduled work.

The server resolves the recipient through the internal user-service `GET /users/{user_id}`,
forwarding the authenticated caller's bearer token. It must resolve an active doctor or nurse.
Inactive/missing recipients or non-clinical roles return 400; unavailable/malformed upstream
responses return 503; invalid caller authentication returns 401. No grant is saved on a lookup
failure. Configure `EHR_USER_SERVICE_URL` for the deployment; its Compose-network default is
`http://user_service:8001`. The internal lookup is not exposed through a new gateway route.

One supported active permission is allowed per patient/recipient. Duplicate grants and attempts
to upgrade an active scope return 409. To change permission, revoke and grant again with explicit
confirmation. Deletion revokes rather than removes a row; repeated revocation returns the same
revocation instant. Expired grants can be renewed without losing their historical status.
Other clinicians see only their own grants in bundle/summary responses, not the rest of the care team.

Patient-row locks serialize consent changes and clinical authorization. A request authorized
before a revocation can finish; later requests are denied. Revocation cannot retract information
already received or remove recorded vitals. Vital events publish after database commit.

Migration `20260913_0003` preserves existing scopes and data and replaces the historical unique
constraint with a partial index over unrevoked grants. Existing indefinite read grants remain
read-only. Rollback is refused once time-limited grants or duplicate historical tuples exist,
because the old schema cannot retain that information. Do not discard consent history to force
a rollback; prepare a reviewed recovery/migration approach for the actual deployment data.

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
| `CareTeamSharingScreen` | **Wired** — patient selects an active directory doctor/nurse, confirms read or add-vitals access for 7/30/90 days, and can view history or confirm revocation. Component/API and backend validation do not establish rendered/device acceptance. |
| `VitalsTimelineScreen` | **Wired** — own-user EHR readings, date/type filters, cursor paging, retry and care-team navigation. Exact reference/native acceptance remains pending. |
| `MedicalRecordsScreen` | **Navigation hub** — links to the available patient vitals, overview, labs and consent screens. Documents and complete medical history remain B07. |
| `PatientRecordScreen` | **Specialist reuse candidate** — reconcile the roster/record journey in B05; this patient work does not count as specialist implementation or acceptance. |

### Remaining record work

Earlier prose in this contract described Overview's placeholder readings and static charts.
That is superseded by the current source: it separates loading/error/empty states, uses the
bounded latest-reading summary, and derives numeric sparklines from the unpaged vital timeline.
It still needs reference/device acceptance and full B07 review; the summary returns the five
latest readings, not a guaranteed latest entry for every measurement type.

The specialist roster and record workflow must use real patient identity UUIDs and handle denied,
expired and revoked access. Completing the patient timeline does not complete that professional
journey, encounters, notes, documents, prescribing, HMS or PMS integration.

Consent controls now have a dedicated patient confirmation flow. Signup remains off and does not
create consent. No specialist reference is marked implemented by this patient settings work.
