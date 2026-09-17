# Patient medication tracking

Implemented 2026-09-16 within B08, extended 2026-09-17 with [future schedule revisions and opt-in reminders](MEDICATION_REMINDERS.md). This connects saved prescriptions, self-reported medicines and dose reports; reference acceptance, scanning and interaction checking remain open.

## Ownership and access

EHR owns medication courses, dose entries, correction history and request receipts. All routes require the signed-in account to match the patient user ID in the path. Doctor, nurse and administrator roles do not bypass ownership. Existing record/prescribing consent does not grant access to these patient reports.

A prescribed course refers to one item in the patient's **issued** prescription. The service copies its name, strength, form and directions from the saved prescription. The client cannot supply substitute medicine details, a prescriber or an approval. One prescription item has one tracking record, including after it is stopped or completed. Self-reported entries are explicitly labelled and confer no prescribing or pharmacy authority.

Course status is the patient's report: `active`, `paused`, `stopped` or `completed`. Pharmacy dispensing, an elapsed end date and dose counts never mark a course completed. A reason and current version are required for status changes. Active courses can pause/stop/complete; paused courses can resume/stop/complete; stopped/completed courses can resume with a reason, retaining their earlier history. Resuming is refused after the planned end or prescription withdrawal. This changes tracking only, not treatment instructions.

Withdrawal and replacement retain the original prescription's earliest cancellation time. Later reports cannot claim a tracking slot after withdrawal. Earlier reports stay readable and correctable. The UI shows both the patient's tracking status and prescription withdrawal. A replacement prescription requires its own patient-selected tracking record.

## API contract

Base: `/v1/patients/{patient_user_id}/medications`, through the existing EHR gateway prefix. Reads and successful writes return `Cache-Control: no-store`.

| Request | Contract |
| --- | --- |
| `GET` base | Course history; `status=all/active/paused/stopped/completed`, `limit` 1–50 (default 25), `offset`, `next_offset`. |
| `POST` base | Create a self report with `medicine`, or link `prescription_id` plus zero-based `prescription_item`. Also requires `start_date`, IANA `timezone`, `daily_times`; `end_date` is optional. |
| `GET /{course_id}` | Authoritative medicine, source prescription status, patient tracking status, version and plan. |
| `POST /{course_id}/status` | `{version, status, reason}`. |
| `GET /tracker?day=YYYY-MM-DD` | Courses and saved/generated slots for that calendar day in each course's timezone. Paged at the course level; includes server time. |
| `GET /{course_id}/doses` | Paged dose entries, including corrected/removed entries. |
| `POST /{course_id}/doses` | `{version, outcome, day, time, note?}` for a scheduled slot, or `{version, outcome, occurred_at, note?}` for manual tracking. Outcome is `taken` or `skipped`. |
| `POST /{course_id}/doses/{dose_id}/correct` | Dose's own `{version, outcome, reason}`; outcome is `taken`, `skipped` or `voided`. Earlier values remain in activity history. |
| `GET /{course_id}/events` | Paged course creation, status transitions, dose reports and before/after corrections. |

Every write requires a UUID `Idempotency-Key`. The owning patient, operation, resource and exact normalized payload are bound to a saved receipt. Replaying it returns the original result without another mutation. Changed commands, stale versions and an already reported scheduled slot return 409. Patient-row locks serialize these writes with prescription withdrawal and keep receipts, entries and audit history atomic. A global receipt key cannot be reused by another patient. Client commands refresh current records after replay rather than presenting an older receipt as current state.

Self-reported medicines require name, strength, form, dose, route and frequency; duration and instructions are optional. Course creation supports 0–12 distinct daily `HH:MM` slots. Zero slots means manual logging. It does not infer times or duration from prescription text. Medicine directions, original start and timezone stay fixed. Future daily times and end dates can be revised with retained history; see [schedule semantics](MEDICATION_REMINDERS.md). Start dates are technically bounded to ten years before/twelve months after the local current date, and a planned course to ten years; these bounds are not clinical rules.

## Dose semantics and recovery

- Scheduled entries identify the local date and saved time; they record a report against that slot, not an inferred actual ingestion time. `reported_at` is the first report time; correction times are in the activity history. Manual entries explicitly carry an occurrence timestamp.
- Future and nonexistent local times cannot be reported. A spring-forward gap is not a dose. A repeated fall-back hour has one slot using its first occurrence. Manual times render in the course's saved timezone, with an explicit UTC fallback if the device does not recognize it.
- Status transitions are retained with effective time and course version. Resuming does not fill a paused period with missed doses. Planned end dates exclude later slots without asserting completion.
- The tracker distinguishes upcoming, unreported, taken, skipped, removed and outside-active-tracking states. No report is not evidence of a skipped dose. Counts are labelled for the current page; manual entries are separate and no global adherence percentage is inferred from a partial page.
- Same-key retries cannot duplicate a manual report. The scheduled-slot unique constraint also prevents two different keys reporting the same slot. Corrections preserve the original entry rather than deleting it.
- While a screen is open, uncertain writes retain the original payload/key and disable conflicting changes. A saved result is refreshed before success. On leaving/restarting, re-open saved history before entering another report; unsubmitted drafts and uncertain request keys are not persisted as an offline queue.

Queries, responses and retries are bound to the current account/session. Leaving an account hides its prior records and ignores late writes. Lists/history distinguish loading, empty and failed responses, support paging and refresh on focus. Text export refreshes the selected medication page and labels its scope and patient-reported status.

## Deployment and verification

1. Install EHR dependencies, including `tzdata` for portable IANA timezone support.
2. For the current source, apply EHR `20260917_0007` after `20260916_0006` and clinical prescribing `20260916_0005`, after the pending PostgreSQL checks pass.
3. Deploy the EHR API and mobile client together. The existing gateway patient prefix routes these endpoints; schedule editing uses the same API; optional native reminders require the setup and worker in [MEDICATION_REMINDERS.md](MEDICATION_REMINDERS.md).
4. Recheck a synthetic patient's self report, issued-prescription import, scheduled/manual entries, corrections, status changes and restart recovery before release.

The earlier tracking migration round trips preserved existing prescription rows when tracking tables were empty. The new schedule/reminder migration has not yet been run against PostgreSQL. A populated downgrade refuses to discard tracking evidence. This work only migrated disposable QA databases, not retained application data.

See [COMPLETION_BASELINE.md](COMPLETION_BASELINE.md) for unit/component and real HTTP/PostgreSQL evidence. Browser/device/reference acceptance remains pending. P-039/P-040/P-041/P-045/P-047/P-048 remain in progress; all 108 references remain in scope, 76 patient and 32 specialist, with none accepted. Scanning/OCR, image retention, interaction providers and specialist access to these reports remain separate work. Schedule/reminder implementation is present; new PostgreSQL checks and real notification delivery acceptance remain pending.
