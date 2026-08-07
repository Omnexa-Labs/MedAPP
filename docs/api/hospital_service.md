# API contract — `hospital_service`

**Prefix:** `/v1/hospitals` · **Client:** `src/features/care/api.ts`

> Retro-documented 2026-08-07 (written before the documentation rule).

## Routes

`GET /v1/hospitals` (+ query) · `GET /{id}` · `GET /{id}/reviews` · `GET | POST /{id}/staff`
· `POST /v1/hospitals`

## Schemas

**`HospitalOut`** — `hospital_id`, `name`, `slug`, `description?`, `specialty?`,
`insurance_accepted[]`, `city?`, `country?`, `latitude?`, `longitude?`, `website_url?`,
`contact_phone?`, `contact_email?`, `accreditation?`, `accreditation_status`, `is_active`,
`created_at`, `updated_at`.

## Gaps and hazards

- **HARDCODED SEED IDS IN THE CLIENT.** `src/features/care/api.ts` contains literal
  `/v1/hospitals/hosp-1`, `/hosp-1/reviews`, `/hosp-1/staff` (and `/v1/pharmacies/pharm-1`). These
  are real requests pinned to seed rows and **404 against any other data**. Highest-priority
  cleanup in this service.
- **`accreditation` and `accreditation_status` are different fields** — one free text, one a
  status. Do not render the raw string as a badge; an unaccredited hospital showing an
  accreditation chip is a trust claim the data does not support.
- **`created_at` / `updated_at` are typed `object`, not `datetime`**, so their serialised format is
  not guaranteed. Do not parse them.
- **The `server_default` migration defect applies here.** The corrective migration was written but
  **never applied** — expect a NOT NULL violation on the first write. See `docs/api/README.md`.
- **No pagination and no geo-radius filter**, despite `latitude` / `longitude` being present.
