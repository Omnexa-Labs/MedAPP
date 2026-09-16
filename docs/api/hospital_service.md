# API contract — `hospital_service`

**Prefix:** `/v1/hospitals` · **Client:** `src/features/care/api.ts`

Updated 2026-09-15 for hospital draft editing and explicit publication.

## Routes

`GET /v1/hospitals` (+ query) · `GET /{id}` · `GET /{id}/reviews` · `GET | POST /{id}/staff`
· `POST /v1/hospitals`

## Schemas

**`HospitalOut`** — `hospital_id`, `name`, `slug`, `description?`, `specialty?`,
`insurance_accepted[]`, `city?`, `country?`, `latitude?`, `longitude?`, `website_url?`,
`contact_phone?`, `contact_email?`, `accreditation?`, `accreditation_status`, `is_active`,
`created_at`, `updated_at`.

## Directory visibility

Public list, detail and review reads require both `is_active=true` and
`is_listable=true`. Approval creates a private profile with a stable hospital ID,
owner and activation receipt. Draft saves do not alter the fields served to
patients. Publishing copies the saved draft to those fields; withdrawing removes
the hospital from public reads while retaining its saved draft and history.
The gateway still requires a MedApp session for these patient-facing reads;
"public" describes the directory fields, not an unauthenticated gateway route.
Draft saves preserve public response metadata, including `updated_at`; draft timing
is recorded in the change history instead.

Search supports `q`, `specialty`, `insurance`, `city` and `country`. Insurance is a
case-insensitive, exact match against any member of `insurance_accepted`, including
multi-insurer lists. It is not a substring match. The other text filters retain
their substring behavior. Results are ordered by hospital name.

## Profile management through HMS

The browser uses the selected workspace's
[`/v1/hms/hospital-profile` contract](hms_service.md#hospital-profile-and-publication).
The directory receiver is internal:

| Method | Internal route | Payload or query |
| --- | --- | --- |
| GET | `/internal/hospital-profiles/{id}` | `owner_user_id` query |
| PATCH | `/internal/hospital-profiles/{id}` | `version`, `changes`, `actor_id`, `owner_user_id` |
| POST | `/internal/hospital-profiles/{id}/publish` | `version`, `actor_id`, `owner_user_id` |
| POST | `/internal/hospital-profiles/{id}/withdraw` | `version`, `actor_id`, `owner_user_id` |
| GET | `/internal/hospital-profiles/{id}/history` | `owner_user_id`, `offset` queries |

Every receiver operation requires `X-Hospital-Directory-Secret`, configured using
`HOSPITAL_HMS_DIRECTORY_SECRET` with at least 32 characters, distinct from the
identity JWT and activation secrets. These routes are not exposed by the portal's
proxy allowlist. HMS derives the hospital, owner and actor from current membership,
the hospital approval receipt and the authenticated session. The receiver also
requires an active hospital, matching owner and matching approval receipt. Missing
or inconsistent ownership requires reconciliation; it is not adopted automatically.

Editable fields are name, description, specialty, accepted insurance, street
address, city, country, coordinates, website, contact phone and contact email.
Partial edits merge into the saved draft. Empty optional text becomes null;
insurance names are trimmed and deduplicated. Websites must be HTTP(S) without
embedded credentials; email must have a valid address shape; coordinates must be
provided together and stay in range. Save requires a name. Publication additionally
requires street address, city, country and at least one contact phone or email.
Ownership, slug, activation receipt, accreditation, accreditation status and active
status cannot be changed through this contract.

The response contains `hospital_id`, `version`, `draft`, `published` (null when
private), `is_listed`, `has_unpublished_changes`, `last_published_at`,
`publication_issues[]` and read-only accreditation fields. Public profile names
may differ from the existing HMS workspace label.

Every changed save/publication/withdrawal atomically compares the supplied version,
increments it and records the actor, action and changed before/after fields.
Unchanged operations do not create extra revisions. Stale requests and conflicting
published names return 409. The latter preserves the saved draft and previous public
details. History returns up to 20 events in descending revision order with
`has_more`; its contents are restricted to hospital administrators through HMS.
Timeouts do not authorize replay: reload the saved profile before another write.

## Migration and validation

Apply hospital migration `20260915_0005` after the ownership migration
`20260914_0004`. It adds the draft, revision, publication time and event table without
rewriting legacy public details or inventing publication dates. Downgrade refuses
to discard drafts, changed revisions or publication history, including offline
downgrades; use a forward migration when evidence exists. Existing legacy admin
creation still creates listed profiles; reconciling those records with approval
and HMS ownership is separate work.

`tests/test_directory.py` covers the lifecycle, public visibility, input validation,
ownership/access constraints, stale revisions, name conflicts and history paging.
`backend/integration_tests/test_hospital_directory_migration.py` checks migration
preservation and guarded downgrade on SQLite. The opt-in real HTTP/PostgreSQL
hospital activation journey additionally exercises publication, insurance filtering,
concurrent draft updates and revocation. See the
[completion baseline](../COMPLETION_BASELINE.md) for actual results and limits;
the presence of a test does not establish that its environment passed.

## Remaining gaps

- Patient adapters now pass the selected hospital ID to detail, review and staff
  requests. Rendered/native acceptance of the complete directory journey remains open.
- **`accreditation` and `accreditation_status` are different fields** — one free text, one a
  status. Do not render the raw string as a badge; an unaccredited hospital showing an
  accreditation chip is a trust claim the data does not support.
- **`created_at` / `updated_at` are typed `object`, not `datetime`**, so their serialised format is
  not guaranteed. Do not parse them.
- Apply the complete migration chain in each deployed environment. Disposable test
  migrations do not establish deployment migration status.
- **No pagination and no geo-radius filter**, despite `latitude` / `longitude` being present.
