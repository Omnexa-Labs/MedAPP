# API contract - `lab_service`

**Prefixes:** `/v1/lab` (clinician) and `/v1/me/lab` (patient)
**Source:** `backend/services/lab_service/app/schemas/`
**Client:** `frontend/mobile/MedAPP/src/features/labs/api.ts`

> No new endpoints created. One GATEWAY ROUTE was added - see below.

## Routes

| Method | Path | Audience | Returns |
| --- | --- | --- | --- |
| GET | `/v1/me/lab/results` | patient | `LabResultList` (`{items}`) |
| GET | `/v1/me/lab/summary` | patient | `LabSummaryOut` |
| GET | `/v1/me/lab/search?q=` | patient | `LabSearchResultsOut` (`{query, items}`) |
| POST | `/v1/lab/orders` | clinician | `LabOrderOut` (201) |
| POST | `/v1/lab/results/upload` | clinician | `LabResultOut` |
| GET | `/v1/lab/results/{result_id}` | clinician | `LabResultOut` |

**Two prefixes, and the split is an authorisation boundary**, not a naming style.
`/v1/me/lab/*` is scoped to the bearer token. `/v1/lab/*` is checked per result.

### GATEWAY GAP FIXED 2026-08-07
`/v1/me` maps to `user_service` and there was no longer prefix for lab, so the longest-prefix match
sent a patient asking for their OWN results to `user_service`, which 404d. Proven live before and
after. Added `"/v1/me/lab": settings.lab_service_url`; the longer prefix wins and `lab_service`
already owns that exact path, so no rewrite was needed.

This is the THIRD routing gap of the same family found in one day - inbox absent entirely, hms/pms
colliding, this one shadowed by a shorter prefix. Probe the real gateway before blaming a client.

## Schemas

**`LabResultOut`** - `result_id`, `patient_id`, `lab_order_id?`, `uploaded_by_user_id`, `source`,
`title`, `status`, `summary?`, `file_name?`, `mime_type?`, `external_url?`, `resulted_at?`.

**`LabSummaryOut`** - `total_orders`, `open_orders`, `total_results`, `recent_results[]`.

**`LabOrderCreate`** - `patient_id`, `test_name`, `priority` (default "routine"), `instructions?`,
`due_at?`.

**`LabResultUpload`** - `patient_id?`, `lab_order_id?`, `title`, `source` (default
"patient_upload"), `summary?`, `file_name?`, `mime_type?`, `storage_key?`, `external_url?`,
`resulted_at?`, `raw_text?`, `parsed_values?` (free-form dict).

## Gaps and hazards

- **A doctor can no longer read every result.** `_can_access_result` grants access only when the
  doctor placed the order the result belongs to. A clinician "all results" screen would be mostly
  403s BY DESIGN. This replaced a blanket role grant and must not be reverted.
- **`status` and `source` are free text**, not enums. Do not switch on them exhaustively.
- **`resulted_at` is when the lab produced the result** and can differ from upload time, or be null.
  Sorting by upload time silently reorders a clinical timeline.
- **Search is backed by Qdrant**, not SQL. It can fail independently of the other two routes; treat
  a search failure as a search failure, not a lab outage.
- **`parsed_values` is an unvalidated `dict[str, object]`.** Nothing guarantees units or ranges, so
  it must not be rendered as if it were structured clinical data.
- **No pagination** on results.
- **File content is never returned** - only `file_name`, `mime_type`, `storage_key`,
  `external_url`. There is no download endpoint, so a "view report" affordance has nothing to open
  unless `external_url` is set.

## Wiring status

| Screen | State |
| --- | --- |
| Client (`features/labs/api.ts`) | Written and verified live: results, summary and search all 200. |
| Any lab SCREEN | **None exists.** There is no lab screen in the app - see below. |

**No screen was wired, because there is none to wire.** `src/features` has no labs feature; results
surface only as attachments inside chat today. Building one is a design task (no Figma frame
exists either), not a wiring task. The client is ready for it.
