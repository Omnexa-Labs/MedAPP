# API contract — `pharmacy_service`, `nurse_service`, `pharmacist_service`

Three directory services with the same shape. Prefixes `/v1/pharmacies`, `/v1/nurses`,
`/v1/pharmacists`. Client: `src/features/care/api.ts`.

> Retro-documented 2026-08-07 (written before the documentation rule). Kept as one file because the
> three are the same contract with different nouns; splitting them would triple the drift surface.

## Routes (identical pattern)

`GET /` (+ query) · `GET /{id}` · `POST /` · `PATCH /{id}` · `DELETE /{id}`
Plus `GET /v1/pharmacies/{id}/stock` and `POST /v1/nurses/{id}/service_area`.

## Schemas

**`PharmacyBase`** — `name`, `slug`, `license_number?`, `license_categories[]`, `city?`,
`country?`, `latitude?`, `longitude?`, `phone?`, `email?`, `website_url?`, `insurance_accepted[]`,
`operating_hours` (`dict[str, str]`, free-form), `photo_url?`, `pms_base_url?`,
`pms_partner_secret_id?`, `is_listable`.

**`NurseBase`** — names, `specialty?`, `bio?`, `languages[]`, `home_visit_fee_cents?`,
`photo_url?`, `is_listable`. Plus `NurseServiceAreaPayload` (radius or GeoJSON polygon).

**`PharmacistBase`** — names, `license_number?`, `bio?`, `languages[]`, `specialties[]`,
`affiliated_pharmacy_id?`, `is_listable`.

## Gaps and hazards

- **`is_listable` defaults to FALSE on all three.** Created records are invisible until flipped.
- **Fees are in CENTS** (`home_visit_fee_cents`). Rendering raw shows 100× the price.
- **`operating_hours` is an unvalidated `dict[str, str]`** — no day-key convention, no timezone, and
  no way to express closed or 24h. The facility-detail hours row must not assume a shape, and
  "Open now" cannot be computed from it reliably.
- **Only `PharmacistList` paginates** (`total`, `limit`, `offset`). Pharmacy and nurse lists return
  bare `items` with no total, so a consistent "showing N of M" cannot be built across the three.
- **`pms_partner_secret_id` is a credential reference on a read model.** Confirm it is stripped for
  unauthenticated callers before rendering a pharmacy payload verbatim.
- **`/v1/pharmacies/pharm-1` is hardcoded in the client** — see `hospital_service.md`.
