# MedApp completion baseline

Reviewed: 2026-09-12.

Planning correction from the product owner: most patient-facing screens are implemented, but the specialist-facing screen set is not implemented. Existing practitioner routes and related portal code are reuse candidates, not completed specialist screens. Follow [COMPLETION_GUIDE.md](COMPLETION_GUIDE.md) and [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md) for the complete two-group plan: 76 patient-facing and 32 specialist-facing screen references.

This is an initial code and reference review to prepare for completing the existing product. It is not a release certification or an exhaustive defect list. Status below distinguishes implemented UI, API wiring visible in source, and runtime verification. Recheck each area before changing it: several older handbooks and handoff entries describe work that has since been completed.

## Native build preparation, 2026-09-17

The product owner selected Android for the first reminder test. Added development
and preview APK profiles, a production AAB profile, explicit profile environments,
and an EAS post-install configuration check. Unknown `APP_ENV` values now fail
configuration resolution. Firebase client files/local credentials are ignored.
The check validates the resolved variant, Expo project UUID, explicit physical-phone
API URL, notifications plugin and Firebase client/package match without printing
configured values or file errors. See [MOBILE_BUILD_SETUP.md](MOBILE_BUILD_SETUP.md).

**28 configuration tests pass**, including resolution of the actual Expo config
for all three variants using synthetic values; no provider is contacted. Report:
`%LOCALAPPDATA%/MedApp/recovery-runtime/mobile/native-build-tests.tap`.
Mobile TypeScript and Git whitespace checks pass. This is separate from the 208
reminder implementation tests below. The actual local check exits 1 and lists
`EAS_PROJECT_ID`, a reachable `API_BASE_URL`, and `ANDROID_GOOGLE_SERVICES_FILE`
as missing; its redacted report is `mobile/native-build-preflight.json` in the same
runtime. No EAS project/account or provider credentials
have been verified. ADB reports zero connected devices. No native build, app
launch or push delivery was performed. Docker's Linux-engine pipe is still
unavailable; the earlier policy blocks on Docker repair and preview startup were
not retried. PostgreSQL, provider/device and reference acceptance remain pending.

## Latest medication update: future schedules and opt-in reminders, 2026-09-17

Medication details now supports future daily-time/end-date revisions, a retained
revision history, saved reminder preferences, native device registration and
reminder attempt history. Original medicine directions, timezone and historical
doses remain fixed. Tracker and retrospective reports resolve the plan for the
requested day. Pending revisions can be replaced with retained audit evidence.

The EHR worker selects newly due slots from authoritative records, suppresses
inactive/withdrawn/expired/reported slots and persists one attempt per device/slot
before calling Expo. Its message is generic and never logs a dose. Provider
acceptance is explicitly distinct from phone arrival; ambiguous sends are not
automatically replayed. Resume starts future reminders without catching up prompts
from before the pause. Device registration requires explicit opt-in and OS
permission, expires after seven days, renews on foreground, and is disabled on
sign-out/lock where connectivity and the captured credential permit.

See [MEDICATION_REMINDERS.md](MEDICATION_REMINDERS.md) for contracts, limits,
credential/build setup and the pending release checks. Deploy requires EHR
`20260917_0007`, the declared Expo notifications dependency, a configured native
build, and the `ehr_medication_reminders` worker. Push defaults off. No retained
database was migrated and no real push was sent.

Executed reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `ehr-reminders-final.xml` | **128 passed**: full EHR suite, including 36 new schedule/reminder cases. Ownership, versions/replays, historical/manual plan resolution, saved-zone effective dates, preference/device lifecycle, suppression, no duplicate retry, DST and mocked Expo acknowledgements. SQLite/ASGI, not PostgreSQL. Two existing dependency deprecation warnings. |
| `mobile/reminders-tests-final.json` | **77 passed** in 11 suites: medication screens/helpers, connected clinical prescriptions and auth deep links. Includes future-plan editing, payload/key reuse, pending-plan rendering, separate preference/device state, permission handling, identity switches, renewal/revocation and provider-acceptance wording. APIs and native modules are mocked. |
| `mobile/reminders-bridge-final.json` | **2 passed**: app-level session/foreground lifecycle, rotated credentials, sign-out, account switching and listener cleanup. |
| `mobile/reminders-ui-final.json` | **6 passed**: the five plan-control cases above rechecked, plus a regression for keeping a removed end date empty when reopening a pending plan. Only the new sixth case is additional to the 77. |
| `mobile/reminders-native-final.json` | The same three native adapter cases rechecked after final user-facing copy cleanup; included in the 77. |

Total: **208 distinct passing tests**. Mobile TypeScript and scoped Ruff pass.
Seventeen mobile source/config/test files match the external runtime.
The migration compiles to PostgreSQL SQL offline (`ehr-reminders-upgrade.sql`);
this is not a database execution or rollback test. Mobile ESLint remains
unavailable as previously recorded. A component test caught and fixed native
text wrapping in the pending-plan callout; this is not rendered-device acceptance.

The expanded HTTP/PostgreSQL suite and migration/worker concurrency check are
prepared but **unexecuted**. Docker Desktop failed to initialize its stale
`sailor-ingest.sock`; automatic approval review rejected the targeted Docker
restart/socket cleanup as **blocked by policy**. Image
`medapp-hospital-qa:reminders-20260917` was not built. Earlier PostgreSQL results
below apply to earlier source, not this milestone. Automatic approval review had
also blocked preview startup, so browser/device/theme/reference acceptance remains
pending. Expo credentials/native build and real arrival checks remain outstanding.

All **108 references (76 patient, 32 specialist) remain in scope; 0 accepted**.
No route was added (65 routes, three layouts). Changes remain local on
`project-completion`; the previous GitHub checkpoint is unchanged. Next: complete
the pending database/provider/device verification, then scanning/verification,
interaction providers, refill/order/delivery and the remaining specialist flows.

## Earlier medication update: patient courses and dose tracking, 2026-09-16

Patient medication screens now read EHR records instead of sample lists. Patients
can track an item from their own issued prescription or add an explicitly
self-reported medicine. Tracking records retain source directions, daily times
or manual logging, an IANA timezone and planned dates. Active, paused, stopped
and completed states are patient reports, with reasons and retained transitions.
Dispensing, elapsed dates and dose counts do not automatically complete a course.

Taken/skipped reports, removed entries and before/after corrections persist with
atomic request receipts. Patient locks and unique scheduled slots prevent duplicate
reports from concurrent requests. Future slots, paused periods, withdrawal cutoffs
and daylight-saving gaps are checked on the server. Prescription replacement now
preserves an earlier cancellation time, so it cannot reopen the withdrawn period
for retrospective reporting. Existing doctor consent does not grant access to
patient tracking. Lists/history fail closed on account changes and distinguish
failed, empty and loading results. Exports refresh and label the selected page.

Apply EHR `20260916_0006`, install the declared `tzdata` dependency and deploy the
mobile client with the EHR API. No new service credential or worker is required.
Only disposable QA databases were migrated. See [MEDICATION_TRACKING.md](MEDICATION_TRACKING.md)
for contracts, state semantics and remaining work.

Final reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `medications-verified/ehr_service.xml` | 92 passed: 66 prior EHR/prescribing cases and 26 medication cases. Covers ownership, authoritative prescription linkage, validation, duplicate/replayed requests, status transitions, scheduled/manual reports, corrections, withdrawal, pagination, planned end and DST. |
| `medications-verified/ehr-medications-final.xml` | The same 26 medication cases passed again with the final test fixture (its prescribed-course clock now follows issuing time). Included in the 92, not counted twice. |
| `medications-verified/pharmacy-http-postgres.xml` | Four real HTTP/PostgreSQL/migration cases passed. The extended journey concurrently creates tracking, reports and corrects doses, rejects competing writes, reads saved records through a fresh client, checks patient isolation and rejects reports after withdrawal. A new migration case preserves legacy prescriptions across upgrade/downgrade/upgrade and rejects populated tracking downgrade. |
| `mobile/medications-tests.json` | 57 passed across medication screens/helpers and connected clinical-prescription screens. Covers real-data states with mocked APIs, confirmation, source-only import, exact retry payload/key, stale versions, corrections, account-switch reads/writes, reopening, export freshness, paging and saved-zone display. |
| `mobile/medications-add-final.json` | The same six add-form cases passed again after retaining the temporary camera-reference entry point. Included in the 57, not counted twice. |

Total: **153 distinct passing tests**, no failures or skips in these final reports.
Mobile TypeScript, scoped Ruff and Git whitespace checks pass. Nineteen changed
mobile source/test/fixture files match the external QA copies. Some React Native
test runs emit existing asynchronous Icon/VirtualizedList `act` warnings; no test
fails. Mobile ESLint remains unavailable as previously recorded. No native build,
live notification provider or rendered browser/device acceptance is claimed.

The backend image is `medapp-hospital-qa:medications-20260916`, manifest
`sha256:8e6c61d46e3255fd4cd4929ba829601b384f8465bdee0a01c19e1e0d24e8d160`.
The final targeted EHR run mounts only the updated test file read-only; application
sources match the image used for the full EHR and HTTP/PostgreSQL runs. Integration
services publish no host ports and their disposable containers are removed.

P-039/P-040/P-041/P-045/P-047/P-048 are in progress and unaccepted. Counts remain
**108 references: 76 patient, 32 specialist, 0 accepted**, and 65 mobile routes.
Scanning/OCR, photo retention, plan revision, reminders, interaction providers
and specialist access to these reports remain open. Unsaved form drafts and
uncertain request keys do not survive leaving/restarting; saved records do, and
the UI directs patients to check their history before entering another report.
Automatic approval review previously rejected preview startup as **blocked by
policy**, so browser/device/theme/reference acceptance remains pending. Changes
remain local on `project-completion`, beyond the earlier GitHub checkpoint.

## Previous prescribing update: verified doctors and pharmacy handoff, 2026-09-16

Only verified doctors with an active account, active approved profile and explicit
patient `records_and_prescriptions` consent can prescribe. EHR owns author-private
drafts, reviewed issuing, immutable issued content, cancellation and linked
replacement drafts. Existing sharing grants do not gain prescribing access.
Patients see only their own issued records; cancelled, unissued drafts remain
private. Writes use optimistic versions and atomic, actor-bound request receipts.
The mobile client retrieves current detail after a command replay so an old issue
receipt cannot display a subsequently cancelled prescription as issued.

Specialists can compose, review, issue, withdraw and prepare replacements from
the patient record. Patient history/detail/share routes read saved clinical data;
text export refreshes the record and identifies the result as an unsigned patient
copy. Clinical URL parameters and sample prescriptions cannot substitute for a
saved record. Pharmacy reports remain separate from medication-course completion.

A separate EHR worker delivers frozen send/withdrawal commands through the private
pharmacy relay to the confirmed PMS deployment. Leases, bounded retries and exact
acknowledgements preserve delivery through outages. PMS matches complete medicine
lines by name, strength and form, enforces dispensing expiry and retains withdrawal
markers to reject a delayed first send. Cancellation preserves supplied quantities,
sales and stock. A routed original requires confirmed pharmacy withdrawal before
the doctor prepares its replacement. See [PRESCRIBING.md](PRESCRIBING.md) for
contracts, EHR `20260916_0005` / PMS `0008_clinical_handoff` migrations, credentials
and the separate delivery worker. Retained application databases were not migrated.

Final reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `prescribing-verified/ehr_service.xml` | 66 passed. Covers current verified-doctor access, explicit consent, draft privacy, version/replay handling, immutable issued content, correction/withdrawal and delivery recovery. |
| `prescribing-verified/doctor_service.xml` | 40 passed. Includes approval-receipt eligibility and inactive/legacy profile rejection. |
| `prescribing-verified/pms_service.xml` | 138 passed. Includes signed clinical handoff, exact catalog identity, cancellation-before-send, replay and expiry enforcement. |
| `prescribing-verified/pharmacy_service.xml` | 105 passed. Directory, activated deployment routing and patient-owned dispensing report regression coverage. |
| `prescribing-verified/api_gateway.xml` | 34 passed. Authenticated routing and the narrowly scoped signed-report exception. |
| `prescribing-verified/pharmacy-http-postgres.xml` | Three real HTTP/PostgreSQL/migration cases passed. The journey exercises approved accounts, consent, concurrent duplicate creation/issuing, draft and patient isolation, outages and competing delivery workers, partial dispensing, confirmed withdrawal, replacement, revocation and stale-token rejection. Cancellation leaves stock and prior dispensing intact. |
| `mobile/prescribing-tests.json` | 25 passed across clinical prescribing, pharmacy history and care-team contracts. Includes explicit review, same-request retries, current cancelled status after replay, fresh export and account-switch isolation. APIs are mocked. |
| `pms-web/prescribing-portal.xml` | 188 passed, including four real Redis cases and the prescription-expiry interaction. UI cases use mocked repositories. |

Total: **599 distinct passing tests**, no failures or skips in these final reports.
Mobile and portal TypeScript, portal lint and the portal production build pass.
Scoped Ruff, Compose configuration and Git whitespace checks pass. All 17 current
frontend source/test files checked match the external QA copies. The final backend
image is `medapp-hospital-qa:prescribing-20260916`, manifest
`sha256:774db6a39a45c0da7a16809d571893868e209f4a0def0ca945ac4584d3dbafe8`.
The final EHR and full HTTP/PostgreSQL runs use that image. Earlier service reports
use the same service sources except for the final EHR-only privacy change, which
the final EHR run covers. All database/service integration testing is disposable
and publishes no host ports. Mobile ESLint remains unavailable as recorded below;
it is not included in the passing checks.

S-023/S-024 and P-042/P-043/P-049/P-050 have implementation evidence and remain
unaccepted. The register retains **108 references: 76 patient and 32 specialist,
0 accepted**, with 65 mobile routes and three layouts. Medication-course state,
adherence, scanning, interaction providers, refill/order/delivery, notifications
and production configuration remain open. Browser/device/theme/reference
acceptance remains pending because automatic approval review previously rejected
preview startup as **blocked by policy**. This milestone and the preceding sync
work are local on `project-completion`, beyond the earlier GitHub checkpoint.

## Previous pharmacy update: reliable MedApp reports and patient history, 2026-09-16

MedApp-origin ingestion, dispensing, both correction dispositions, cancellation
and receipt-line reconciliation now save immutable full snapshots in the same
transaction as local pharmacy changes. A separate worker uses expiring claims,
bounded automatic retries and matching persisted acknowledgements. Staff can
view delivery history and request an audited, versioned retry without repeating
stock or payment operations. Invalid/partial/ambiguous inbound prescriptions are
rejected atomically, and concurrent exact requests share one ingestion receipt.

The directory now receives signed reports from confirmed pharmacy deployments.
Patient identity is frozen from authenticated ingestion and cannot follow edits
to a customer record. Duplicate deliveries return their original acknowledgement;
older snapshots cannot rewind newer patient state. The patient's prescription
history now uses account-scoped saved reports with dispensing quantities, returns,
report times, refresh, paging and explicit failed/empty states. Dispensing remains
separate from medication-course completion. This does not implement the upstream
specialist prescribing service or refill/order/delivery contracts.

Apply PMS `0007_medapp_delivery` and directory `20260916_0005`, deploy the related
services/clients, configure `PMS_MEDAPP_SYNC_URL` and run the separate worker.
Legacy patient identities are not backfilled, and immutable delivery payloads
cannot be edited through the retry API. Duplicate external references or missing
historical evidence need explicit reconciliation. See [PHARMACY_SYNC.md](PHARMACY_SYNC.md)
for deployment and recovery.

Final evidence under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-sync-verified/pms-sync.xml` | 130 PMS tests passed. Includes atomic ingestion, frozen recipient, missing/ambiguous drug rejection, rollback with stock, correction/cancellation snapshots, response validation, transport/status failures, expired leases, manual retry authorization/replay and automatic retry limits. |
| `pharmacy-sync-verified/pharmacy-sync.xml` | 105 directory tests passed. Includes deployment authentication/freshness, malformed signature headers, immutable identity/lines, duplicate event/sequence rejection, out-of-order receipt, patient ownership and payload limits. |
| `pharmacy-sync-verified/gateway-sync.xml` | 34 gateway tests passed. Only the exact signed POST bypasses patient JWT checking; patient history routes to its own authenticated service. |
| `pharmacy-sync-verified/pharmacy-http-postgres.xml` | Three complete HTTP/PostgreSQL/migration cases passed. The extended journey concurrently ingests, dispenses and corrects one prescription; exercises an unavailable receiver, committed receipt with lost acknowledgement, a worker process exiting after claim, lease expiry and competing worker processes; verifies patient isolation and newest-state preservation. Migration round trips retain legacy data with unknown patient links. |
| `pms-web/pms-sync.xml` | 187 portal tests passed, including four real Redis cases and five new status/retry/access tests. Repositories are mocked in UI cases. |
| `pms-web/pms-sync-final-focus.xml` | 19 existing cases passed again after correcting the repository's default API-client import; these are included in the 187, not counted twice. |
| `mobile/pharmacy-sync-tests.json` | 24 mobile tests passed, including ten new report/UI/session/paging/validation cases and 14 existing prescription-domain cases. APIs are mocked. |

Total: **483 distinct passing tests**, no failures or skips in the final reports.
The portal production build, portal TypeScript/lint and mobile TypeScript pass.
Scoped Ruff, Compose configuration and Git whitespace checks pass. All ten changed
frontend source/test files match the external QA copies. The final backend image
is `medapp-hospital-qa:sync-20260916`, manifest
`sha256:cb5a8b7112dc1c39ff3e6ca921f7e8dedb87c0ba380ef967b9416544f1b2bfb0`.

The initial mobile run exceeded the default five-second cold-render timeout; the
final run passed with a 15-second per-test limit. Mobile ESLint did not run:
`eslint` and `eslint-config-expo` are absent from its installed/declaration graph,
and the attempted npx fallback failed with `ECONNRESET`. No mobile dependency
manifest was changed; this remains an environment task, separate from passing
mobile TypeScript/tests. The portal lint uses its installed dependency graph.

P-043 and S-031 have partial implementation evidence and remain unaccepted. All
108 references remain in scope: 76 patient and 32 specialist, **0 accepted**.
Automatic approval review previously rejected preview startup as **blocked by
policy**; browser/device/theme/reference acceptance remains pending. Production
configuration and queue-age alerting, specialist issuing, clinical new/active/past
states, refills/order/delivery, clinical alerts, supplier credits, provider refunds,
legacy records without evidence and browser-restart transaction recovery remain open.
These changes are local on `project-completion`; the earlier GitHub push is the
previous checkpoint, not this milestone.

## Previous pharmacy operations update: corrections and refund records, 2026-09-16

Receipt corrections now preserve the original sale and append partial credits,
reasons, staff attribution and physical disposition. Never-collected units restore
their original batches and reduce verified prescription quantities atomically;
cancelled prescriptions stay cancelled. Customer returns remain outside usable
stock and retain their clinical dispensing history. Original discount/tax is
allocated with integer arithmetic so full correction credits exactly the original
total, including across partial requests.

The portal records refunds already completed through the pharmacy's external
payment process, within the remaining credit balance. This does not send money.
Administrators can mark an incorrectly entered refund with a reason while retaining
the record. Sales, credits and refund settlement appear separately in reports;
refund settlement is not subtracted twice. Report periods consistently use receipt
completion time, with creation time as the fallback.

New dispense receipts retain exact prescription-line links. Older links remain
unknown until an administrator checks the dispensing records and explicitly maps
every receipt line. Aggregate validation rejects an unsupported mapping when the
same medicine appears twice; rejection rolls back all links and revisions. Missing
or inconsistent historical evidence still requires a records review.

Apply PMS migration `0006_sale_corrections` and deploy the API and portal together.
Migration round trips preserve earlier quantities and leave unverified line links
null. Populated downgrade refuses to discard corrections, refunds or verified
dispense provenance. See the [correction contract](api/pms_service.md#receipt-corrections-and-completed-refund-records)
and [portal setup](../frontend/pms_web/README.md).

Final reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-corrections-verified/pms-corrections.xml` | 110 backend tests passed, including 16 correction/refund cases covering stock disposition, clinical counts, cancellation, exact partial-credit rounding, legacy links, role boundaries, revision conflicts, refund caps/replay/incorrect entries, rollback and report timing. |
| `pharmacy-corrections-verified/pharmacy-http-postgres.xml` | Three real HTTP/PostgreSQL/migration cases passed. Concurrent same-key correction and refund requests create one result. A correction/dispense race yields one success and one conflict; stock matches its movement ledger and clinical counts. Legacy sale and prescription lines survive upgrade/downgrade/upgrade with null unverified links. |
| `pms-web/pms-corrections-verified.xml` | 182 portal tests passed, including nine new correction/refund/report UI cases, seven additional proxy cases and four real Redis cases. Lost responses retain the original payload/key, stale revisions require reload, customer returns explain the stock/clinical behavior, refund entry correction requires acknowledgment, and cashiers cannot create corrections/refunds. |

Total: **295 distinct passing tests**, no failures or skips. The portal production
build, TypeScript, lint and scoped Ruff pass. All 120 portal source/test/config
files checked match the external QA copy. UI tests use mocked repositories; the
HTTP journey uses synthetic accounts and disposable PostgreSQL, with no provider
payment call. Both final backend runs use `medapp-hospital-qa:corrections-20260916`,
manifest `sha256:3768a82828c523e5708cc507c2a577b55da2518f14cf0977e394770f8fdf9888`.

This supports S-031 and accepts no reference. All 108 references remain in scope:
76 patient-facing and 32 specialist-facing. Automatic approval review previously
rejected preview startup as **blocked by policy**, so browser/device/theme and
reference acceptance remain pending. Durable MedApp dispense/correction delivery,
payment-provider refunds, supplier credits, refill fulfillment/delivery, clinical
alerts, legacy records with missing evidence and recovery after route departure
or browser restart remain open. The portal explicitly directs staff to coordinate
MedApp-origin corrections with the originating service until synchronization is
implemented.

## Previous pharmacy operations update: POS and prescription recovery, 2026-09-15

POS and prescription dispensing now review actual FEFO batch prices before
recording a transaction. The portal sends the reviewed total, and the backend
checks it again while holding the inventory locks. Walk-in checkout no longer
silently overrides batch prices with the catalog default. Saved receipt pages
show allocations, payment details, amounts, notes and linked prescriptions.
Sales and prescription lists use server search, filters and paging, with distinct
loading, failure and empty states.

Sale creation/voiding and prescription creation/dispensing/cancellation now use
atomic request receipts. Repeating the same authorized request returns its original
response without another sale or stock movement. Existing prescription and void
actions check the saved revision. Partial dispensing preserves remaining units;
cancellation records a reason and stops further dispensing while retaining earlier
sales. Dispensing commits its stock, sale, counters, audit and request receipt
together before the existing MedApp callback. The callback retains its original
payload shape and is not resent by request replay.

Apply PMS migration `0005_transaction_recovery` and deploy the updated API and
portal together. Existing status, totals and prescription notes are preserved.
See the [transaction contract](api/pms_service.md#pos-and-prescription-transaction-recovery)
and [portal guide](../frontend/pms_web/README.md).

Reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-transactions-verified/pms-transactions.xml` | 94 backend tests passed, including 14 transaction cases for split/zero batch prices, same-drug prescription allocations, replay, payload/actor mismatch, strict inputs, saved revisions, rollback, cancellation, roles and post-commit callback behavior. |
| `pharmacy-transactions-verified/pharmacy-http-postgres.xml` | Three real HTTP/PostgreSQL/migration cases passed. Concurrent sale, void, prescription creation and partial-dispense retries produce one result. A dispense/cancellation race produces one success and one conflict; stock agrees with its ledger. Legacy prescription status/notes and sale totals survive migration round trips. |
| `pms-web/pms-transactions-verified.xml` | 166 portal tests passed, including 11 transaction UI cases, three transaction adapter cases, seven additional proxy cases and four real Redis cases. Lost sale/prescription responses reuse the same request; stale prices require another review and delayed responses cannot apply across sessions. |

Total: **263 distinct passing tests**, no failures or skips. The production build,
TypeScript, lint, scoped Ruff and whitespace checks pass. All 115 portal source,
test and configuration/package files matched the external QA copy by SHA-256.
An initial test collection failure was corrected to use the existing package-relative
fixture import before the successful runs. UI tests use mocked repositories;
the HTTP journey uses synthetic accounts and disposable PostgreSQL.

Final unit QA image: `medapp-hospital-qa:transactions-20260915`, manifest
`sha256:c78d9c667b2bc950d84f09e36d31506d73d5d09c36975ab4f41aa974d11ba37c`.
The PostgreSQL run used manifest
`sha256:e7123b3813872469bb3f1eca7f6c552e9dbaeb5905fc15bbc3f0ef66635d6fa0`;
the final image adds the same-drug prescription regression test with no further
runtime or migration changes.

This supports S-031 and accepts no screen reference. Cashier/pharmacist/admin
actions are separated, but rendered/device/theme acceptance is still pending.
Automatic approval review previously rejected preview startup as **blocked by
policy**; no browser/device acceptance is claimed. Request keys last only while
the form remains mounted. Recovery after route departure/restart, reliable MedApp
confirmation delivery, prescription corrections, supplier credits, payment refunds,
refill fulfillment/delivery and clinical alerts remain in scope. Recorded payment
details do not charge or refund instruments.

## Previous pharmacy operations update: purchasing and partial deliveries, 2026-09-15

Supplier purchasing now supports saved drafts, draft replacement with revision
checks, marking an externally placed order, partial deliveries across multiple
batches, outstanding quantities, cancellation of the unreceived remainder,
delivered-batch records and recorded before/after history. The old receipt adapter
omitted the root received date and offered a selling price the API ignored; the
new portal and service share the complete receipt contract and preserve explicit
zero cost/prices. The portal labels the external-order bookkeeping action
**Mark as ordered** and sends no supplier message.

Every purchasing write has an atomic replay receipt and existing-order version
check. The PO row lock serializes receipt/cancellation/edit decisions; parent drug
locks coordinate with other stock writers. Batch allocations, quantities, status,
movement ledger, audit and request receipt commit together. Receipt history is
ordered by the recorded PO revision. Earlier orders with ambiguous receipt status
return unknown quantities until an administrator checks the recorded batches and
assigns them to matching order items. Reconciliation preserves physical stock and
retains historical over-receipt; unsupported or missing evidence stays flagged.

Apply PMS migration `0004_partial_receiving` and deploy the updated API and portal
together. Existing historical quantities and status survive a migration round
trip; the migration does not invent prior item allocations. See the
[purchasing contract](api/pms_service.md#purchasing-and-partial-deliveries) and
[portal guide](../frontend/pms_web/README.md).

Reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-purchasing-verified/pms-purchasing.xml` | 80 PMS tests passed, including 19 purchasing cases covering drafts, partial/split deliveries, replay, cancellation, validation rollback, roles and historical allocation. |
| `pharmacy-purchasing-verified/pharmacy-http-postgres.xml` | Three real HTTP/PostgreSQL/migration cases passed. Concurrent draft creation and receipt replay create one result; receipt-versus-cancellation produces one success and one conflict. Reconciliation racing a sale preserves the current batch balance and revision, with ledger readback. Old order/drug/batch values survive migration round trips and populated downgrade is refused. |
| `pms-web/pms-purchasing-verified.xml` | 145 portal tests passed, including 15 purchasing UI cases, four adapter cases, six additional purchase proxy cases, inventory/profile/session regressions and four real Redis cases. |

Total: **228 distinct passing tests**, no failures or skips. The portal production
build, TypeScript, lint and scoped Ruff pass. The HTTP journey uses synthetic
accounts and disposable PostgreSQL; UI tests use mocked repositories. An initial
UI test clicked the save button before supplier loading had enabled it; the test
now waits for that state and all final checks pass. No preview server was started.
All 105 checked portal TypeScript/configuration/package files match the tested
copy byte for byte. All 416 local links in the updated guides resolve; whitespace
checks pass. Disposable PostgreSQL and Redis test containers have been removed.
Automatic approval review previously rejected preview startup as "blocked by policy";
browser/device/theme and full reference acceptance remain pending.

Final QA image: `medapp-hospital-qa:purchasing-20260915`, manifest list
`sha256:7ed48bc616c7d5f7c1c7938c3fbbf672c48ba6efb32e8c9b0c5b67ba7d163056`.
S-031 remains in progress, partially verified and not accepted. There are still
108 references (76 patient, 32 specialist), 63 mobile routes and three layouts.
Remaining work includes legacy orders lacking usable batch evidence, order form
recovery across a full browser restart, POS/dispensing recovery, prescription
corrections/refunds, supplier returns/credits, patient refill/fulfillment/delivery,
clinical interaction alerts and full rendered/device acceptance.

## Previous pharmacy operations update: dashboard and inventory, 2026-09-15

S-031 now has a live PMS dashboard with pending prescription links, low-stock and
expiry tasks, and today/week sales activity. Catalog search and paging, creation,
versioned editing and archiving are implemented. Batch screens support receipt,
versioned adjustments, expiry filters and paged movement history. Errors have
retry states, uncertain manual writes reuse the same request key, cashiers have
read-only inventory access, and the shell provides navigation on smaller screens.

PMS migration `0003_inventory_revisions` adds revisions and atomic request
receipts. Every operational stock writer locks parent drugs in a stable order;
sales, sale voids, dispensing and PO receipts also preserve the stock ledger.
Money/quantity/date validation rejects invalid writes; explicit zero selling
prices are preserved. Prescription-only drugs must use prescription dispensing.
Voiding a prescription-linked sale is rejected until the prescription correction
workflow exists. New receipt validation runs after replay lookup so a committed
receipt remains replayable even after its batch expires.

Reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-inventory-verified/pms-inventory.xml` | 61 PMS tests passed, including catalog revisions/search, idempotent receipts/adjustments, expiry, role restrictions, validation rollback, ledger consistency and real-period dashboard values. |
| `pharmacy-inventory-verified/pharmacy-http-postgres.xml` | Three real HTTP/PostgreSQL/migration cases passed. Simultaneous receipts, stale adjustments, overselling, duplicate sale voids/dispensing/PO receipts and adjustment-versus-sale races reconcile to the movement ledger. Patient stock reads reflect the resulting inventory. Migration round trips preserve legacy profile, drug and batch values; populated downgrade is refused. |
| `pms-web/pms-inventory-verified.xml` | 120 portal tests passed, including 14 inventory/dashboard UI/input cases, inventory proxy checks, existing photo/session/handoff regressions and four real Redis cases. |

Total: **184 distinct passing tests**, no failures or skips. PostgreSQL checks
run in disposable containers with synthetic accounts and no exposed service
ports; the portal component tests use mocked repositories. All 96 checked portal
TypeScript/configuration/package files match the workspace byte for byte.
The portal production build, TypeScript, portal lint, scoped Ruff and whitespace
checks pass. All 414 local links in the updated guides resolve. Disposable
PostgreSQL and Redis test containers have been removed.

The QA image is `medapp-hospital-qa:inventory-20260915`, final manifest list
`sha256:d04b404caf9f339f21f71a5d371c3343f24e14ed1f2d531e01e4e3b2dd3bf3e5`.
Deploy the new API and portal together after applying the PMS migration; see the
[operations contract](api/pms_service.md) and [portal guide](../frontend/pms_web/README.md).
Initial proxy tests passed a scalar instead of an array to the route context;
the test table was corrected and all final portal tests pass.

S-031 remains **in progress / partially verified / not accepted**. The full set
still contains 108 references (76 patient, 32 specialist), 63 mobile routes and
three layouts. Scanning, refill orders, delivery, clinical interaction alerts,
partial PO deliveries, prescription corrections/refunds, older reports and
POS/dispensing recovery after lost responses remain open under B08/B11. Manual
request keys do not survive a full browser reload; reconcile saved records before
starting another write after leaving an uncertain form. No preview server was
started: automatic approval review previously rejected preview startup as
"blocked by policy". Browser/device/theme and full reference acceptance remain
pending; this milestone does not certify deployment or the whole application.

## Previous B03 update: managed pharmacy photos, 2026-09-15

The pharmacy owner can choose a JPEG, PNG or WebP, upload it to the saved draft,
preview it through the current portal session and publish separately. Text edits
and file selection survive errors; stale or uncertain writes require a confirmed
reload. Removing a draft photo leaves the published photo in place until the
removal is published. Replacing a photo releases browser preview resources.

The directory validates the original bytes, bounds decoded pixels, applies image
orientation and stores a metadata-free JPEG no larger than 1 MiB. Image bytes,
draft revision, history and unreferenced-image deletion share one PostgreSQL
transaction. At most the live and saved-draft photo remain. Public image GETs
check the active listing and exact published photo; withdrawal blocks new reads.
Private content requires current approved ownership and PMS access. The gateway
allows anonymous access only to the exact public photo GET route.

Apply pharmacy migration `20260915_0004` and configure
`PHARMACY_PUBLIC_API_ORIGIN` to the patient gateway's HTTPS origin. Local loopback
defaults to port 8000. No external storage credential is required; database backups
include managed photos. See the [contract](api/pharmacy_service.md#managed-pharmacy-photos)
and [portal setup](../frontend/pms_web/README.md).

Reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-photos-verified/pharmacy-photos.xml` | 85 pharmacy tests passed, including 22 photo validation, transaction, privacy, version, removal and cleanup cases. |
| `pharmacy-photos-verified/gateway-photos.xml` | 33 gateway tests passed, including anonymous photo GET boundaries and no-store forwarding. |
| `pharmacy-photos-verified/pharmacy-http-postgres.xml` | Three real HTTP/PostgreSQL/migration cases passed. Concurrent uploads produce one success, one conflict and one stored photo; publication/withdrawal and revoked-owner preview/upload checks pass. Empty migration roundtrips preserve legacy rows; populated downgrade is refused. |
| `pms-web/pms-photos-verified.xml` | 102 portal tests passed, including 20 profile UI cases, binary proxy/credential checks and four real Redis cases. |
| `pms-web/pms-photos-ui-final.xml` | All 20 profile UI cases passed again after correcting preview effect/state handling. These are included in the 102 cases above, not additional distinct tests. |

Total: **223 distinct passing tests**, no failures or skips. The patient mobile
code and public `photo_url` contract are unchanged in this milestone. All 82 PMS
TypeScript source/test files in the QA copy match the workspace byte for byte.
PMS production build and TypeScript, PMS lint, scoped Ruff, Compose configuration
and whitespace checks pass. Initial lint identified synchronous preview state
updates in effects. Local file previews now attach and release their object URL
through a React ref, and retry state changes occur in the user's retry action.
The final focused UI run includes both corrections. No browser preview server was
started. Disposable PostgreSQL and Redis test containers were removed.

Backend evidence used `medapp-hospital-qa:photos-20260915`, image manifest
`sha256:7c4e8badcf53addcc964d76d0bb4e5707da2a724f861da963acfc98950ade26c`.
The service lockfile resolves Pillow 12.3.0. The test runner stores no uploaded
originals and uses synthetic image bytes, accounts and approval documents.

Browser/device acceptance remains pending: automatic approval review previously
rejected preview startup as "blocked by policy." Live deployment, operational
pharmacy journeys and full reference/theme/accessibility acceptance remain open.
This supporting workflow accepts no reference screen. S-031 is still pending.

## Previous B03 update: pharmacy profile drafts and publication, 2026-09-15

The PMS owner can now save versioned directory drafts, preview saved and current
public details, explicitly publish/withdraw, and read paginated change history.
Editable details include contact/location, weekly hours, services, insurance,
photo URL and head-pharmacist biography. Licensing and ownership remain tied
to approval. The directory confirms the approved owner and current PMS access;
the portal derives the target pharmacy from its checked server-side session.

Drafts do not change patient-visible data. Publication, version advancement
and audit history commit together. Concurrent/stale edits return 409 instead
of overwriting newer work. The editor keeps inputs after errors and requires
explicit reload after uncertain outcomes. Withdrawal keeps the saved draft.

The patient pharmacy screen now consumes published services and head-pharmacist
information. It identifies overnight closing as the next day, without claiming
the pharmacy is currently open or treating a biography as a verified/bookable
practitioner. Photo previews handle broken URLs, and replacement URLs reset the
failed-image state. Photos currently require a hosted HTTPS URL; managed
upload/media-library functionality remains open.

Apply pharmacy directory migration `20260915_0003`. It preserves existing rows
and adds draft/publication metadata, public service/pharmacist fields and unique
per-pharmacy event versions. Downgrade refuses to discard recorded new data.
No additional environment secret is needed; current access checks use the
assigned deployment's existing MedApp exchange and identity context.

Final reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-profile-http-verified/pharmacy-directory-profile.xml` | 63 directory tests passed, including draft privacy, publication, withdrawal, history, protected-field rejection, stale edits and current PMS access. |
| `pharmacy-profile-http-verified/pharmacy-http-postgres.xml` | Three PostgreSQL/HTTP/migration cases passed. The full journey uses real profile APIs for publication, concurrent edits, withdrawal/republication and access revocation; it no longer flips the listing flag directly for QA. |
| `pms-web/pms-profile-verified.xml` | 88 portal tests passed, including 12 profile UI cases, session-derived profile routing and four real Redis cases. |
| `mobile/pharmacy-profile-mobile-verified.json` | 59 patient detail/adapter tests passed across three suites, including published services, pharmacist details and overnight hours. |

Total: **213 passing tests**, no failures or skips. PMS production build,
PMS/mobile TypeScript, PMS lint, scoped Ruff and whitespace checks pass.
Initial runs caught an incorrectly quoted JSON migration default and test fixture
imports/nullability. The final PostgreSQL and type checks include those fixes.
The final mobile run also corrects the new test's asynchronous icon settling;
it finishes without the earlier React act warnings.

All 530 TypeScript source/test files in the PMS/mobile QA copies match the
workspace byte for byte. The launchers removed their temporary PostgreSQL and
Redis containers.

These are component and backend integration results. Browser/native preview
startup remains unavailable because automatic approval review previously
rejected it as "blocked by policy." Live deployment, managed photo uploads,
operational journeys, themes/accessibility and complete reference acceptance
remain open. P-067 and S-003 have additional supporting evidence; S-031 remains
unimplemented. Counts remain 108 references (76 patient, 32 specialist), 63
mobile routes, three layouts and no accepted references.

## Previous B03 update: mobile pharmacy handoff and return, 2026-09-15

MedApp now lists the current owner's approved pharmacies whose assigned PMS has
confirmed activation. Settings and Professional applications link to Pharmacy
workspaces. Each pharmacy opens its own configured portal using a short-lived,
single-use proof bound to the pharmacy, deployment, source account and session.
The directory returns only public workspace fields; user_service independently
checks the matching deployment configuration.

The PMS previews the account before confirmation, rejects another signed-in
account/pharmacy, and verifies both the MedApp account and current PMS pharmacy
before creating a browser session. Return to MedApp closes only that browser
session and uses the saved allowlisted return route. Mobile checks its separate
pharmacy return marker before refreshing access. Hospital and onboarding flows
retain their own markers and have regression coverage in this run.

User-service migration `20260915_0011` records the proof's pharmacy and deployment
target. Compose and environment samples now include the per-deployment handoff
map, portal credential and matching return allowlists. See the
[pharmacy contract](api/pharmacy_service.md) and
[PMS setup guide](../frontend/pms_web/README.md).

Final reports under `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `pharmacy-handoff-http-verified/user-service-handoff.xml` | 226 user-service tests passed, including destination binding, one-time redemption, source revocation, independent browser sessions and migration round trip. |
| `pharmacy-handoff-http-verified/pharmacy-owner-workspaces.xml` | 36 directory tests passed, including owner-only discovery of private workspaces and inactive/unconfigured assignment handling. |
| `pharmacy-handoff-http-verified/pharmacy-http-postgres.xml` | Three PostgreSQL/HTTP/migration cases passed, including actual gateway handoff, PMS exchange, replay rejection and browser logout while the mobile session remains active. |
| `pms-web/pms-handoff-verified.xml` | 74 portal tests passed, including four real Redis cases, target/account conflicts, current-scope replacement, invalid responses, confirmation and return-screen remounts. |
| `mobile/pharmacy-handoff-mobile-verified.json` | 61 tests passed across seven suites covering all three portal handoffs, workspace selection, account changes, retry and API validation. |

The final total is **400 passing tests**, with no failures or skips. Mobile and
PMS TypeScript checks, the PMS production build, PMS lint, scoped Ruff and Compose
configuration checks pass. Unit suites substitute external providers; the HTTP journey uses synthetic
accounts and disposable PostgreSQL services. The initial QA runs exposed an
incorrect internal logout URL and test import/configuration errors; the final
reports include their corrections. Test-only user-service engine configuration
uses an inert PostgreSQL URL because the shared engine factory does not accept
the pool options with in-memory SQLite; test fixtures still supply their own
isolated database.

All 523 TypeScript source/test files in the PMS and mobile QA copies match the
workspace byte for byte. Scoped whitespace checks pass. The test launchers
removed their disposable Redis and PostgreSQL containers.

The inventory now has 63 mobile routes and three layouts. It retains 108
references in two groups (76 patient, 32 specialist), no accepted references,
and S-001 through S-005 in progress. This supporting selector does not implement
S-031's pharmacy dashboard. Pharmacy profile/publication, operational/reference,
device and deployed acceptance remain open. Browser/native preview startup
remains unavailable after automatic approval review rejected it as
"blocked by policy"; no alternate preview was started.

## Previous B03 update: pharmacy assignment UI and portal sessions, 2026-09-15

The admin application detail now loads approved pharmacies' configured PMS
deployments, requires an independent administrator to review and confirm a
permanent assignment, and opens the existing activation retry confirmation to
continue setup. Its proxy derives pharmacy identity from saved approval and
activation status. Stale or uncertain writes require an explicit reload; browser
forms cannot choose upstream origins or credentials.

The pharmacy portal now uses MedApp password/MFA sign-in or an explicit local
staff sign-in. Tokens and verification challenges stay in Redis behind an opaque
HttpOnly cookie. A new PMS `/v1/auth/context` response supplies the verified
pharmacy/staff identity and credential expiry. Parent refresh and short PMS
credential renewal run on the server. Every operational proxy request checks
current identity and access, and forwards only finite PMS routes. Sign-out,
revocation and scope changes prevent stale responses from repopulating a new
account's data; query caches and forms are reset across scopes.

PMS dependencies now match the current hospital portal's Next 16.3.5 / React 19.3
stack, with a refreshed lockfile and Node 24 container. The login form has no
pre-filled demonstration password. Settings shows verified pharmacy/account
details instead of placeholder service endpoints and configuration claims.
The framework lint check also identified and corrected render-time date
calculations in existing batch, receiving and report pages.

Final verification in `%LOCALAPPDATA%/MedApp/recovery-runtime`:

| Evidence | Result |
| --- | --- |
| `admin-pharmacy-web`: `npm test` | 74 tests passed, including assignment confirmation/conflicts and the existing review/session suite. |
| `pms-web/pms-portal-verified.xml` | 53 tests passed: server sessions, sign-in/MFA, finite proxy, UI, client races and four real Redis persistence/lease cases. |
| `pharmacy-portal-http-verified/pms-context-unit.xml` | 30 PMS tests passed, including current-access and verified-context assertions. |
| `pharmacy-portal-http-verified/pharmacy-http-postgres.xml` | Three five-service PostgreSQL/migration cases passed, extended to verify the PMS context and revocation through real HTTP. |

The final total is **160 passing checks**, with no failures or skips. Both portal
production builds and TypeScript checks pass; PMS lint, scoped Ruff, Compose
configuration and whitespace checks pass. The first admin test compile needed two
test typing corrections; the first PMS UI run needed a case-insensitive HTTP
header assertion. The final runs include those fixes. Existing admin dependencies
were unavailable through the historical recovery link, so validation used a fresh
non-destructive `admin-pharmacy-web` copy. The old link was not removed or changed.
All disposable Redis/PostgreSQL test containers were removed by their launchers.

This is software and backend integration evidence, not rendered screen acceptance.
Browser/native preview startup remains unavailable following the earlier automatic
approval rejection; no alternate preview was started. The new production
configuration and live accounts still need deployment validation. Native pharmacy
handoff, profile/publication, operational/reference flows and legacy reconciliation
remain open. The inventory remains 108 references: 76 patient-facing and 32
specialist-facing. No additional reference screen is accepted by this milestone.

See [portal setup](../frontend/pms_web/README.md) and the
[pharmacy contract](api/pharmacy_service.md) for configuration and operator steps.

## Previous B03 backend milestone: pharmacy deployment and owner access, 2026-09-15

The pharmacy approval backend now creates a private directory identity from the
frozen review snapshot, then waits for an independent administrator to assign a
configured PMS deployment. A versioned, permanent assignment selects the trusted
PMS origin and its dedicated activation/stock credentials. Receipts and PostgreSQL
locks make retries and concurrent first delivery safe. Existing standalone PMS
records and legacy approvals without snapshots require explicit reconciliation.

The PMS receiver creates the approved business profile and reserves its MedApp
owner membership without a password or invented personal email. The session
exchange confirms the active, email-verified MedApp account through user-service,
links the actual identity to SSO-only staff, and issues a separately scoped PMS
token lasting at most five minutes and no longer than its parent token. Runtime
checks use current workspace, staff and membership access. The applicant's global
MedApp role remains unchanged; local password login cannot bypass a linked
MedApp membership. Standalone staff retain local login with the new PMS token
issuer/audience/type requirements.

Patient reads now require active, listed profiles even when an old client sends
`only_listable=false`. Public output excludes owner and routing metadata. Legacy
CRUD cannot publish/delete approved profiles or supply upstream URLs. Stock calls
use confirmed assignments and validate the returned pharmacy ID and exact drug
name; malformed, uncertain or ambiguous responses are reported as unknown.
Directory migration `20260915_0002` and PMS `0002_medapp_workspace` retain receipts,
assignments and reserved memberships and refuse destructive downgrades once used.

Validation uses the recovery runtime under `%LOCALAPPDATA%/MedApp/recovery-runtime`
and disposable Linux PostgreSQL containers. Final results:

| Report | Result |
| --- | --- |
| `pharmacy-pharmacy-activation-final.xml` | 31 directory/configuration/stock cases passed. |
| `pms-pharmacy-activation-verified.xml` | 30 PMS activation, identity, session, revocation and existing health/stock-auth cases passed. |
| `onboarding-pharmacy-activation.xml` | 19 activation-worker cases passed, including pharmacy setup/retry and existing clinician/hospital behavior. |
| `pharmacy-linux-activation-verified/pharmacy-http-postgres.xml` | Three PostgreSQL cases passed: one real five-service journey and two migration round trips preserving legacy rows. |

The deduplicated total is **83 passing checks**, with no failures or skips in
these final reports. The initial PostgreSQL run also passed three cases; the final
image repeated them after the last access checks and dependency declarations were
finished. Fourteen implementation/test files match the unit-tested recovery copies,
and 21 source files match the final PostgreSQL image
`sha256:3f010ad477abd0c0a4865f5f9fa35c3036631ea3814563c569ff82a6ec4ee8f2`.
The launcher removes its disposable PostgreSQL/test containers; the QA image is
retained as a build cache.

The real journey covers approval, private gateway reads, concurrent deployment
assignment, concurrent first PMS bootstrap, reviewer retry, actual user-service
login/account verification and PMS session exchange, stock identity, unchanged
platform role, revocation and downgrade refusal. The test's publication flag and
email-verification flag are changed only on disposable QA records; they do not
stand in for a production publication editor or OTP delivery acceptance.

The initial directory run had two incorrect test expectations (403 instead of the
receiver's 401); the corrected suite passes. Initial PMS collection found missing
`passlib` in the recovery runtime. `passlib` 1.7.4 and `bcrypt` 4.3.0 were installed
with `uv pip`, then its suite passed. Both service lockfiles were updated. The
pharmacy manifest now declares its shared package, HTTP client, PostgreSQL
migration driver and test dependencies. Scoped Ruff, whitespace checks and Compose
configuration pass; Compose's deployment-map value parses as an empty JSON object
with the default configuration. No live deployment credentials were configured.

The backend adapter was supporting work for B03/B11. At that milestone, the admin
assignment UI and PMS portal session flow (implemented in the update above),
native pharmacy handoff, pharmacy profile/publication,
operational workflows, legacy reconciliation and reference acceptance remain open.
See [pharmacy setup and API contract](api/pharmacy_service.md) for exact deployment
steps and limitations. The inventory remains 108 references (76 patient, 32
specialist); this backend milestone adds no accepted screen. The complete-app goal
remains in progress. Earlier automatic approval review blocked local UI preview
startup; no alternate preview startup was attempted in this backend milestone.

## Product and repository map

MedApp connects a user's portable health record with discovery, booking, consultations, prescriptions, labs, follow-up, and an AI companion. The mobile application adapts to patient and practitioner roles. Hospital and pharmacy systems are separate partner products with their own access boundaries.

| Surface | Location | Observed structure |
| --- | --- | --- |
| Mobile | `frontend/mobile/MedAPP` | Expo SDK 55, React Native 0.83.6, React 19.2, TypeScript, Expo Router, NativeWind, TanStack Query, Zustand |
| Hospital portal | `frontend/hms_web` | Next.js pages for patients, appointments, departments, staff, queue, pharmacy, prescriptions, and billing |
| Pharmacy portal | `frontend/pms_web` | Next.js pages for POS, inventory, batches, prescriptions, suppliers, purchasing, customers, sales, reports, staff, and settings |
| Platform admin | `frontend/admin_web` | A scaffold landing page; operational KYC, moderation, and analytics screens still need implementation |
| Backend | `backend/services`, `backend/shared` | 20 service directories including the gateway; FastAPI, SQLAlchemy, per-service databases/migrations, shared auth, audit, events, and observability |
| AI | `agents/services`, `agents/shared` | Six agent services, shared model-provider abstraction, patient memory/retrieval, and HTTP tools |
| Operations | `infra`, `.github/workflows`, `scripts` | Docker, Terraform, Helm, CI/deployment workflows, migrations, seed and test tooling |

Inventory corrected to exclude a route-directory test file: 56 non-test mobile route/layout files (53 route entries and 3 layouts), 105 mobile test files under `src`, and 109 HTML files plus 126 PNG files under `UI_screens`. The detailed inventory classifies 108 HTML files as screen references and one as an animation asset. Additional booking/telemedicine HTML references live in `.stitch-html`.

## Existing implementation to build on

- The root layout loads fonts, hydrates authentication and appearance, and establishes the query/navigation providers. Authenticated routes have a sign-in guard and preserve shared-link destinations.
- The auth store and common HTTP client implement token storage, current-user loading, a single-flight refresh/retry path, device identity, and sign-out handling.
- Route files generally delegate to feature screens. Feature API adapters translate backend snake_case contracts into app-facing types. Shared shells distinguish patient tabs, practitioner tabs, and detail screens.
- Booking and appointment modules call `/v1/bookings`; practitioner self-service uses the schedule APIs. Care discovery and facility details have API adapters and hooks.
- Inbox, chat, community, lab results, overview, and individual patient records have substantial UI/API implementation. Their existence is not proof that every action or state has been verified against a running stack.
- The gateway explicitly routes the services. HMS and PMS use `/v1/hms/*` and `/v1/pms/*` namespaces to avoid collisions with MedApp authentication and patient routes.

## Confirmed completion work

| Area | Evidence in the current source | Completion needed |
| --- | --- | --- |
| Account recovery | Initially rendered “Coming next.”; now implemented in `features/auth/ForgotPasswordScreen.tsx`. | Local gateway/SMTP recovery checks pass. Finish rendered/native-device acceptance and configure the deployment's email transport. |
| Social sign-up and help | `features/auth/SignUpStep1Screen.tsx` contains unwired Google/Apple/help handlers. | Finish the supported identity and support actions, including cancellation and error states. |
| Medications | `features/medications/ActiveMedicationsScreen.tsx`, `MedicationDetailsScreen.tsx`, and `MedicationTrackerScreen.tsx` import sample data. | Provide patient-scoped persisted medication and adherence data, then connect the existing screens. |
| Prescriptions | `features/scripts/PrescriptionHistoryScreen.tsx` and `NewPrescriptionScreen.tsx` import prescription samples; the EHR model currently contains patients, vitals, consents, and audit records. | Establish the owning clinical contract and clinician issue/patient read flows. Reuse existing partner prescription integrations where appropriate without treating a patient token as a pharmacy staff token. |
| Lifestyle logging | `features/lifestyle/LifestyleManageScreen.tsx` stores entries only in component state and explicitly states that entries are discarded on exit. | Persist entries and connect history, summaries, and relevant recommendations to saved data. |
| Video consultations | `features/telehealth/TelemedicineConsultationScreen.tsx` uses local call/media state and fallback identities. `telehealth/api.ts` wraps room operations but documents the absent media transport. | Connect booking identity, room lifecycle, participant access, and a real audio/video transport; verify a two-party call, reconnect, and leave/end behavior. |
| Practitioner roster | `features/roster2/ActivePatientRoster2Screen.tsx` renders a roster-unavailable state. | Define and expose an authorized patient relationship/list contract, then restore roster actions with real data. |
| Practitioner identity | `features/practitioner/api.ts` scans the doctor directory to find the caller's profile. | Add or reuse a direct self-profile lookup after checking the service contract; support clinician profile/schedule actions without downloading the whole directory. |
| Booking time handling | `features/booking/api.ts` composes a device-local date/time and retains a fallback duration. | Carry authoritative slot instants/end times and verify cross-timezone booking behavior. |
| Payments | `payment_service/app/services/payment_service.py` constructs provider references locally; the payment gap register documents simulation. | Implement the selected provider flow and webhook/status/refund behavior before presenting a successful charge to a user. |
| Platform admin | `frontend/admin_web/src/app/page.tsx` is a scaffold. | Implement the operational workflows needed for onboarding review, moderation, and administration. |
| Automated verification | `.github/workflows/backend-ci.yml` lists 13 services, while the backend has 20 service directories. | Check all workflows for effective coverage and close gaps, including mobile and gateway-to-service integration checks. |

Other areas needing a focused pass include notifications and preferences, wearable consent/sync, Q&A entry points, practitioner social profiles, partner onboarding, uploads/exports, and remaining reference-only screens. This review does not classify those entire areas as missing: some have newer implementations than the gap register describes.

## Completion order

1. **Establish a reproducible local baseline.** Finish dependency availability, type checking, existing tests, service startup, migrations, and test accounts. Capture actual failures before changing behavior.
2. **Finish the core care journey.** Registration/recovery → provider discovery → authoritative availability → booking → patient/practitioner schedules → consultation → a saved clinical outcome. Verify through the gateway with both roles.
3. **Connect the clinical follow-up screens.** Medication lists, prescriptions, adherence, patient relationships/consent, labs, and records must read and write service-owned data.
4. **Complete supporting journeys.** Lifestyle logging, wearable sync, notifications/preferences, messaging/Q&A, community, onboarding, and account actions. Compare against the reference inventory and resolve variants or reference-only screens deliberately.
5. **Complete partner operations and release checks.** Finish the required admin/HMS/PMS workflows and their integration boundaries; cover payment/media configuration, deployment readiness, device behavior, and recovery from failed requests.

For each slice: inspect the existing API and gateway mapping, document the contract, implement missing behavior, connect the existing UI, and verify the complete journey. A screen is done when its actions persist the intended result, navigation works for its role, loading/empty/error/retry states are accurate, and it works in both themes on the target devices.

## Design and project conventions

- Preserve the existing visual system: shared components/shells, teal tokens, Manrope headings, Inter body text, and System/Light/Dark appearance.
- Use `UI_screens` and `.stitch-html` as local visual references while observing the canonical design guidance in `BRAND.md` and `MOBILE_UX.md`. Inspect the relevant approved frame when a discrepancy needs resolving; this review did not inspect the live Figma file.
- Read `docs/api/<service>.md` and the actual service before adding an endpoint. Existing code demonstrates several past “missing API” issues that were routing problems.
- Sample clinical data must remain visibly identified until replaced with real data. A failed or unavailable source must not appear as “no medications” or “no patients.”
- `frontend/mobile/MedAPP/AGENTS.md` requires the versioned Expo v55 documentation to be read before writing mobile code.
- `PIPELINE.md` contains historical agent ownership and handoffs. Read the relevant entries for context, and check their current applicability against the user's instructions and actual code.

## Validation from this review

Source inspection, route/service/reference inventory, and representative reference-image inspection completed. No application implementation was changed.

The existing mobile TypeScript check (`tsc --noEmit --incremental false`) and Jest suite (`jest --runInBand --silent`) were started, but neither produced a result after several minutes; both were stopped. Some dependency files have Windows offline/recall attributes in this OneDrive workspace, which may explain the stalls, but the exact cause was not established. These attempts are **unverified**, not passing checks or diagnosed code failures. `git status --short` also stalled and was stopped, so the working-tree baseline was not established.

Backend tests, a running frontend, live gateway journeys, device builds, and deployment were not validated in this read-through. Historical “verified live” statements in source comments and documentation are not results from this review.

## B00/B01 implementation follow-up — 2026-09-12

The statements immediately above describe the original read-through. This follow-up adds actual
implementation evidence without treating the full platform as validated.

- Replaced the recovery placeholder with email request, code entry, password confirmation,
  resend timing, error handling and completion states using the existing components and themes.
- Connected `/v1/auth/password/forgot` and `/v1/auth/password/reset`; corrected the documented
  public paths. Added configurable SMTP and Compose forwarding. Missing transport returns 503.
- Focused password/SMTP tests: **14 passed**. Full user-service suite: **83 passed**, with one
  warning from the existing wrong-algorithm JWT test's short synthetic SHA512 key.
- The baseline run first found three unrelated failures: a privileged-role signup in a KYC
  fixture, an obsolete patient-KYC expectation, and signup examples using alias names. The fixture
  now provisions its reviewer through the test database, patient signup checks `not_required`,
  and the example uses the canonical `first_name`/`last_name` fields. Authorization behavior was
  preserved; self-review remains rejected.
- Real HTTP through the gateway and user service, backed by an isolated SQLite QA database,
  delivered to a loopback SMTP inbox and completed reset. Invalid/reused codes failed, old password
  failed, new password worked, old refresh token failed, known/unknown responses matched, and CORS
  preflight passed. No external recipients or deployed data were used.
- Clean mobile dependencies were installed at `%LOCALAPPDATA%\MedApp\recovery-runtime\mobile`.
  The repository and runtime lockfiles have identical SHA-256 hashes. The first install failed
  with a network reset; `npm ci --ignore-scripts --prefer-offline --maxsockets=4` then succeeded
  (1034 packages). Dependency lifecycle scripts and native builds were not validated.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed in that source mirror.
  Source changes must be copied into the mirror before subsequent runs.
- The seven `ForgotPasswordScreen` tests passed with `--runInBand --silent --testTimeout=30000`.
  The initial run hit the default five-second limit on its first test; the rerun completed with
  all assertions passing. New screen/test files also pass Prettier's check.
- The full mobile baseline completed **106 suites / 1,564 tests**: 104 suites / 1,562 tests passed,
  and two community tests exceeded the default five-second limit. A diagnostic rerun with a
  30-second limit and `--detectOpenHandles` still timed out on a different comment-thread test.
  Both community fixtures now unmount their trees and clear their query clients after each test.
  The affected suites subsequently passed **34/34 tests** with `--testTimeout=30000`; their
  assertions were unchanged. These are targeted rerun results, not a second clean full-suite run.
- Jest still reported background work after all test results were written, including after that
  teardown change. Completed test processes were stopped after capturing the reports. The source
  of the remaining handles is unresolved; B00 must establish reliable full-suite shutdown and
  timing before calling the baseline complete. No blanket timeout or forced-exit setting was
  added to the repository's Jest configuration.
- Rendered browser QA is pending: automatic approval review rejected starting the Expo web server
  with “blocked by policy” and supplied no more specific reason. No screenshot or theme/device
  acceptance is claimed. Native keyboard and PostgreSQL concurrent-token behavior are also pending.

The Python validation environment is `%LOCALAPPDATA%\MedApp\recovery-runtime\python` with
editable `backend/shared` and `backend/services/user_service[test]` installs. Tests ran from
`backend/services/user_service` using `python -m pytest -p pytest_asyncio.plugin tests -q
-o asyncio_mode=auto`, a synthetic `USER_JWT_SECRET`, `USER_PUBLISH_EVENTS=false`, and
`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`. The extra loopback SMTP harness is temporary QA tooling outside
the repository; it does not add test routes to the shipped service.

## Dependency installation follow-up — 2026-09-13

- Installed the full mobile dependency tree in the actual repository with
  `npm.cmd ci --include=dev --prefer-offline --no-audit --no-fund --maxsockets=4`:
  **1,028 packages installed, exit 0**, with lifecycle scripts enabled.
- Applied Expo's SDK 55 patch recommendations and regenerated the lockfile. Installed versions:
  **Expo 55.0.31, React Native 0.83.10, React/React DOM 19.2.0**. The Expo compatibility check
  reports “Dependencies are up to date”; `npm ls` confirms these versions without peer errors.
- Expo Doctor 1.20.4: **20/20 checks passed** in the actual repository. The edited package file,
  Jest configuration and mobile README also pass Prettier's check.
- Added an exact `react-test-renderer@19.2.0` development dependency. A fresh resolution otherwise
  selected renderer 19.3.0 through React Native Testing Library v13's broad peer range and failed
  against React 19.2.0. The corrected lockfile installs without `--force` or `--legacy-peer-deps`.
- Updated the mobile README with project-specific installation, startup and validation commands.
  Node 24.20.0 is available. Android SDK/Java tooling was not found in PATH or the usual SDK
  location; no native build or device validation is claimed.
- The older disposable mobile mirror's incremental update failed with `ECONNRESET` and cleanup
  `EPERM` warnings. A clean `npm.cmd ci --include=dev --offline --no-audit --no-fund --maxsockets=4`
  then succeeded there: **1,028 packages, exit 0**, with lifecycle scripts enabled. Dependency and
  TypeScript checks above use the actual repository; earlier mirror test results remain historical.
- Python Playwright 1.62.0 can launch Chrome 152.0.7977.83. Browser plugin not available; regular
  Playwright is the selected browser QA tool. The local gateway/user-service/SMTP harness started
  and its health checks passed, but no rendered app test completed.
- After the user explicitly requested installation and end-to-end testing, automatic approval
  review again rejected `expo start --web --port 8082 --localhost --max-workers 2` with
  “blocked by policy” and no specific reason. Browser recovery acceptance remains pending.
- The first repository TypeScript run failed to read the old `.expo/types/router.d.ts` OneDrive
  placeholder. Regenerated that ignored file from the current routes with the installed Expo
  typed-route generator; the replacement is a normal local file. The first Jest run failed before
  executing tests with an `UNKNOWN` filesystem read error. These are failed validation attempts,
  not passing checks or evidence that application assertions failed.
- After regenerating the route types, `node node_modules/typescript/bin/tsc --noEmit
  --incremental false` **passed in the actual repository** with the newly installed dependency tree.
- The fresh full-suite run exposed a comment-error test that raced a real three-second toast
  dismissal. That case now uses fake timers and restores real timers after cleanup. It retains
  the visible-error/reply-mode assertions and also checks that the failed draft is preserved.
  The affected suite passes **16/16 tests** with the new dependency tree. Jest still reports work
  after that suite completes; reliable runner shutdown remains an unresolved B00 item.
- The full repository run completed **106 suites / 1,564 tests**: **105 suites / 1,563 tests
  passed**, with the one comment-toast failure described above. All seven recovery tests passed.
  The full run had already executed the old comment test before its correction; the 16/16 rerun
  verifies that correction separately. No second all-green full run is claimed. The cold full
  run took about 23 minutes with `--runInBand --silent --testTimeout=30000`. Both completed Jest
  processes were stopped after saving their JSON results because they retained background work.
  No forced-exit option or blanket timeout change was added to project configuration.
- The actual repository and repaired mirror lockfiles match SHA-256
  `d3cb2172f49159491b42eb48e9c5f54ed37dfc119e2e18d86923e96779b7707d`.
  Current `src`, Jest configuration, README and regenerated route declarations were synchronized
  to the mirror. The loopback recovery services remain healthy on ports 8800 and 8801; the
  browser scenario is prepared but still awaits permitted Expo web startup on port 8082.

## B01 email verification and sessions — 2026-09-13

The product owner chose email verification first. Signup now sends a six-digit code to the
Step 1 email through the existing SMTP transport. The screen keeps the signup shell, theme
tokens, contact card and code input, with separate code-expiry and resend timers, delivery
help, expired/invalid-code feedback and retry states. Changing email or leaving the screen
prevents a late verification response from continuing the old signup attempt. The input uses
the cross-platform `one-time-code` autofill hint from the
[React Native 0.83 TextInput contract](https://reactnative.dev/docs/0.83/textinput#autocomplete).

The OTP start response adds `resend_after_seconds`; the mobile adapter retains a 30-second
fallback for older backends. Wrong-code attempts now survive the expected 400 response,
only the latest code can verify, and SMTP failures return 503 while rolling back an undelivered
code. A row lock protects the verification record on PostgreSQL; local SQLite tests do not
establish concurrent PostgreSQL behavior. No database migration is required for these changes.

Session restoration no longer overwrites a refreshed token or restores a profile after sign-out.
A late profile failure cannot clear a subsequently signed-in session. Sign-out clears visible
authentication before waiting for storage, and storage deletion failures no longer leave that
visible session active. Device deletion and server revocation remain best-effort on failure;
this does not certify all refresh/sign-out races or per-user query-cache cleanup.

Validation recorded in this pass:

- Five added session regressions failed against the previous implementation. After the fix,
  session, hydration and API-refresh suites passed **29/29 tests**, exiting normally.
- Three added OTP regressions first failed on persisted attempts, old-code reuse and delivery
  failure. After the fixes and additional expiry/transport cases, the complete user-service
  suite passed **89 tests**. One existing JWT wrong-algorithm fixture emits a key-length warning.
- The actual repository passed TypeScript. A real HTTP test using the gateway, user service,
  SQLite and a loopback SMTP server passed email delivery, separate timer values, immediate
  resend rejection, wrong/reused-code rejection, verified account creation, login, profile,
  token refresh and logout. Only synthetic data and local recipients were used.
- The first five-suite signup/recovery UI run passed 34/36 tests. One new test exceeded the
  existing 30-second invocation timeout during cold rendering; another exposed a test helper
  dropping its safe-area wrapper on rerender. After correcting the wrapper, signup verification
  and code-input suites passed **17/17**, exiting normally with the same invocation timeout.
  Together with the passing API adapter, signup navigation and recovery suites, this establishes
  **36 focused auth UI/adapter tests** across the initial run and targeted rerun, plus the separate
  **29 session tests**. This is not a new full mobile-suite acceptance run. The final timer cleanup
  also passes formatting and TypeScript with source synchronized to the disposable mirror.
- Automatic approval review rejected Expo web startup again with “blocked by policy” and no
  specific reason. No rendered light/dark, responsive, keyboard or native-device acceptance
  is claimed. External SMTP configuration and delivery have not been verified.

B01 remains in progress. The signup adapter still discards the personal details and preferences
collected in Steps 2 and 3; the sharing-consent label and stored field also need reconciliation.
Social sign-in, remaining home/profile/account actions and broader session/cache behavior remain
in the guide. All 32 specialist references retain their not-implemented starting status.

## B01 saved signup details — 2026-09-13

Signup now sends DOB, gender, optional self-reported blood type and primary health goal in the
original account-creation request. The user service validates and stores them in that same
transaction. `/v1/me` restores them into the mobile user model after login/refresh, and the
profile displays the saved values. Calendar dates retain their day across device timezones;
absent values say "Not provided". The authenticated profile PATCH accepts these fields,
preserves omitted values and retains the existing privileged-field restrictions.

Migration `20260913_0004` adds nullable blood-type and primary-goal columns. Existing DOB/gender
columns are reused. Apply this migration before the new user-service code. Downgrade removes
the two new values but preserves accounts and pre-existing fields.

Working assumption for this pass: unavailable signup enrollment/sharing options are disabled
until implemented. Their switches remain off, and Complete/Skip records no research consent,
care-team access or security enrollment. The care-team field has a distinct name and the
unsupported compliance/audit claims were removed. Actual biometric enrollment, two-factor setup
and scoped provider consent remain open; this is not acceptance of those reference features.

Duplicate taps cannot submit concurrent account creation. If creation was confirmed but login
or session storage fails, Step 3 shows an account-created message and offers sign-in. An uncertain
creation response still needs an idempotent recovery design; it is not assumed successful.

Validation:

- **100 user-service tests passed**, including personal-details persistence, invalid input,
  current-account isolation, partial updates and a SQLite migration round trip. The existing
  wrong-JWT-algorithm fixture still emits its key-length warning.
- Docker 29.7.2 and an existing `postgres:16-alpine` image were available. A temporary loopback
  PostgreSQL container passed the full migration chain, upgrade of an existing account, API
  signup/readback, profile changes, rejection of privileged updates, downgrade and re-upgrade.
  PostgreSQL SQL generation also passed. The temporary container was stopped and removed after
  validation; existing project databases were not migrated or changed. OTP/reset concurrency
  was not part of this PostgreSQL check.
- Real HTTP gateway + local SMTP checks passed verified signup with all personal fields,
  logout/fresh login/readback, nullable/partial profile updates and atomic invalid-input
  rejection. The first attempt ran before the restarted user service was ready: the gateway
  returned 500 for `httpx.ConnectError`. Both health checks then passed and the complete scenario
  passed. Mapping unavailable upstream services to a deliberate gateway error remains B00 work.
- **38 focused mobile tests passed** across the initial run and targeted rerun. The initial
  run passed 35 tests but could not load the three route tests because their isolated setup
  imported an unconfigured API client. Mocking that unused client fixed the test setup; the
  route suite then passed 3/3. The checks cover wire mappings, signup/skip/duplicate submissions,
  the account-created error state, disabled choices, saved/missing profile values, and existing
  navigation/theme guards. This is not a new full mobile-suite acceptance run.
- TypeScript passed in the actual repository; changed mobile files were formatted. Inventory
  checks retain 108 unique references and all 32 specialist entries as not implemented.
- Rendered browser/device acceptance remains pending from the earlier Expo startup rejection
  by automatic approval review ("blocked by policy", no specific reason). No new browser or
  native-device acceptance is claimed in this pass.

Next B01 work: the profile editor, real security enrollment and scoped care-team sharing,
social sign-in and remaining account/home actions. The changes remain in the working tree;
no git commit, deployment or production migration was performed.

## B01 patient profile editor — 2026-09-13

The patient profile now has an **Edit profile** entry point at
`/(app)/edit-patient-profile`. It fetches `/v1/me` before editing, retains the real
first/last name parts and edits DOB, gender, self-reported blood type and primary
health goal. PATCH includes only changed fields, with explicit null to clear optional
details. Existing legacy gender values survive unrelated edits. Empty last names are
supported; first names are required and both name fields are trimmed and bounded to
the database's 255-character limit. Invalid PATCHes return 422 atomically.

The confirmed server response refreshes the auth store and editor cache. Failed saves
preserve entries for retry; repeated submissions are guarded before async validation;
fields lock during saving. Unsaved stack navigation offers keep/discard choices.
Late responses cannot repopulate an account after sign-out or replace a different
patient's identity. Email/avatar/contact/provider editing is outside this editor.

Validation:

- **108 user-service tests passed** against the actual repository, including eight new
  profile-editor cases. The initial temporary run lacked the documented synthetic JWT
  secret; its retry then exposed an outdated KYC test in that temporary copy. Neither
  run is acceptance evidence. The repository run used the baseline's test environment
  and passed; its only warning is the existing wrong-algorithm JWT fixture's key length.
- **50 focused mobile tests passed across nine suites and targeted reruns** covering form validation,
  API mapping, saving/retry, unsaved navigation, account changes, profile navigation
  and prior signup/profile cases. Expo icon loading emitted existing-style async `act`
  warnings. The initial eight-suite run passed 42 tests. The editor's five tests passed
  again after tightening the pre-validation submission guard; a sixth route test was
  then added to require a successful fresh load before opening cached profile data.
  The route rerun initially retained Jest's default five-minute query-cache timer;
  its test client now uses the editor's zero cache-retention setting and all six
  route tests pass with normal exit. Seven shared-input regression tests also pass;
  Input accepts a React 19 ref so form validation can focus an invalid text field,
  and the editor displays a validation summary near Save. This does not
  replace the recorded full mobile baseline or rendered QA.
- **TypeScript passed** in the actual mobile repository, including the new route and
  tests. Changed mobile files were formatted and targeted diff checks passed.
- **Live loopback gateway/SMTP checks passed** for verified account creation, editing
  names/personal details, rejected invalid name/date/role changes, explicit clearing,
  logout and a fresh login restoring the edited values. The temporary harness uses
  SQLite; no new PostgreSQL migration was needed or claimed for this validation change.
- The reference PNG could not be read because OneDrive timed out. The editor follows
  the implemented profile and shared form primitives; exact visual/reference, theme,
  keyboard and native navigation acceptance remain pending. Expo browser startup was
  previously rejected by automatic approval review as "blocked by policy" without a
  specific reason. No new Expo startup, deployment or production migration was attempted.

Next B01 work: actual security enrollment and scoped care-team sharing, social sign-in,
remaining account/home actions and rendered/device acceptance. The inventory retains
108 references with all 32 specialist entries unimplemented; app routes now total 55
plus three layouts. No reference is newly marked accepted by this pass.

## B01 active sessions — 2026-09-13

Security & privacy now opens `/(app)/active-sessions`. The page lists actual account
sessions with a current-session marker, recorded platform/IP and timestamps. It
supports paging, refresh, loading/empty/error states, confirmation and retry.
Successful remote revocation removes the session; current-session revocation also
clears local sign-in and returns to login. Duplicate confirmations and late responses
after account changes are guarded. Unknown user agents remain unidentified.

User-service list/delete endpoints are available through the existing gateway `/v1/me`
mapping. Session IDs and start times remain stable during refresh rotation. Legacy
tokens upgrade lazily, and older access tokens without `sid` cannot identify the
current session. Revocation closes a whole refresh family under an account row lock;
a retry with a deliberately revoked ancestor cannot eject unrelated sessions. Logout
also closes the family if it races rotation. Existing access JWTs keep their normal
expiry, usually up to 15 minutes, as stated in the UI and API contract.

Migration `20260913_0005` adds nullable family/start metadata and an index. Apply it
before deploying this user-service version. Downgrade retains accounts/token rows but
removes family metadata. No production migration or deployment was performed.

Validation:

- **115 user-service tests passed** against the actual repository, including session
  privacy, ownership, rotation, legacy compatibility and migration cases. The existing
  wrong-algorithm JWT fixture still emits its key-length warning.
- **PostgreSQL 16 checks passed** for legacy upgrade, downgrade/re-upgrade, three
  overlapping refresh/revocation races and competing refresh requests. The harness
  confirmed competing requests were waiting on the account lock before releasing it.
  Revocation left no usable successor; concurrent refreshes produced only one successful
  rotation. The first harness attempt loaded an outdated temporary shared JWT module;
  explicit repository imports corrected the harness before the passing run. The
  disposable loopback container was stopped and removed after validation.
- **Live loopback gateway checks passed** verified-email account creation, session list,
  remote revocation after rotation, continued access renewal by the other device,
  current-session revocation and idempotent retry. SMTP used the local mail catcher.
- **11 focused mobile tests passed across three suites and a targeted rerun**. They
  cover safe metadata, confirmation/cancel, removal after success, current-session
  sign-out, retry, paging, empty state, late account changes, request mapping and the
  settings entry point. An initial cold-render timeout and a removal-state assertion
  required investigation. The isolated diagnostic also exceeded its 30-second test
  budget during the first native render. The final screen run awaits the asynchronous
  confirmation action and allows 90 seconds for cold initialization; all seven screen
  cases passed, with removal completing in 372 ms. Expo icon/query notifications still
  emit non-failing async `act` warnings. No full mobile-suite acceptance is implied.
- **TypeScript passed** in the synchronized local mobile QA copy. Hash checks confirm
  the tested screen, route and adapter match the working-tree files.
- Inventory checks retain 108 unique references (76 patient and 32 specialist), with
  every specialist entry unimplemented/unaccepted. A fresh source recount finds 55
  non-test routes plus three layouts, including active sessions; all routes are mapped.
- Rendered reference, theme and native-device acceptance remain pending. Earlier Expo
  startup was rejected by automatic approval review as "blocked by policy" without a
  specific reason. No new Expo startup or workaround was attempted in this pass.

The security reference remains partially verified. Biometric enrollment, two-factor
setup, scoped care-team consent, social sign-in and remaining B01 home/account actions
remain open, along with the specialist and later-batch scope.

## B01 biometric enrollment and credential lifecycle — 2026-09-13

Security & privacy now supports explicit biometric enrollment, confirmed disable
and **Lock MedApp**. Capability alone is shown as Off. Successful setup requires a
protected native key read, and a failed/cancelled setup cannot produce a success
claim. Unsupported devices retain password sign-in. Signup points to setup in
Security & privacy after account creation instead of silently enrolling a device.

Expo Crypto `~55.0.19` was selected from the installed SDK 55 dependency mapping and
installed in the repository and local QA copy. The storage wrapper encrypts the
refresh credential with AES-256-GCM. Its key uses a unique native SecureStore service,
`requireAuthentication` and device-only keychain accessibility. Account/key context
is authenticated with the ciphertext. Ordinary bearer entries are removed before
enrollment is committed, and uncertain native writes have a rollback path. A restart
does not hydrate the enrolled account before authentication. The unlocked key and
access token remain in memory for the app session; renewal reseals the successor
without another native prompt. Turning protection off requires a fresh protected read.

Explicit lock hides the account and clears cached query data. An already-issued
refresh can persist its successor before the key is dropped; unlock waits for that
settlement. No automatic background/inactivity lock is claimed. Sign-out removes
the credential/enrollment and attempts family revocation. A new password sign-in
removes the prior enrollment. Device-key changes require password fallback and setup
again. The client-reported biometric audit flag is not a second factor or attestation.

Session revisions and serialized storage mutations reject stale account responses.
Rotated credentials are saved before `/me`, so a profile network failure does not
cause reuse of an old token on retry. Partial token writes clear the unusable local
session. Password-change copy was also corrected to match the backend's existing
refresh revocation: success clears the form and offers **Sign in again**, which
removes local credentials/enrollment. Duplicate changes are guarded and inputs lock
during submission; rejected changes retain the draft for retry.

Validation recorded so far:

- **72 distinct focused mobile cases passed across 11 suites and targeted reruns**.
  These include 13 storage cases, 24 auth-store cases, confirmation/settings behavior,
  password-change outcomes, login/signup identity races, signup completion, refresh
  ordering and prior client/hydration regressions. The final auth/password rerun
  passed 27/27 after the missing-credential fallback and final UI guards. This is
  not a full mobile-suite acceptance run. The corrected identity-fixture rerun
  passed 3/3 after final TypeScript. Async query/icon notifications still emit
  non-failing React `act` warnings in some component/hook tests.
- The first storage suite failed before running because Jest's hoisting rejected a
  TypeScript constructor parameter property in the crypto test fixture. Replacing
  that fixture declaration fixed the harness; the storage cases then passed. Native
  keychain/prompt calls are mocked. The crypto fixture uses real Node AES-GCM under
  the Expo JS contract; it does not prove the Expo native bridge or OS enforcement.
- **Final TypeScript passed** after correcting the signup payloads in the new
  identity-race test fixtures. Runtime files and dependency manifests match the
  tested local QA copy by hash. Expo's read-only public configuration resolves SDK
  55 and both Face ID permission plugins; installed Crypto is 55.0.19, SecureStore
  and LocalAuthentication are 55.0.18. No Expo server was started. The latest
  native config/package changes require a new device build.
- The current environment has no `adb` command or default Android platform-tools
  installation. Physical biometric, native navigation, both-theme and reference
  acceptance remain unverified. Earlier Expo browser startup was rejected by automatic
  approval review as "blocked by policy" with no specific reason; no startup workaround
  was attempted. The successful config read is not rendered or device acceptance.
- No backend code, production migration or deployment was changed in this pass.
  The last user-service baseline remains 115 passing tests. All 108 reference IDs
  are retained, with all 32 specialist screens still unimplemented/unaccepted.

Next B01 work includes two-factor setup, scoped care-team consent, social sign-in,
remaining home/account actions and rendered/device acceptance. The full completion
goal remains open across B00–B12.

## B01 authenticator enrollment and sign-in — 2026-09-13

Implemented a complete software path for authenticator setup, password-plus-code
sign-in, single-use recovery codes, recovery-code replacement and confirmed disable.
Security & privacy opens the new `/(app)/two-factor` route. Signup stays off and
points to post-login setup. All 108 reference IDs are retained: 76 patient and 32
specialist. All specialist entries remain not implemented and unaccepted. Source
recount finds **56 routes and three layouts**, with no unmapped routes.

The user service issues an opaque five-minute challenge after a correct password
for an enrolled account; it issues no session until a factor is verified. Challenge
tokens are hashed and bound to the device, password version and enrollment. TOTP
steps cannot be reused; recovery codes are individually consumed. Five failed proofs
lock checks for 15 minutes, including across setup restarts and fresh challenges.
The phone OTP token-issuing path cannot bypass enrollment. Password changes/resets
invalidate pending challenges and unfinished setup without removing active enrollment.

Migration `20260913_0006` adds factor/challenge tables. TOTP secrets use an independent
Fernet key with account/generation binding, while recovery codes are only stored as
hashes. Enable/disable/recovery-code changes serialize on the account lock and revoke
refresh sessions; access JWTs keep their normal expiry. Local credentials and biometric
enrollment are cleared when the user signs out after a security change. Secret and
proof responses are not cacheable, and the mobile screen holds setup secrets in
component state. Identity guards stop old actions and HTTP retries from affecting a
newly signed-in account.

Validation evidence:

- **127 tests passed in the full user-service suite**, then **23 passed** in the final
  two-factor/password rerun after adding unfinished-setup password binding. Together
  these cover **128 distinct backend cases**. The original 12 new tests passed before
  UI work; final two-factor coverage is 13 cases. The legacy wrong-algorithm fixture
  emits its existing non-failing HMAC key-length warning.
- **32 tests passed across seven focused mobile suites**, followed by **23 passing
  tests across three suites** after adding sensitive retry and late-challenge checks.
  A final **6/6 sign-in rerun** also covers device credential-storage failure after
  verification, which now offers a fresh password sign-in rather than a stuck form.
  Together these cover **37 distinct cases**. These include API token boundaries,
  enrollment acknowledgement, cancellation, uncertain response status checks, recovery,
  disable, duplicate submission and account changes. React query/icon `act` warnings
  remain non-failing fixture warnings; this is not a full mobile baseline run.
- **Final TypeScript passed** in the mobile QA copy. All 15 changed runtime/test/route
  files match the repository by hash. The first Prettier attempt hit a OneDrive write
  error for `api.ts`; its later formatting pass succeeded before the final checks.
- **Final PostgreSQL 16 verification passed**: upgrade from the previous head retains
  existing users without enrolling them, downgrade/re-upgrade preserves users, two
  overlapping recovery-code redemptions yield exactly one session, and disable racing
  refresh leaves no live successor. Tests explicitly observed the overlapping database
  lock waits. The first integration run used a schema created before the final pending
  setup field was added and failed with `UndefinedColumn`; the final run rebuilt the
  disposable database from the final migration and passed.
- **Live loopback gateway + user-service + PostgreSQL journey passed** for private
  settings, enrollment, password challenge, recovery proof, persisted profile/status,
  prior refresh revocation, disable and subsequent password login. Only synthetic QA
  accounts and an ephemeral local encryption key were used. The temporary processes
  and labeled PostgreSQL container were stopped/removed after completion.
- Dependency lock updated with PyOTP 2.10.0 and cryptography 50.0.1. `uv lock` initially
  hit the unreadable OneDrive `.venv`; pointing `UV_PROJECT_ENVIRONMENT` at the existing
  external QA environment resolved it. Targeted `git diff --check` passed.

External evidence lives under `%LOCALAPPDATA%/MedApp/recovery-runtime`:
`two-factor-mobile-tests.json`, `two-factor-mobile-final.json`, `two-factor-signin-final.json`, and
`two-factor-postgres-gateway-report.json`. No standalone QA report/script was added
to the project. The API contract, `.env.example`, and Compose mapping document the
required `USER_MFA_ENCRYPTION_KEY`; no production key, migration or deployment was made.
Existing local services on 8800/8801 were not restarted by this work and therefore
do not serve this change yet.

The security reference HTML could not be read because OneDrive hydration timed out.
Native authenticator app handoff/manual entry, both themes, accessibility and reference
acceptance remain unverified. Browser acceptance remains pending after automatic
approval review previously rejected Expo startup as "blocked by policy" without a
specific reason; no retry or startup workaround was attempted this turn. Enrolled
biometric OS enforcement also remains open from the previous pass.

Next B01 work is scoped care-team consent, social sign-in and remaining home/account
actions, alongside the outstanding release/device checks. B03 specialist implementation
and the rest of B00–B12 remain in scope; the full completion goal remains active.

## B01 care-team sharing — 2026-09-13

Patient Security & Privacy now opens a dedicated care-team sharing route. Patients can
search the existing doctor/nurse directories, select a named clinician, and confirm
read-only EHR access or explicitly allow new vital entries for 7, 30 or 90 days.
Read-only and 30 days are the defaults. They can review active permissions or history,
page through results, and confirm revocation. Signup stays off and grants no access.

The adapter uses identity `user_id`, not the directory profile ID or the EHR patient-row
ID. The backend resolves an active doctor/nurse through the internal user-service lookup
using the patient's bearer token; missing, inactive, non-clinical or unverifiable
recipients cannot receive a new grant. List/manage operations remain patient/admin-only.
Clinicians see only their own grants in clinical bundle/summary responses.

Previously, vital creation checked the clinician role but did not require patient consent.
It now requires `records_and_vitals`. `records` permits reads only. Both scopes check
revocation and expiry. Patient-row locks serialize grants, revocations and clinical
authorization; a request already authorized can finish, while later requests are denied.
The existing administrator override remains and vital writes now record that audit mode.
Vital events publish after commit. This change covers EHR summary/vitals only; files,
labs, prescriptions, messages, research, HMS/PMS and the specialist roster remain separate
work in the completion guide. Revocation cannot erase information previously received.

Migration `20260913_0003` adds expiry and clinician/reason snapshots and replaces the
historical unique constraint with an index over unrevoked grants. Revoked and expired
history survives renewal. Existing indefinite `records` grants retain their scope and
gain no write access. A downgrade refuses finite grants or duplicate historical tuples
because the old schema cannot preserve those properties. The API contract and Compose
mapping document `EHR_USER_SERVICE_URL`; the service now declares its HTTP client dependency.

Validation completed:

- **Full EHR suite: 28 passed**, including clinician-identity failures, private controls,
  scope/expiry enforcement, duplicate grants, retained history, paging/filtering and audit
  behavior. The initial attempt stalled in pytest's OneDrive cache read, confirmed with
  a process stack inspection; only that task-owned test process was stopped. Moving
  `cache_dir` into the external QA runtime resolved it. A SQLite timezone serialization
  assertion was corrected to compare the stored UTC instant. Final warnings were existing
  Starlette/httpx deprecations.
- **20 distinct mobile tests passed** across the final 10-case sharing-screen run and
  the four adapter, two security-entry and four signup cases. These cover confirmation,
  default/explicit permissions, durations, cancellation, revocation, history/paging,
  directory retry/nurse selection, double submission, lost responses, unsupported legacy
  scopes and late account changes. The first screen run reset Expo's font mocks; preserving
  the preset's mocks resolved the asset-registry failures. React `act` warnings remain
  non-failing. No rendered/native validation is inferred from these component tests.
- **Final TypeScript passed**. All eight changed mobile runtime/route/test files match
  their external QA copies by SHA-256. Targeted `git diff --check` and Compose configuration
  validation passed.
- **Disposable PostgreSQL 16 and live loopback user-service/EHR/gateway checks passed**:
  legacy consent/vital retention, safe legacy downgrade/re-upgrade, real identity lookup,
  read-only/write distinction, simultaneous regrants yielding exactly one 201 and one 409,
  a queued revocation denying the later vital write, nurse expiry/renewal, preserved history,
  rejection of inactive clinicians, and refused unsafe downgrade with data intact.
  These used synthetic accounts, independent QA databases and test-only credentials.
  The temporary services on 8820–8822 and the labeled PostgreSQL container were stopped
  and removed. Existing services on 8800/8801 were not restarted.

Evidence remains outside the repository under `%LOCALAPPDATA%/MedApp/recovery-runtime`:
`care-team-mobile-tests.json` (initial run plus passing adapter/settings/signup suites),
`care-team-screen-final.json`, and `care-team-postgres-gateway-report.json`. The PostgreSQL
helper initially lacked the declared psycopg driver; installing it in the QA environment
resolved that setup issue. No production migration or deployment was performed.

The inventory now reconciles 57 route entries, 3 layouts and 12 application-only routes;
all 108 reference IDs remain, including all 32 specialist entries as `not_implemented`
and unaccepted. P-004 and P-075 carry the new evidence but remain unaccepted. Exact reference,
theme, keyboard, screen-reader and device checks remain pending. Browser acceptance is
still unavailable because automatic approval review previously rejected Expo startup as
"blocked by policy" without a specific reason; no startup retry or workaround was attempted.

Next B01 work is social sign-in and remaining patient home/account actions. Cross-service
clinical consent and the specialist experience remain in their assigned batches. The full
project completion goal remains active.

## B01 Home and B07 patient vitals groundwork — 2026-09-13

The preceding care-team goal turn made progress. This turn continued from current source:
Home's appointments and wellness queries hid loading/errors/empty results alike, and its
Labs/Vitals/Records tiles remained inert. The source also confirms that Google/Apple signup
buttons have no handlers and the user service has no social-auth implementation; those remain
the next authentication work, not a completed integration.

Home now has distinct loading, retry and empty states for each source, with independent
service retries and focus/resume/pull refresh. It offers booking from an empty schedule,
explains missing wellness readings without inventing numbers, and uses user/session-scoped
query keys plus cancellation/retry guards. The clinician hydration request carries the same
guard. The mounted clock removes ended appointments and rolls wellness onto the new local day;
multiple contributing devices are identified as potentially overlapping. The established
shell, cards, typography tokens and clinical-copy limits are retained. Superseded historical
comments were removed from the Home implementation, and its README now describes actual behavior.

Labs links to the existing lab-results route. Vitals opens a new patient-owned timeline and
Records opens a navigation hub for vitals, health overview, labs and care-team sharing. The hub
does not imply completed uploads, downloadable documents or specialist workflows. Pharmacy
discovery stays pending and its tile remains non-interactive. Full medical history, documents,
reports and clinical workflows remain in B07/B05–B08.

The patient vitals timeline displays actual dates, unchanged values/units and recorded notes,
with 7/30/90-day or all-time filtering and a human-readable measurement search. It virtualizes
rows, requests pages of 25, preserves loaded readings if a later page fails, and resets its
filters/data when the account changes. It adds no clinical classifications or reference ranges.
Existing EHR GET vitals accepts bounded `limit`/`cursor`/`kind` queries while retaining its
unpaged ascending contract for existing consumers. Each page rechecks patient/consent access,
audits the read and uses no-store. Cursor ordering includes UUID for equal timestamps.
Migration `20260913_0004` adds the patient/time/ID index and rolls back without deleting data.

Validation completed:

- **Full EHR suite: 38 passed**, including 10 new paging/filter/authorization cases. It verifies
  equal-timestamp boundaries, newly inserted rows, date/type filters, wildcard escaping, compound
  values, malformed inputs, ownership and consent revocation. Existing consent/event checks pass.
  The pytest cache remained outside OneDrive. Only existing Starlette/httpx deprecations warned.
- **79 distinct mobile cases pass across the latest relevant runs** in six suites: Home behavior
  and token checks, timeline/record-hub behavior, timeline adapter, appointment management and
  facility/clinician adapter. Final screen reruns cover loading/empty/retry, navigation, actual
  values, paging failure recovery, account changes and query refresh. TypeScript passes.
- The first mobile run exposed missing required `SkeletonCard.shape` props; these were fixed,
  and loading regions now have accessible progress labels. An adapter assertion was updated
  for its new optional request-options argument. The timeline account-switch test initially
  removed the SafeAreaProvider during rerender; preserving the provider fixed that fixture.
  Initial failed renders left the runner alive after its report completed; its task-owned
  process was stopped. Subsequent runs with `--detectOpenHandles` exited normally. React `act`
  warnings are non-failing; no device acceptance is inferred from the renderer.
- **PostgreSQL 16 plus live gateway/EHR: six scenarios passed** for index migration and
  downgrade/re-upgrade with readings retained, equal-time paging during insertion, human-readable
  date/type filters and original values, legacy ascending results, real bearer ownership and
  clinician consent/revocation. This used synthetic fixtures and test-only signed tokens;
  it does not claim a fresh end-to-end social login or a live wearable provider integration.
- Targeted `git diff --check` passed. All changed mobile runtime/route/test sources were checked
  against their external QA copies. No production migration/deployment was made. Temporary
  services on 8830/8832 and the labeled PostgreSQL container were stopped/removed; the existing
  8800/8801 processes were not restarted.

External evidence under `%LOCALAPPDATA%/MedApp/recovery-runtime`:
`home-vitals-mobile-tests.json`, `home-vitals-mobile-final.json`,
`home-vitals-screens-final.json`, `vital-timeline-screen-final.json`, and
`home-vitals-postgres-report.json`. The latest result for each distinct case is passing;
earlier failed attempts remain recorded rather than being presented as a clean initial run.

Inventory validation preserves all 108 references, 76 patient and 32 specialist, and reconciles
59 route entries, 3 layouts and 12 application-only routes. P-033/P-038 now link their new routes;
Home variants record shared-code behavior evidence without claiming full visual coverage.
Every specialist entry remains `not_implemented` and every reference remains unaccepted.

Reads of the new-user Home and vitals-timeline reference HTML ended with OneDrive `Invalid
argument` errors. Exact reference comparison, themes, keyboard/large-text/screen-reader and
native-device validation remain pending. Automatic approval review previously rejected Expo
startup as "blocked by policy" without a specific reason; no startup retry or workaround was
attempted. The blocked render path does not prevent the other implementation batches.

Next is Google/Apple authentication, followed by the remaining discovery/account work and
the specialist batches in the completion guide. The full project goal remains active.

## B01 provider sign-in preparation — 2026-09-13

The owner confirmed that Google OAuth and Sign in with Apple are not configured and
requested a setup guide. Added [PROVIDER_SIGN_IN_SETUP.md](PROVIDER_SIGN_IN_SETUP.md),
mobile/backend example settings and Compose mappings. Providers default to unavailable.

Implemented server-verified native provider proofs with explicit audience/issuer/nonce,
single-use install-bound challenges, stable provider subjects and database uniqueness.
New users still verify email and complete the existing password/terms/personal-details
wizard. Existing accounts require password and any enrolled second factor before
linking. Returning users keep MedApp two-factor protection. Connected accounts can be
listed and disconnected with proof; disconnect revokes refresh sessions and pending
MFA challenges while existing access tokens retain their normal expiry. No identity
token is persisted. Linking does not change an existing role or email-verification flag.

Added the provider sign-in and connected-accounts routes, unavailable/cancel/retry and
late-account-response behavior, signup ticket handoff and a failed-signup restart action.
Installed Google Nitro 2.2.0 / Nitro Modules 0.37.1, Expo Apple Authentication 55.0.17
and Expo Dev Client 55.0.40. Configuration uses the actual dev/preview/prod package and
bundle IDs and derives the Google iOS URL scheme; both app and server enablement are
needed. Google supports native Android/iOS, Apple native iOS; web/Expo Go retain email
fallback. Apple Android/web and Google web remain separate integration work if selected.

Validation and corrections:

- The first provider backend run passed 14/15; one nonce test helper passed the same
  argument twice. Corrected that helper. The full user-service suite then passed 143
  cases; the final provider run passed 16 cases after adding legacy-account coverage:
  **144 distinct backend cases**, not a claimed 144-case full-suite run. The full suite
  retained one existing synthetic JWT key-length warning. Tests used an external pytest
  cache and the repository shared library; an initial shell path typo was corrected.
- Initial TypeScript found a required Google button size and stale generated route
  types (Metro has not regenerated them). Added the native size and used the existing
  Href convention for verified route files. Final TypeScript passes. A formatter first
  ran slowly against OneDrive and a later helper initially resolved a plugin from the
  wrong cwd; the external-runtime formatter then succeeded.
- Initial mobile run: 28 passing cases, three native-adapter failures and one provider
  screen suite that did not compile. Corrected the Jest mock, made native package loads
  lazy behind platform/build checks, supplied the screen test's client boundary and
  wrapped disconnect state updates in act. The final relevant reports contain
  **45 distinct passing cases across 10 suites**. Existing asynchronous
  icon-font act warnings remain; they are not device or rendered acceptance.
- Temporary PostgreSQL 16 verified migration preservation, overlapping proof redemption
  (one winner), competing account/provider links (one winner), unlink/login races leaving
  no live refresh session, refusal to downgrade connected identities, and empty-table
  downgrade/reupgrade preservation. All six scenarios passed.
- Three live gateway checks passed for availability/routing, bearer-protected connection
  listing and invalid provider-proof rejection. The first helper failed reading the
  OneDrive gateway .env; the second found a stale shared package under the external cwd.
  The final helper used an isolated cwd, repository app/shared paths and explicit GW_
  settings. It did not exchange real Google/Apple credentials. Owned services on
  8834/8835 stopped; the verified provider-auth QA container was removed. Existing
  8800/8801 services were not restarted.
- Read-only app-config checks passed for disabled defaults, all three environment
  identifiers, Apple flags and Google's reversed iOS scheme. 21 changed source
  files and both npm manifests match the tested external mobile mirror by SHA-256.

QA scripts/reports remain outside the repository in the MedApp recovery runtime:
provider-mobile-tests.json, provider-mobile-final.json, provider-screen-final.json,
provider-postgres-report.json, provider-gateway-report.json and
provider-mobile-config-report.json. No QA-only server or report was added to product source.

Scope stays **108 references: 76 patient + 32 specialist**, **61 mobile routes and three
layouts**, with 14 application-only routes. All specialist references remain
not_implemented and all reference acceptance stays pending. No provider credentials,
native binaries, real provider delivery/consent, themes or device behavior are certified.
Automatic approval review's earlier Expo-startup rejection (“blocked by policy”, no
specific reason) was not retried or bypassed. Remaining B01 work stays tracked; B02
patient discovery/booking is next, followed by B03 specialist entry and onboarding.


## B02 real availability and atomic rescheduling — 2026-09-13

The picker no longer offers sample appointments. It reads `/v1/bookings/slots`, shows loading/empty/error/retry states, uses a 31-day date strip and passes the selected start/end instants unchanged. Display clocks include offsets so repeated daylight-saving clocks are distinct; a selected slot retains its own IANA timezone even when a calendar contains several zones. Missing, expired or removed selections cannot advance. Review requires authoritative instants, prevents duplicate submissions and ignores a late response after an account/session change. Appointment reads and cancellations now carry session guards and discard private query/mutation data when unused. Rescheduling carries the existing modality and reason into the picker.

Doctor availability now returns explicit UTC instants, validates IANA timezone names and local rule clocks, bounds date ranges and slot duration, handles daylight-saving gaps/repeated clocks and deduplicates overlapping offerings. Timezone data is a direct locked dependency in both doctor and booking services. The booking calendar subtracts booked windows without exposing patient data. Confirmation rechecks the exact offered pair and clinician user identity; unavailable upstream data fails without creating an unlinked appointment. Historical NULL links still deny practitioner access.

`POST /v1/bookings/{id}/reschedule` locks the original appointment, authorizes its owner/admin, cancels it and creates its replacement in one database transaction. Any failed check rolls back the cancellation. Identical retries return the same replacement; conflicting later requests return 409. Cancellation and rescheduling lock the same original row and retain the existing granted/denied booking-write access audits. The original patient is retained when an admin reschedules. Slot contention now returns HTTP 409. Migration `20260913_0005` adds a PostgreSQL GiST exclusion constraint and positive-window check, plus a unique replacement relation. Existing overlapping/invalid data stops migration instead of being silently altered; downgrade refuses to discard reschedule history.

The UI no longer promises a backend-enforced 24-hour free-cancellation policy or claims a timed-out request definitely booked nothing. It directs patients to check My Appointments. The API documentation records that payments and cross-service telemedicine room reconciliation are still separate unfinished work.

Validation:
- Final full booking-service suite: **58 passed**. The earlier 54-case run and focused 9-case replay check passed; final review then restored the existing access-audit path around row locks and added four tests proving granted/denied cancellation and reschedule audits, including denial persistence after rollback. The first full run had one old expectation for HTTP 400; it was corrected to the intentional 409 contract. Tenant access, failed-reschedule rollback, exact slot validation, retries and clinician schedule readback are covered using SQLite and stubbed upstream HTTP.
- Full doctor-service suite: **14 passed**, including spring-forward/fall-back, a half-hour timezone, missing rule boundaries and invalid timezone/step cases.
- Latest per-suite mobile evidence: **128 passed across 7 suites**. The final affected four-suite run passed **88/88** and exited normally. Earlier failures covered obsolete two-call/timestamp/policy expectations and six unrelated async `act` timeouts in confirmation tests. Confirmation tests now await the calendar/share outcome, and review test query clients are cleared after use. Existing icon-font and some asynchronous query `act` warnings remain.
- Final TypeScript check passed. All **13** changed mobile files match the external QA mirror by SHA-256. New migration/module Python syntax checks and scoped `git diff --check` pass. Lock updates add only the declared timezone-data dependency.
- **PostgreSQL migration/concurrency and live-gateway checks were not run.** Docker's engine was unavailable, desktop startup remained in WSL initialization, and a restart attempt failed to stop Docker processes. The external `check_booking_postgres.py` helper is prepared but is not evidence of a passing run. No B02 temporary PostgreSQL container, QA database or 8836–8838 service process was started.
- Rendered/theme/device acceptance remains pending. Earlier automatic approval review rejected Expo startup as `blocked by policy` without a detailed reason; it was not retried or circumvented.

At the end of that pass, the next B02 work was: directory facets still matched badge text; the All tab fans out only to doctors/nurses/hospitals; partial directory failures need visible treatment. Public practitioner profile loading/error states and content still come from route parameters. Complete those real requests/actions, persistently reload confirmation by booking ID, reconcile appointment-history/detail/summary behavior, then perform reference and native acceptance. The four booking references inspected are P-012, P-013, P-020 and P-021; their API/component evidence remains partial, not accepted. All **108** reference screens remain in scope, including all **32** specialist references still marked `not_implemented`.


## B02 directory, public profiles and saved appointment details — 2026-09-13

Find Care now loads all five directory categories. Pharmacy and pharmacist results
retain the server offset/total contract and offer additional pages; duplicate rows
caused by changing offset pages are deduplicated by category and ID. Partial
category failures remain visible beside successful results and can be retried,
including a failed next page. Category/search changes cancel old requests; account
changes receive a separate query scope. The pharmacy adapter now uses the actual
`pharmacy_id` field, fixing detail navigation from real list responses. Recorded
hours are labelled "Hours listed", with no unsupported current-open claim.

Home Service filters the nurse's typed home-visit fee, including a zero fee; badge
text is no longer data. Doctor, nurse and hospital specialty text filters call the
existing server contract. Unsupported presence/proximity filters remain open
requirements, not fabricated result states.

The patient-facing telehealth profile now loads doctors, nurses and pharmacists
by their respective IDs, including ID-only reopened links. It displays saved
biography, specialties and languages, with loading, missing-profile, retry and
pull-to-refresh states. Route-provided names/prices are ignored. Only active,
listed doctors can enter the doctor booking flow. Booking is suppressed while
refreshing, after errors and after account changes. Missing biographies/reviews
have explicit states; detailed review/social/credential reference features are
not claimed complete. The profile uses the canonical 16px screen gutter.

Review now forwards only `bookingId` to confirmation. Confirmation reloads the
booking and clinician separately; names, clocks and mode in a URL cannot override
the saved booking. Missing IDs, failed access, malformed windows and unavailable
records do not display confirmation. A clinician lookup outage leaves the saved
booking visible with a retry. Refresh and periodic status checks reflect
cancellation. Display times derive from stored instants in the device timezone,
with offsets for repeated/skipped daylight-saving hours and an explicit end date
when crossing midnight. Calendar/share actions retain the stored instants, and
pending calendar writes stop after an account or booking-screen change.

Upcoming and history cards open the saved detail screen. History now labels
elapsed scheduled bookings "Past" and keeps cancelled bookings "Cancelled"; it
does not infer clinical completion. The former dead View Summary action is now
View details. Clinical consultation summaries remain separate work.

Validation:
- Latest per-suite mobile evidence: **228 passed across 17 suites**. This combines the latest result for each suite, not repeated cases from multiple runs. Coverage includes all-category queries, pagination, partial failures, request cancellation/account changes, supported filters, loaded profiles and booking eligibility, saved confirmation, appointment-detail navigation, calendar/share guards and timezone boundaries.
- The first saved-confirmation run timed out on its cold render; its setup allowance was increased to 15 seconds and the suite subsequently passed all 13 cases. The timezone suite initially assumed UTC would always be spelled `GMT`; this runtime returns the equivalent `GMT+0`. The assertion now accepts either zero-offset spelling and all four timezone cases pass. Existing icon-font/asynchronous `act` warnings remain.
- TypeScript passes. All **24** changed mobile files match the external QA mirror by SHA-256. The external `discovery-booking-evidence.json` records the latest report per suite and source hashes. These are component/API tests with mocked network responses, not proof of native or live-service acceptance.

Docker was rechecked and still returned `Docker Desktop is unable to start`; no restart or repair was attempted.
No live PostgreSQL/gateway test or Expo/native startup was performed. The earlier
automatic approval review rejection of Expo startup (`blocked by policy`, without
a specific reason) remains in effect. All 108 references remain unaccepted,
including the 32 specialist references still awaiting implementation.

Next implementation: B03 specialist entry/navigation, onboarding status and direct
self-profile identity. Keep B02 public social/review reference reconciliation,
fee/currency semantics, PostgreSQL contention and native acceptance open alongside it.


## B03 professional identity and application status — 2026-09-14

The preceding goal turn made concrete progress by completing B02 component
verification and updating the register. This pass starts the specialist foundation.

Doctor and nurse services now expose authenticated `GET/PATCH /v1/{doctors|nurses}/me`.
The JWT subject resolves the unique self profile; no caller-supplied profile/account
ID selects the target. Static routes precede UUID routes. Read includes an inactive
owner profile, while edit rejects it. Unrelated roles are denied; even admin self
lookup returns only the admin's own record. Profile updates reject privileged/unknown
fields and null required fields, normalize names/languages and enforce bounds.
The mobile adapter preserves the server role as `accountRole` separately from
application status. The former doctor-directory scan is replaced by direct lookup.

The professional editor supports doctors and nurses, saved names, specialty,
biography, languages and Find Care listing, plus a draft preview and changed-field
PATCH. It prevents duplicate saves, reports validation/save errors, preserves drafts
on failure/background refresh, confirms the server result and guards unsaved exit.
Pending saves abort on unmount; account/role changes cannot publish late results.
Doctor consulting-hour readback and account/sign-out access are retained. The doctor
home route checks active self-profile access before mounting its content; its private
queries now carry account/session scope and its clock advances while mounted.
This is not a completed nurse dashboard or all-route capability review.

Patient Profile links to professional applications and access. Status reads the
current owner's actual application records, including empty, draft, submitted,
under-review, approved, rejected, unknown and error/retry states. It no longer
claims submission or a review deadline for an account without an application.
Rejection feedback is hidden on other states. Professional editor/workspace entry
is based on the server account role and independently checked self profile.

Inspection found that the documented web launcher `lib/partner/open-onboarding.ts`
is absent and the admin web app is a scaffold. Application review only updates the
application row; it does not grant a user role, create a professional profile or
provision a tenant. These implementation gaps are now documented accurately.

Validation:
- Full doctor-service suite: **33 passed**. Full nurse-service suite: **26 passed**.
  The 38 added cases cover self lookup, ID distinction, owner-only persistence,
  unrelated-role denial, inactive records and privileged/invalid field rejection.
  These run through FastAPI with SQLite and injected principals, not the live gateway.
- Latest per-suite mobile evidence: **61 passed across 7 suites**. The final three-suite run passed all 30 cases and exited normally. Earlier failures exposed incorrect shared Button/Skeleton component names; those were corrected. Three subsequent rerender failures came from removing the test safe-area wrapper; stable wrapper fixtures now preserve the mounted tree and verify clean-field refresh, draft preservation and account changes. Existing icon-font `act` warnings remain.
- Final TypeScript passes. The external `professional-test-evidence.json` identifies the latest passing report for each suite. Code and test files match the QA mirror by SHA-256; 19 code/test files and three feature-boundary READMEs are mirrored. Component/API mocks establish behavior under tested responses, not live provider or native acceptance.
- Existing Docker/native validation limitations remain. No database migration was
  required for these endpoints. No Docker restart, native build or Expo startup was
  attempted. Earlier automatic approval review rejected Expo startup as `blocked by
  policy` without a more detailed reason; it was not retried or circumvented.
- S-005 reference HTML was readable; its PNG read timed out through OneDrive. S-001
  reference HTML was unavailable from the cloud-sync provider. No rendered match or
  native/theme acceptance is claimed from source inspection or mocked tests.

S-001 and S-005 are now `in_progress`; neither is accepted. All 108 references remain
unaccepted, including the other 30 specialist references still `not_implemented`.
Continue B03 with the complete web application/credential flow and mobile handoff,
review-to-account/profile provisioning, role/session refresh and full professional
navigation. S-005 still needs license/verification data, photo management,
fee/currency controls, affiliations and clinic-hours editing. Those omissions remain
part of completion rather than being replaced by the basic editor implemented here.


## B03 partner application website — 2026-09-14

A separate Next.js application now lives at `frontend/partner_web`. It uses the
existing onboarding API and is separate from the internal SSO administrator app,
HMS and PMS portals. Applicant routes cannot invoke the reviewer endpoint.

Implemented surfaces: provider selection; password/authenticator sign-in; saved
application list; practitioner and business details; facility/team declarations;
credential upload/removal/download; final review/attestation; submitted and review
states; rejected-application correction; and recorded application history.
Draft updates carry their saved version. Uncertain writes require saved readback;
an uncertain create sends the user to their saved application list before creating
another application. Automatic create idempotency is still an open improvement.
If the saved application version changes while the submission confirmation is
open, submission is stopped until the applicant accepts the updated version.

Browser sessions use opaque HTTP-only, same-site cookies. Access/refresh tokens
stay in the server session store. Origin and account-scope checks precede writes;
even administrator accounts only receive their own applications on this site.
Session renewal is serialized, and a concurrent logout cannot recreate a session.
An invalid password or authenticator code remains on the sign-in form, while an
expired authenticated request clears scoped application data.

### Evidence and environment

- Final production build passed, including TypeScript, page generation and route
  optimization. The external QA log is `partner-web-build-final.log`. All authored
  files match the repository source; only the generated Next.js type entry is
  excluded from that comparison. Dependencies are installed in the external QA
  runtime to avoid the workspace cloud-sync delays.
- Website automated evidence: 41 distinct passing cases across seven files, from
  the complete 39-case suite and the final two-case attestation run. Coverage includes session
  renewal/logout races, owner/scope/origin boundaries, bounded request bodies,
  version forwarding, draft validation/merge, uncertain writes, duplicate clicks,
  account-scope cancellation, authenticator transitions, invalid sign-in errors,
  a version change during submission confirmation, and submission of the explicitly
  accepted version. Initial fork workers timed out on this Windows host; the suite
  passed with one thread worker. A later targeted run also timed out before worker
  startup while the production build was running; after that build finished, both
  targeted cases passed with no errors. JSON evidence is in the external QA runtime
  at `partner-web-tests.json` and `partner-attestation-tests.json`. This records two
  successful test runs, not a new combined 41-case run.
- CUA in-app browser at `http://127.0.0.1:3003`: practitioner selection → sign-in →
  details → save/exit → resume → credentials → explicit attestation → submitted.
  Reviewer feedback was applied through the real onboarding API, then the browser
  reopened and corrected the application. A stale write was rejected; reload and
  merge kept the local license correction and the concurrently saved city.
- Required-document checks rejected an empty file and disabled review until both
  required documents existed. Removal disabled review again; replacement restored
  it. Saved history showed submission, review feedback, reopening and document
  changes. An HTTP read through the actual web proxy returned the exact uploaded
  bytes with `private, no-store`; evidence is in `partner-http-evidence.json`.
  The browser download click reached HTTP 200, but the browser tool did not report
  a download event, so OS download completion is not claimed.
- Two browser tabs: sign-out removed the old application content from both; the
  second applicant completed authenticator verification and saw only their own
  empty application list. An invalid authenticator code stayed visible and was
  recoverable. The facility/team branch saved business details and a team member,
  then loaded hospital-license and registration-certificate requirements.
- Desktop and mobile checks: 1440×900/1050 and 390×844, light and dark themes.
  No horizontal overflow at the mobile breakpoint; no application console errors
  or framework error overlay in the completed browser flows. Initial compilation
  and a configuration restart caused transient browser navigation timeouts; a
  fresh tab loaded the running service afterward. Full-page screenshot stitching
  duplicated content in the tool output, so viewport captures are the visual proof.
- This environment used the real Next.js web server and onboarding FastAPI handlers
  with SQLite and explicit local authentication, Redis and private-file test doubles.
  It does not validate real credentials, Redis operations under production load,
  GCS access, PostgreSQL locking or a deployed gateway. No production/demo bypass
  or fake account was added to application source.
- Previous onboarding lifecycle evidence remains separate: 75 onboarding tests and
  12 gateway tests passed, with an offline PostgreSQL migration SQL check. Those
  runs do not establish live PostgreSQL migration/locking or GCS deployment readiness.

### Reference comparison and remaining acceptance

The credentials concept and rendered screenshots were viewed side by side. The
comparison covered the white medical-brand header, mint/teal palette, heading and
body typography, horizontal stepper, main form plus summary column, dashed upload
areas, and persistent action footer. The final column proportions and upload-area
spacing were adjusted after inspection. Mobile stacks the summary below the form.
Required badges use a quiet teal treatment; supporting-document controls and
facility/team labels reflect the real application requirements. Body copy follows
the concept, with real account names, document types, status and dates replacing
sample values. These checks are partial fidelity evidence, not screen acceptance.

S-001 through S-005 are in progress; the other 27 specialist references remain
not implemented. All 108 references (76 patient, 32 specialist) remain in scope
and unaccepted. Next B03 work includes:

- Native acceptance of the mobile-to-website handoff implemented below.
- Internal reviewer UI and reliable, idempotent account/profile/tenant provisioning
  after approval; an approved application alone does not activate a professional.
- Pharmacy NPI/administrator/address/services fields and practitioner NPI registry
  verification from the reference set, reconciled with supported jurisdictions.
- Complete professional navigation and remaining profile/photo/fee/affiliation/
  availability controls, plus reference, keyboard/back and device acceptance.
- Live infrastructure validation, deployment integration, session expiry/outage
  behavior, and real provider configuration. Google/Apple setup instructions remain
  in `PROVIDER_SIGN_IN_SETUP.md`; provider accounts are not yet configured.

## B03 authenticated mobile-to-website handoff — 2026-09-14

The mobile application-status screen now starts new applications and continues or
corrects saved applications on the partner website. The gateway/user service issues
a two-minute, single-use proof bound to the current account and live device/session
family. Only its hash is stored. The fragment-only URL carries no mobile access or
refresh token. The website removes the fragment from history, displays the verified
account, and exchanges the proof through a dedicated server credential after explicit
confirmation. It refuses to overwrite a different browser account.

The resulting website session is separate from the mobile session. The return page
closes it before navigating to an explicitly allowed return URI with a random state.
Native uses Expo SDK 55's browser auth session; web uses same-tab navigation and a
non-secret sessionStorage return marker. Source logout, password change, MFA
enrollment, deactivation, cancellation, expiry and replay invalidate pending proofs.
Normal source refresh rotation remains compatible. Account/status callbacks never
activate professionals. `/me` is read again on return; a validated return forces the
shared refresh process to renew the JWT. Foreground refresh also renews it when the
live account role changes.

Native now persists a non-secret account/state marker for up to 12 hours, retaining
it across screen unmount or process termination. A matching cold return consumes it
once and requests JWT renewal even if startup hydration already loaded the new role
with the previous access token. Wrong-account, mismatched, malformed and expired
returns are rejected. Manual status refresh reloads the account from the server and
renews the session, providing recovery if matching or renewal fails. Return parameters
are cleared after successful renewal; account changes suppress stale focus results.

### Validation

- 38 backend cases pass across handoff, active sessions, authenticator and migration
  tests (`handoff-backend-final.xml`). This includes MFA enrollment invalidating an
  earlier proof and a subsequent factor-verified login successfully opening onboarding.
- 45 mobile cases pass across launcher, application-status and shared refresh tests
  (`handoff-mobile-final.json`). The final TypeScript check exits successfully
  (`handoff-mobile-typescript-final.log`, empty on success).
  These include cold-return renewal with an already-current profile role, one-time
  marker consumption, persistence across unmount, expiry/account/state rejection,
  account changes during validation and manual refresh recovery. Native browser and
  storage APIs are mocked in these cases; real device acceptance remains open.
- All 52 website cases pass across nine files (`handoff-web-final.json`), including
  account/origin/scope boundaries, no browser token exposure, fixed return URLs,
  explicit confirmation, duplicate clicks and a late response after unmount.
- The final Next.js production build, TypeScript, page generation and route
  optimization pass (`handoff-web-build-final.log`). Authored website files match
  the repository source; generated Next.js type entries are excluded from comparison.
- Migration `20260914_0008` upgrades/downgrades/re-upgrades in SQLite while preserving
  existing account and refresh-token rows. PostgreSQL DDL generation passes for
  `20260913_0007:head` (`handoff-migration.sql`). No live PostgreSQL concurrency or
  deployment claim follows from these checks.
- CUA in-app browser: real Next.js → real local API gateway → real user-service
  handlers. Synthetic accounts use SQLite and an explicit Redis test double. A fresh
  link shows the correct account, confirmation enters provider selection, the return
  link becomes available, and closing the session reaches the configured HTTP return
  receiver with the original state. Reopening the site shows the sign-in form.
  Database readback confirms proof consumption before expiry, website-session
  revocation, preserved mobile sessions and unchanged `user` role. Evidence is in
  `handoff-browser-evidence.json`; no warning/error console entries were observed.
- Return-screen layout at 390×844 has no horizontal overflow in light/dark themes.
  Captures: `handoff-return-mobile-light.jpg` and `handoff-return-mobile-dark.jpg` in
  the external QA runtime. Header links, readable card copy, action contrast and
  spacing follow the existing website design. A fragment-only link in an already
  open handoff tab initially retained stale state; the correction reloads its proof
  and passed the browser check.

Earlier failures were resolved: SQLite's Python-side timestamp evaluation during
conditional consumption; a mobile test mock that recreated the session guard every
render; and an incorrect Expo enum in a test fixture. The recorded final checks above
run the corrected source. The local QA servers were confirmed stopped after the
interrupted turn; no deployment was performed.

### Remaining B03 work

Apply the migration and configure matching origins, server-only handoff secrets and
return allowlists in the target environment before enabling the launch flow there.
The contract and variable names are in `api/user_service.md` and `.env.example` files.
Native deep links, browser cancellation, cold return and device behavior still need
real-device verification. Expo startup remains blocked by the earlier automatic
approval review (`blocked by policy`, without a more specific reason); it was not
retried or bypassed. PostgreSQL locking, production Redis and gateway capacity also
need deployment-level evidence. The browser's HTTP return receiver does not prove
the native return behavior or the full deployed mobile-web round trip.

Next implementation: internal reviewer screens and reliable, idempotent approval
provisioning for professional accounts/profiles/tenants. Regional/NPI reference fields,
complete professional navigation and remaining profile controls remain in scope.
All 108 references (76 patient, 32 specialist) remain tracked and unaccepted; S-001
through S-005 remain in progress.

## B03 approved clinician activation — 2026-09-14

Doctor/nurse approval now records durable activation work in the same transaction
as the review decision. A configured worker provisions or links the matching
professional profile, then grants the account role. Application status remains
approved during a transient activation failure; bounded retries do not discard
the review or create duplicate profiles. Each receiver stores an application-bound
command receipt, so a lost response can be retried with the same request. Existing
profile edits and listing preferences are preserved; new profiles start unlisted.

The user-service role update, activation receipt and audit entry commit together.
Account locking is shared with session renewal. Inactive accounts/profiles, conflicting
roles, changed commands and replay after a later role revocation do not restore access.
Only configured server credentials reach the internal receivers; commands can grant
doctor or nurse access and cannot select administrator privileges. These endpoints
are outside the public gateway routes. Existing patient JWTs retain their old role;
session renewal issues the newly activated permissions.

Owners/admins can read saved activation state at the application activation endpoint.
An administrator can retry a delayed job using the current application version;
an applicant cannot retry their own privileged activation. Hospital/pharmacy jobs
remain explicitly `setup_required` until their workspace adapters are implemented.
Legacy approvals are not automatically backfilled. `active` records that provisioning
completed; live account/profile checks still determine current authorization.

### Evidence

- Complete service suites pass: onboarding 88, doctor 39, nurse 32 and user 170
  (`activation-{service}-final.xml` in the external QA runtime). The final user audit
  change also passes all seven activation tests (`activation-user-audit-final.xml`).
- Four migration tests pass (`activation-migrations-final.xml`): upgrade, empty
  downgrade and re-upgrade preserve pre-existing data; populated activation tables
  refuse evidence-destroying downgrade. PostgreSQL SQL generation succeeds for all
  four migrations (`activation-{service}-postgres.sql`). No live PostgreSQL locking
  claim follows from SQLite tests or generated SQL.
- Two loopback HTTP journeys pass (`activation-http-final.xml`) against separately
  running real user/onboarding/doctor/nurse handlers and the actual activation worker.
  Each uses a disposable SQLite database and an explicit document-storage double.
  Public signup creates patient accounts; only the disposable reviewer account is
  promoted during test setup, followed by a real sign-in. Managed credential upload,
  attested submission, applicant review denial, administrator approval, background
  activation, old-token denial, session renewal and self-profile edit all pass for
  both clinician roles. Receipt/profile counts remain one, and completed-job retry
  preserves the saved edit. Test servers are terminated and waited on by the fixture.
- The initial nurse test fixture mismatch and HTTP test issuer mismatch were fixed.
  The HTTP fixture now uses the existing `medapp` issuer, matching the platform's
  issued access tokens; production token behavior was not changed for the test.

### Remaining B03 work

Apply the four migrations and configure separate receiver secrets before enabling
`ONBOARDING_ACTIVATION_ENABLED` in a target environment. Variable names, internal
ports, role boundaries and retry behavior are recorded in `api/user_service.md` and
the existing environment examples. The default remains disabled pending deployment
configuration. Live PostgreSQL concurrency/restart behavior still needs verification.

Next implementation: internal reviewer screens with credential verification and
version-aware decisions; applicant activation-progress UI; hospital/pharmacy
profile/tenant/deployment adapters and administrator reconciliation for legacy
approvals. Complete professional navigation, remaining identity/profile fields,
regional/NPI requirements, provider credentials and native/reference acceptance
remain open. This backend milestone does not accept any reference screen or finish
B03. The scope remains 108 references: 76 patient and 32 specialist.

## B03 applicant activation display and admin SSO backend — 2026-09-14

The approved-application page now reads the owner's activation status through
the existing partner BFF. It distinguishes not-started, pending, retry,
administrator-attention, organization-setup and completed states. Pending/retry
states refresh every ten seconds while the page is visible; completed states stop
polling. A failed read keeps approval separate from activation and offers a manual
refresh. The existing authenticated return-to-MedApp link remains available.
History gives readable labels to activation completion, delay and retry events.

The BFF checks application ownership before forwarding an activation read and does
not expose privileged retry/review endpoints. Response validation rejects unknown
states, invalid identifiers/dates and incomplete completion records. Account scope
and cancellation prevent a late status result from appearing for another account.

The user service now implements a dedicated admin Google Workspace flow, preserving
the internal console's existing SSO requirement. It uses an independent audience,
signed hosted-domain/verified-email checks, an existing Google subject link, and a
live active administrator role. It neither provisions administrators nor connects
accounts by email. Nonces, one-use device-bound proofs, enrolled MFA and a success
audit are included. Configuration defaults to unavailable. The existing provider
setup guide and user API contract document the settings and remaining integration.

Verification:

- All 72 partner tests in 11 files pass in `activation-web-tests.json`, including
  delayed/completed status, retry after failure, account changes, response parsing
  and BFF owner/retry boundaries. The production build, including TypeScript, exits
  successfully in `activation-web-build.log`. Both artifacts are in the external
  `%LOCALAPPDATA%/MedApp/recovery-runtime` directory.
- The full user suite passes 192 cases in `admin-sso-user-final.xml`. The final
  targeted admin rerun passes 25 cases in `admin-sso-final.xml`, including three
  additional strict-boolean, independent-audience and password-MFA isolation cases
  (195 distinct user-service cases across the two runs). Ruff passes the new code. Backend
  tests use real handlers, SQLite and synthetic signed Google credentials, not
  Google Workspace consent or a browser SSO session.
- Automatic approval review rejected the local Next.js preview startup with
  `blocked by policy`, without a more specific reason. The attempt was not retried
  through another command or runtime. Its companion disposable API fixture was
  stopped. No new browser screenshots, viewport/theme acceptance, or rendered
  interaction evidence is claimed for this activation display.

The reviewer queue and credential-decision concepts are prepared in the current
task's generated-image folder: `exec-cc875a32-2c71-4191-8d84-c0ff3d7529cc.png`
and `exec-64442aeb-ddd5-4d22-9af8-7f043d216aa2.png`. They use MedApp's mint
background, teal controls, white bordered panels, Inter body and Manrope headings;
the queue stays a table, with a two-column review detail on desktop. They are design
references only. The admin browser session/BFF, queue, credential verification,
version-aware review and activation-retry controls remain to be implemented.

Hospital/pharmacy workspace activation, legacy approvals, professional navigation,
remaining profile fields and native/reference/infrastructure acceptance stay open.
All 108 references remain unaccepted; S-001 through S-005 remain in progress.

## B03 internal reviewer console — 2026-09-14

`frontend/admin_web` now implements the professional-review flow instead of the
initial scaffold. It includes Workspace sign-in, enrolled MFA, the filtered
application queue, complete saved application details/team information, managed
credential previews and explicit verification, start-review/approve/change-request
confirmations, saved history, activation status and privileged retry.

The console's BFF exposes only the review-related onboarding routes. All reads
check current administrator role, configured Workspace domain and Google connection;
writes additionally require the current account scope, origin, saved `If-Match`
version and independent reviewer. Changes or uncertain responses require a reload
before another review action. Confirmation snapshots cannot approve a newer version.
The UI cancels old account requests and closes its credential previews on unmount.

Google/MFA challenges and session tokens stay server-side in an admin Redis
namespace. The browser receives scoped opaque cookies; the backend device ID stays
unchanged through sign-in, MFA, refresh and logout. Sessions last eight hours.
Refresh and sign-in exchanges are serialized. Late authentication failures and
logout responses do not clear a newer session cookie. The admin README and provider
setup guide describe the environment and existing-account requirements. No real
credentials, role grants or production deployment were performed.

### Verified software evidence

- **50 tests in seven files pass**, recorded in
  `%LOCALAPPDATA%/MedApp/recovery-runtime/admin-console-final-tests.json`.
  Coverage includes queue filters; Google-to-MFA UI sequencing; stale provider
  callbacks; server-held proofs; origin and account-scope checks; device-bound
  refresh/logout; role removal and provider unlink; self-review denial; credential
  preview failure; explicit verification; version-aware confirmations; uncertain
  writes; cancelled old-account actions; and activation retry eligibility/version.
- The production build exits successfully, including TypeScript and all six route
  entries, in `admin-console-final-build.log` in the same external directory.
  The initial build exposed an incomplete typed test fixture; its required fields
  were supplied before the final checks. Source hashes confirm all 33 source/test
  files in the checked copy match the authored project.
- The console uses the same dependency versions as the installed partner website:
  Next 16.3.5, React 19.3.0 and its existing query, Redis, font and testing libraries.
  The admin lockfile was generated and its package versions matched that graph.
  An external dependency junction was unreadable. Automatic approval review then
  rejected the command to remove that link and run `npm ci`, with `blocked by policy`.
  Neither removal nor installation was retried. Checks used an isolated source
  directory under the already installed dependency workspace; no server was started.

### Visual reference and remaining validation

The queue concept `exec-cc875a32-2c71-4191-8d84-c0ff3d7529cc.png` was inspected
with `view_image`; the review concept is
`exec-64442aeb-ddd5-4d22-9af8-7f043d216aa2.png`, both in this task's existing
generated-image directory. The following is an implementation ledger, **not** a
rendered fidelity result:

| Comparison point | Concept and implementation intent | Evidence still needed |
| --- | --- | --- |
| Header | MedApp cross/wordmark, Admin label, current reviewer name and Sign out | Browser alignment, icon weight and wrapping |
| Queue layout | Centered 1,200px content, title/subtitle, four-control toolbar and table | Native-size screenshot and real row density |
| Typography | Manrope headings, Inter body, 40px maximum title, 23px section headings | Computed fonts, actual text wrapping and visual comparison |
| Palette | Mint `#f5faf8`, white panels, teal `#00685f`, thin borders | Rendered light-theme colors and dark-theme contrast |
| Review structure | Approximately 1.8:1 desktop columns, saved details/credentials left, decisions/setup right | Desktop proportions, scroll behavior and small-screen stack |
| Copy and states | Primary concept labels retained; actual names/data come from APIs | Above-fold rendered copy comparison |

Intentional additions support the real contract: organization/team fields, the
approval-requirements explanation, confirmation dialogs, history, recovery and
unavailable states, and responsive/dark styles. The queue sample names/counts are
not hardcoded. No claim of exact visual fidelity or agency sign-off is made.

The prior Next.js preview startup rejection remains in force and was not retried
through another runtime. Browser identity/console checks, screenshots, actual
document-viewer behavior, native-size concept comparison, mobile/dark accessibility,
Google Workspace consent and deployed Redis/gateway integration remain unverified.
Unit tests use JSDOM, synthetic identity callbacks and explicit service/storage
doubles; they do not substitute for those checks.

Next B03 work: hospital/pharmacy workspace activation and legacy-approval
reconciliation, then remaining professional navigation/profile fields and regional
requirements. This internal supporting workflow does not add a screen to the
reference count or accept any of the 108 references. S-001 through S-005 remain
in progress; all other specialist references retain their recorded baseline.

## B03 hospital workspace prerequisites — 2026-09-14

The hospital/pharmacy activation investigation found two prerequisites in HMS:
tenant-management endpoints trusted a global role without checking hospital
membership, and database creation did not target the same database name as its
configured migration URL. PMS remains a separate single-pharmacy deployment with
its own staff authentication, so a shared HMS provisioning adapter cannot also
activate pharmacy workspaces.

### Implemented

- Tenant management now validates a platform access token using HMS configuration
  and checks current hospital-admin membership for each requested hospital.
  Platform `admin`/`platform_admin` operators retain their management access.
  A global `hospital_admin` role or a JWT hospital hint alone grants no access.
  Tenant responses exclude database connection credentials.
- Configuration and membership writes lock the hospital registry before checking
  authorization. Cross-hospital changes and orphan role creation are rejected.
  Removing or demoting the last active hospital administrator is rejected, also
  when two removal requests arrive concurrently.
- New databases use the immutable hospital UUID, have the configured application
  role as owner, and carry a matching ownership comment. Setup creates and
  migrates the exact configured target, serializes competing IDs/slugs, and only
  publishes a ready registry record after migrations succeed. Duplicate delivery
  preserves existing edits. A retry after partial setup reuses only a matching
  owned database; unknown databases and disabled/unfinished records are not
  automatically adopted or reactivated.
- Migration execution uses the service interpreter and an absolute Alembic
  location with bounded execution. Credentials are passed through the child
  environment and driver/migration output is not relayed to API responses/logs.
  Existing registered database names and schemas are not changed by this work.
- Operational membership lookup now checks registry readiness as well as the
  active staff role. Tenant pools recheck registry state on new sessions, dispose
  obsolete connections, and cannot retain access to a disabled hospital.
- Existing update-response failures in appointments, patients, visits, drugs,
  departments and staff were fixed by loading generated timestamps before async
  response serialization. The management settings and role update responses were
  corrected in the same way.

### Validation and limits

- The full HMS suite passed **112 tests**, including seven real PostgreSQL cases;
  the subsequently added real-pool isolation/revocation test passed separately.
  This is **113 distinct passing cases**, including **eight PostgreSQL cases**.
  Reports: `hms-workspace-final.xml` and `hms-workspace-pools-final.xml` under
  `C:\Users\EmmanuelKabu\AppData\Local\MedApp\recovery-runtime`.
- PostgreSQL 16 validation covered actual management/tenant migrations, the
  configured application database owner, concurrent duplicate creation and slug
  collisions, recovery after a lost setup confirmation without losing data,
  refusal to adopt an unowned database, concurrent administrator removal, and
  separation/revocation through real connection pools. Disposable Docker
  containers used random loopback ports and no host volumes; teardown completed
  and no `medapp-hms-qa-*` container remained.
- The operational unit fixture previously attempted to look up membership in the
  deployment management database despite injecting a test tenant/principal. It
  now supplies the matching membership lookup inside that same unit-test boundary.
  Separate tests exercise real membership authorization. Two stale fixtures were
  corrected to the existing contract: initial appointment status is `booked`
  (matching the model and migration), and batch receipt requires `received_at`.
- Ruff passes for the new/updated tenant core and its four test files. The scoped
  diff whitespace check passes with Windows carriage returns recognized. No
  management-schema migration was needed.

This completes the HMS setup prerequisites, not hospital or pharmacy activation.
Approved hospital/pharmacy applications still report `setup_required`. Next B03
work is the approved-application-to-directory/workspace adapter, the initial owner
membership and production HMS session handoff, the separate pharmacy deployment
activation path, and legacy-approval reconciliation. No frontend/native rendering,
live provider sign-in or screen acceptance was performed in this backend pass.
All 108 reference screens retain their previous acceptance status. The current
service contract is documented in `docs/api/hms_service.md`.

## B03 hospital approval and workspace sessions — 2026-09-14

### Implemented

- Hospital approval freezes the reviewed organization details in the activation
  job. The worker confirms the applicant account is active, creates a private
  directory profile, and then provisions the matching HMS workspace. The hospital
  UUID is derived from the application UUID and both receivers verify it.
- Hospital ownership is scoped to the organization. The applicant keeps their
  existing MedApp role; HMS grants the initial owner an active `hospital_admin`
  membership. Team details on an application do not automatically grant access.
- Receivers authenticate separate server-only secrets and retain durable receipts.
  Concurrent deliveries create one profile/workspace/membership, preserve later
  edits and data, and do not restore revoked ownership. HMS confirms the actual
  workspace schema before committing the ready registry, owner and receipt.
- The directory migration preserves visibility of existing profiles and defaults
  new profiles to private. Public detail, review and roster access respects that
  visibility. Owners can manage only their own roster; a global hospital role
  cannot manage another hospital. Private administrative roster reads are audited.
- HMS now lists current workspaces and exchanges a MedApp session for a session
  scoped to one hospital. Exchange confirms the live account through the identity
  service's `/me` endpoint. The session has a separate signing key/audience and
  lasts at most five minutes, bounded by the parent session expiry. Clinical
  operations recheck current membership, role and tenant readiness.
- The gateway accepts hospital sessions only under `/v1/hms`. Those sessions cannot
  authorize platform identity, administration, tenant management or another token
  exchange. Platform administrators need staff membership for clinical access.
- Compose and the environment example wire both hospital activation receivers and
  the separate HMS session key; secrets remain blank until configured. HMS identity
  verification now matches this Compose stack's shared development identity key.
  The production HTTP client dependency and HMS lockfile are updated.

### Validation

**504 distinct passing checks** across the affected services and integration suites:
92 onboarding, 33 hospital directory, 196 identity, 32 gateway, 141 HMS, four
hospital integration cases and six clinician/migration regression cases. Repeated
focused runs are deduplicated by service and test identity. HMS includes 133 unit
cases and eight disposable PostgreSQL cases.

The hospital integration suite runs real loopback identity, onboarding, directory,
HMS and gateway processes against migrated PostgreSQL 16 databases. It verifies
approval through clinical workspace use, unchanged platform role, private listing,
exclusion of unrelated administrators, live account checks, revoked membership on
existing sessions, concurrent receiver delivery, preserved workspace data, legacy
directory visibility and downgrade refusal when ownership/receipts exist.
Private credential storage remains an in-memory double.

The new integration test exposed and corrected HMS's use of the gateway `/v1/me`
path when calling the identity service directly. Test fixture corrections supplied
the required hospital onboarding mode, loaded the actual gateway service package,
and used the existing `department_id` response contract.

Reports under `C:\Users\EmmanuelKabu\AppData\Local\MedApp\recovery-runtime`:

- `onboarding-hospital-initial.xml`, `hospital-activation-final.xml`,
  `user_service-hospital-full.xml`, `api_gateway-hospital-full.xml`,
  `gateway-hms-final.xml`.
- `hms_service-hospital-full.xml`, `hms-activation-session-final.xml`,
  `hms-hospital-postgres.xml`.
- `hospital-http-postgres-final.xml`, `activation-regression-final.xml`.

Ruff passes for the activation/session core and tests. The scoped whitespace check
and Compose configuration validation pass. Test containers use random loopback
ports and no host volumes. Teardown completed: no test container or integration
server process remained. Existing deployment data was not used.

### Remaining acceptance

At the end of this backend milestone, the HMS browser still needed production sign-in/handoff, protected server session
storage, workspace selection and renewal. Its development login/local browser token
storage is not a completed production flow. Hospital profile editing/publication,
staff onboarding, the separate pharmacy deployment adapter and legacy-approval
reconciliation remain open. Account status is rechecked during exchange; an
already-issued token can remain usable until expiry after account-only revocation.
Membership revocation is checked on subsequent operations.

Production credentials/infrastructure, real private storage, live provider sign-in,
native journeys and rendered reference acceptance remain unverified. This backend
milestone accepts no additional reference screens and does not complete B03 or the
whole app. The next implementation work is the HMS browser session flow, followed
by the remaining organization adapters and specialist-facing screens.

## B03 hospital browser sign-in and workspace selection — 2026-09-14

### Implemented

- HMS web now signs in through the MedApp gateway using email/password and enrolled
  authenticator/recovery-code verification. Pending MFA challenges are private,
  device-bound Redis records, with a separate opaque browser attempt cookie.
- Platform and hospital tokens stay on the server. A Secure, HttpOnly, SameSite
  Strict production cookie contains only a random handle; the session expires
  after eight hours. Legacy browser token/user/configuration entries are removed.
- Users explicitly select from their live hospital memberships. Users without a
  membership get an explanation and refresh action. A platform administrator role
  does not automatically grant clinical access.
- Redis session leases and revision checks serialize rotation and exchange. New
  parent credentials are saved before later upstream work, and a delayed write
  cannot recreate a signed-out record. Failed sign-in cleanup attempts to revoke
  the newly created session before returning an error.
- Sign-out invalidates the server record and revokes the parent refresh token.
  Expiry/error/sign-out responses leave the inert cookie to expire or be replaced,
  preventing delayed responses from deleting a newer sign-in cookie. The UI does
  not report successful sign-out when a network failure prevents the request.
- Switching hospital or changing membership/role changes the public session scope.
  The browser replaces query caches and mounted forms; the server and API client
  reject late results from the previous scope. Queued cross-tab invalidation
  reloads authoritative session state after a pending action completes.
- A finite same-origin clinical proxy uses the server-selected HMS credentials,
  bounds request bodies and excludes tenant/authentication/internal APIs. Clinical
  mutations are not automatically retried. Direct page entry is also gated by the
  selected staff role; backend authorization remains authoritative.
- Next.js/React now match the other web portals (16.3.5/19.3.0). The dependency
  lockfile, TypeScript configuration, test runner, lint configuration, environment
  example and portal README are updated. The existing light portal no longer
  applies a dark-mode foreground to its light panels.

### Validation

**58 distinct passing checks:** 19 session-manager, 15 HTTP/proxy, seven sign-in/MFA,
10 component/browser-state, three API-client and four real Redis cases. Final reports
are `hms-web-session-final.xml` (54 passed, four opt-in cases skipped) and
`hms-web-redis-final.xml` (those four Redis cases passed) under
`C:\Users\EmmanuelKabu\AppData\Local\MedApp\recovery-runtime`.
The production build passes, including TypeScript and route generation. ESLint
passes with no errors and one warning in the existing invoice form about React
Hook Form's `watch` API; that operational form was not changed in this milestone.
The scoped whitespace check passes.

The first test run exposed missing JSX transformation in the test runner; the
component suite passes after configuring the automatic runtime. Build validation
also corrected unsupported test-query options and adopted Next.js's required
TypeScript settings. The final run includes regressions for failed MFA cleanup,
cross-tab invalidation, delayed cookie responses, failed sign-out and direct access
to a page outside the selected staff role.

Validation used a source copy under the local recovery runtime because OneDrive
could not hydrate generated/dependency files. An interrupted copy left a corrupt
generated declaration; the build regenerated it. Dependency installation completed
after network-reset retries. All 88 copied source/configuration/test files matched
the repository before the final documentation-only edits; both lockfiles have
SHA256 `07132fa3e6a6b3537b9848f7319146c3204cd64dc7d69a6cda2596ee917d9e30`.

The first opt-in Redis run failed during setup because Docker could not resolve
`registry-1.docker.io`. A later pull succeeded, and all four real Redis checks passed.
They exercise opaque hashed keys/eight-hour TTL, lock ownership and revision-aware
Lua commits, refusal to recreate a deleted session, and atomic rejection of stale
sign-out after a scope change. The disposable Redis 7 container used a random
loopback port and no host volume; teardown removed it. The failed setup report
`hms-web-redis.xml` is retained separately from the successful final report.

Rendered browser checks remain pending: automatic approval review previously
rejected local Next.js preview startup as **blocked by policy**. No preview was
started or alternate server used for this milestone. Component tests and build
success are not rendered/device or live-provider acceptance.

### Remaining work

MedApp-to-HMS handoff/provider entry and deployed gateway/browser acceptance,
hospital profile/publication, staff onboarding, the separate pharmacy deployment
adapter and legacy-approval reconciliation remain open. Google/Apple credentials
are still unavailable; the existing provider setup guide remains the reference.

The older operational repositories contain API mismatches for queue actions,
invoice items/payments, drug details/batches, staff schedules and tenant
configuration. Those flows must be reconciled and verified before operational
acceptance. Role-specific navigation, narrow layouts, accessibility and reference
fidelity also need rendered checks.

This milestone accepts no additional screens. The inventory remains 76 patient
references and 32 specialist references, with all 108 accepted flags unchanged.
B03 and the complete-app goal remain in progress.

## B03 hospital profile editing and publication — 2026-09-15

### Implemented behavior

HMS administrators can load the hospital created by approval, edit a saved draft,
review saved/public details, explicitly publish or withdraw, and page the recorded
change history. Directory edits include name, description, specialty, accepted
insurance, address, coordinates, website and contact details. The portal leaves
accreditation and approval information read-only. The public hospital name does
not rename the existing workspace label.

Drafts are stored separately from public fields. Publication requires a complete
address and a phone number or email; editing alone never publishes. Withdrawing
removes the hospital from patient reads while retaining the draft and history.
Patient insurance filtering now matches any accepted insurer exactly, ignoring
case, on SQLite and through the PostgreSQL JSON expansion query.

HMS derives the hospital, owner and actor from the selected live membership and
approval receipt. The receiver independently verifies active status and ownership.
Each changed operation compares the displayed version and records the actor and
changed before/after values atomically. Stale operations and conflicting public
names preserve previous state. The portal retains inputs after errors, requires
reload after uncertain writes and confirms discarding dirty inputs. Switching
hospital cancels old requests; withdrawal also preserves unsaved local inputs.

Hospital migration `20260915_0005` adds drafts, revisions, publication times and
history. It preserves legacy public details and refuses a downgrade that would
discard evidence. Both services need the new dedicated directory secret described
in the API contracts; no production secret was configured. Missing or ambiguous
approval receipts require reconciliation. Legacy admin-created profiles retain
their previous creation behavior and are not adopted into the new editor.

### Automated validation

The verified Windows runs contain **265 distinct passing checks**:

| Scope | Passing checks | Report in the local recovery runtime |
| --- | ---: | --- |
| Hospital service, full suite | 57 | `hospital-profile-directory-final.xml` |
| HMS service, full suite excluding opt-in PostgreSQL | 172 | `hospital-profile-hms-full.xml` |
| Portal boundary/client cases | 20 | `hospital-profile-web.xml` |
| Hospital profile components | 10 | `hospital-profile-ui.xml` |
| Directory migration preservation/downgrade | 6 | `hospital-profile-http-pg.xml` |

The 24 directory and 25 HMS profile cases also passed in their initial focused
runs. They are included in the full-suite counts, not added again. There are
67 new profile/boundary/component/migration cases within the total. The HMS full
run skips eight separate opt-in PostgreSQL tenant cases.

The first hospital full run passed 44 cases; 13 existing async activation cases
could not execute because the service lacked pytest's async mode configuration.
`pyproject.toml` now sets `asyncio_mode=auto`, and all 57 cases pass without a
command-line override. The first portal run passed 20 boundary cases but the JSDOM
worker timed out before its ten component cases ran. Loading JSDOM took 27,698 ms;
the subsequent component run passes all ten cases, including conflict recovery,
explicit confirmation, draft/public isolation, withdrawal, history and scope changes.

The production portal build passes with `/hospital-profile`. Standalone TypeScript,
targeted ESLint, scoped Ruff, Compose configuration and whitespace checks pass.
Thirty changed implementation/test/configuration files were compared byte-for-byte
against their local validation copies. The source `next-env.d.ts` placeholder was
not read or changed; the local build generates its own declaration.
The final draft-isolation refinement also preserves the public `updated_at` value;
its event records the draft save time. All 24 directory cases pass again in
`hospital-profile-draft-metadata.xml`, including comparison of the complete public
response after a draft save. These cases overlap the full suite above.

### Windows end-to-end limitations and Linux runner

`hospital-profile-http-pg.xml` contains six passing SQLite migration checks and
seven PostgreSQL journey setup errors. The four service migration chains completed,
but user, HMS and onboarding health checks did not become ready within the shared
startup window. Logs had no application exception explaining those missing health
responses. The fixture now starts dependencies sequentially, keeps a bounded
45-second startup window for each and detects early exits.

`hospital-profile-http-pg-sequential.xml` failed earlier: the HMS management
migration subprocess exited with Windows code `3221227274` (`0xC000070A`) and no
stderr. No HTTP journey assertion ran in either attempt. These failures are not
reported as application passes, and their cause is not attributed to OneDrive.

A dedicated Linux QA image and PowerShell launcher now allow the same real-service
suite to run with disposable PostgreSQL in a private container network namespace.
The launcher publishes no ports, mounts only the result directory and owns cleanup.
It resolves the service/shared dependencies from their project declarations;
the Windows validation environment remains unchanged. The first Linux report,
`hospital-linux-profile/hospital-http-postgres.xml`, passes 12 of 13 cases: six
HTTP/PostgreSQL cases and all six migration preservation checks. The expanded
directory journey failed because its new gateway reads omitted the required
MedApp session and received 401. The test now uses a normal platform session for
patient-directory reads; gateway authentication is unchanged. The final rerun
also includes the public timestamp regression fix.

The second Linux run, `hospital-linux-profile-final/hospital-http-postgres.xml`,
also passed 12 cases. The expanded journey reached its final revocation assertion:
HMS correctly returned its established non-disclosing 404 for missing membership,
while the test expected 403. The assertion now requires 404 without changing
authorization behavior.

**The final integration run passes all 13 cases** in 92.79 seconds:
`hospital-linux-profile-verified/hospital-http-postgres.xml`. Seven are real
HTTP/PostgreSQL cases covering approval, tenant provisioning, independent browser
sessions, directory publication/search, concurrent edits, draft isolation including
public timestamps, withdrawal/republishing, revocation, staff acceptance/rejoin and
migration safeguards. Six are the SQLite migration cases already counted above.
Deduplicated across Windows and this Linux run, the total is **272 passing checks**.
The container dependency snapshot is retained beside the report in
`dependencies.txt`. Five critical contract/service/integration files match the
source repository byte-for-byte inside the tested image. That integration image
is `sha256:28edcea7e05e5913e537a84f43b0f0d0d49847166a9db1ad3ffcc8d937817ffe`.
The disposable database and service-runner containers were removed after the run.

The eight previously skipped tenant/database cases also pass in the Linux runner:
`hospital-linux-tenants/hms-tenant-postgres.xml`, eight passed in 49.55 seconds.
These use the same launcher with `-Suite tenant` and the dedicated disposable
loopback PostgreSQL fixture. They close the earlier Windows provisioning/migration
validation gap; they do not represent a production deployment. The tenant QA image
is `sha256:d1757c82971241772ef5066fc0f2fd08c5f7afe7db4aa6f2d891886f642b8047`.
The final deduplicated milestone total is **280 passing checks**: 57 hospital,
172 HMS unit, eight HMS PostgreSQL, 30 portal, seven HTTP/PostgreSQL integration
and six migration preservation checks. No additional production code changed
after the passing directory metadata and integration checks.

### Remaining acceptance

Rendered browser/native checks remain pending because automatic approval review
previously rejected local preview startup as **blocked by policy**. No alternative
UI preview was started. The Linux runner is backend test infrastructure, not a
rendered UI acceptance result. Production configuration, deployed journeys,
reference fidelity, accessibility and theme acceptance remain open.

The register retains 108 unique references: 76 patient, 32 specialist, 62 mobile
routes and three layouts. S-001 through S-005 remain in progress and no reference
is accepted. B03 and the complete-app goal remain active; the next implementation
items are the pharmacy deployment adapter and explicit legacy reconciliation,
followed by the remaining operational HMS contract mismatches.

## B03 MedApp-to-hospital handoff — 2026-09-14

### Implemented

- Mobile Hospital workspaces lists current HMS memberships with loading, empty,
  retry and manual refresh states. Settings and professional application status
  link to it. Account changes cancel old queries and browser work.
- A short-lived proof opens the configured hospital portal. The browser clears
  the fragment, previews the account and requires confirmation. A different
  existing browser account cannot be silently replaced. Successful confirmation
  survives the browser's session-scope reset and leads to explicit hospital selection.
- The identity service partitions partner and hospital proofs, uses separate
  server credentials, and requires an active source refresh family and matching
  device. Expiry, cancellation, password changes, source logout and replay invalidate
  the proof. Redemption preserves the current account role and issues a separate,
  device-bound browser session. No proof or callback grants staff membership.
- Return to MedApp closes the hospital browser session, preserves the original
  MedApp session and reloads memberships. The validated fallback link survives
  the browser session-state reset. Native return markers survive app termination,
  are account-bound and expire; hospital/onboarding markers are separate.
- Shared mobile handoff behavior is extracted into a configured helper, retaining
  the partner flow's contract. App/environment configuration, Compose wiring,
  API contracts and portal/mobile documentation are updated. Migration
  `20260914_0010` preserves existing proofs as partner proofs and removes ephemeral
  hospital proofs on downgrade without discarding account or refresh-session data.

### Validation

**334 distinct passing checks** across these suites: 208 identity-service cases,
73 hospital-portal cases (including four real Redis cases), 48 focused mobile cases
and five real HTTP/PostgreSQL integration cases. Historical milestone totals are
not added to this count. Reports are under
`C:\Users\EmmanuelKabu\AppData\Local\MedApp\recovery-runtime`:

- `hms-handoff-user-full.xml`: 208 passed.
- `hms-handoff-web-full.xml`: 73 passed, no skipped Redis cases.
- `hms-handoff-mobile-initial.json`: 47 passed and one cold-render timeout.
  `hms-handoff-mobile-screen.json`: all four screen cases passed on rerun, including
  the timed-out case, without increasing its timeout. Deduplicated mobile total: 48.
- `hms-handoff-http-postgres.xml`: five passed against migrated PostgreSQL 16 and
  real loopback identity, onboarding, directory, HMS and gateway processes.

The HTTP suite verifies approval → proof → browser-token redemption → membership
selection/exchange → clinical operations, unchanged platform role, independent
browser logout and a still-active source session. Concurrent redemption creates
one child session: one request succeeds and one receives 410. User migration head
is `20260914_0010`. Private document storage remains an in-memory test double;
these HTTP checks do not run a rendered Next.js or native app.

The first focused backend run exposed an incorrect test expectation: a refresh
attempt from the wrong device revokes that child family, so it cannot subsequently
refresh from the right device. The corrected tests verify both behaviors separately.
Mobile TypeScript caught a retry handler returning void; it now returns the query
promise expected by the shared error panel. The final mobile TypeScript and HMS
standalone TypeScript checks pass. The HMS production build passes with 28 generated
pages. ESLint reports zero errors and the existing invoice `watch` warning.

Scoped Ruff formatting/checks and Compose configuration validation pass. Compose
warns about an unrelated unset `ANTHROPIC_API_KEY`. Disposable PostgreSQL and Redis
containers were removed; no integration server processes remained. Validation used
the existing local recovery-runtime source copies and installed dependencies; no
preview server was started. The screen inventory records 62 mobile routes and
three layouts, retaining all 76 patient and 32 specialist references unaccepted.
Final readback confirmed all 89 HMS source/configuration/test files and all 11
changed mobile code/test files match their QA copies. The scoped whitespace check
passes. Inventory validation confirms 108 unique reference IDs and 62 route entries.

### Remaining work

Staff onboarding, hospital profile/publication, the separate pharmacy deployment
adapter, legacy-approval reconciliation and the existing operational API mismatches
remain open. Submitted team details do not create staff memberships. Google/Apple
credentials are still absent; once configured, their authenticated MedApp sessions
can use the same hospital handoff. Live-provider, native/deep-link, deployed browser,
theme and reference acceptance remain pending.

Automatic approval review previously rejected local preview startup as **blocked
by policy**. No alternate preview startup was attempted. This milestone does not
accept additional screens or complete B03 or the app.

## B03 hospital staff onboarding — 2026-09-15

### Implemented

- Administrators invite a verified MedApp email with an explicit hospital role
  and optional employment/department details. A random seven-day code is displayed
  once and stored only as a hash. Creating a replacement, cancelling, changing the
  inviter's authority or disabling the hospital prevents acceptance of an old code.
- The recipient reviews the hospital/role and explicitly accepts from the hospital
  chooser. The portal uses its server-held platform session before selection,
  rejects stale browser scopes and never automatically replays acceptance.
- Acceptance commits a tenant staff record before management access, receipt and
  history. A retry after partial failure reuses the saved profile and preserves
  later edits. Existing inactive employment records require correction. Hospital
  membership does not change the person's platform role.
- Staff records support bounded paging, name/employee-ID search, error recovery and
  detail editing. The editor tracks its original values and sends only fields the
  administrator changed, preserving unrelated edits received during a background
  refresh. Blank names and conflicting employee IDs are rejected.
- Access controls list current/revoked memberships and invitations. Role changes
  use exact versions and preserve the last administrator. Revocation takes effect
  on subsequent hospital requests, preserves employment records and requires a new
  invitation to restore access. Access history records actors and before/after roles.
- Management migration `20260915_0003` adds membership versions, invitations and
  access events. It refuses a downgrade that would discard invitation/access history.
  Administrator code sharing is the delivery workflow; no invitation email is sent.

### Validation and current limits

Reports are under `C:\Users\EmmanuelKabu\AppData\Local\MedApp\recovery-runtime`.
Historical milestone counts are not added to these results.

**241 distinct checks pass:** 147 backend cases and 94 portal cases, combining the
boundary/Redis run with the final component runs below. PostgreSQL setup errors
are excluded; this is not a passing end-to-end PostgreSQL result.

- `hms-staff-full.xml`: 147 passed, eight PostgreSQL setup errors. There were no
  failed application assertions. The errors were a Windows migration-process exit
  (`0xC000070A`) followed by migration startup timeouts.
- `hms-staff-unit-final.xml`: all 14 staff cases passed after the final history and
  invitation-status changes. These overlap the full suite; they are not 14 extra
  cases. Coverage includes verified identity, invitation lifecycle, account/hospital
  isolation, last-administrator protection, stale versions, revocation, partial
  commit recovery, profile preservation, validation, paging and recorded history.
- `hms-staff-web.xml`: 71 passed, including all 11 new invitation/session-boundary
  cases and four real Redis cases. Three JSDOM workers failed at startup; their
  23 component cases did not execute. JUnit represents each worker failure as an
  error entry, not a successful test.
- `hms-staff-ui-final.xml`: changing only the worker pool to a single process did
  not fix startup; the same three workers timed out before assertions. A separate
  import probe measured JSDOM startup at 93,652 ms and the remaining Vitest worker
  imports at 2,501 ms, compared with Vitest's 60,000 ms startup limit. A retry after
  loading those dependencies is recorded in `hms-staff-ui-warm.xml`: 18 passed,
  five failed, with no worker-start errors. Three multi-step flows exceeded the
  five-second test limit; the timed-out sign-in actor continued typing into the
  next test, corrupting its input. Cancellation also exhausted its one-second
  query wait while still loading. The three multi-step flows and cancellation
  now have a bounded 15-second test limit, cancellation waits up to five seconds
  for its loaded action, and access tests await refresh completion before cleanup.
  Revocation's full-refresh check uses the same 15-second allowance. All behavioral
  assertions remain. `hms-staff-ui-complete.xml` passed 22 of 23 cases, including
  all ten sign-in/workspace and all three handoff cases; revocation then exceeded
  its previous five-second limit. `hms-staff-ui-verified.xml` passes all ten staff
  cases with the full-refresh check and final editor. Deduplicated component
  coverage is 23 passing cases; with the 71 boundary/Redis cases, the portal total
  is 94. These runs do not measure device or deployed-browser performance.
- `hms-staff-postgres-probe.xml`: the isolated local-copy probe failed during
  PostgreSQL readiness. `hms-staff-postgres-final.xml`: all eight cases failed during
  the fixture's ten-second `docker port` timeout. No application assertions ran.
  This does not establish that OneDrive caused the original failures.
- `hms-staff-http-postgres.xml`: all seven real HTTP/PostgreSQL cases failed during
  migration setup, before service journeys ran. The two new cases cover concurrent
  invitation acceptance/versioned role changes/revocation/rejoin and protecting
  access history during downgrade. They remain unverified on PostgreSQL.

The portal production build passed with the new staff and invitation routes.
The final staff editor refinement passes standalone TypeScript. Scoped Ruff and
whitespace checks pass. Full ESLint found one new unescaped JSX apostrophe in the
staff editor and the existing invoice `watch` warning. The apostrophe is escaped;
the focused lint check of the corrected page and all three updated component-test
files passes. Combined with the full run, there are no remaining lint errors and
one existing invoice-form warning.
Backend and web validation used local source copies and the installed dependencies;
the final staff editor, team UI/tests, invitation service/tests and HTTP integration
source files were checked byte-for-byte against those copies. Final verification
matched all 178 selected HMS frontend/backend source, configuration and test files
against the validation copies. All disposable PostgreSQL and Redis test containers
were removed.

### Remaining work

Complete the pending PostgreSQL/migration and real HTTP journeys before
claiming staff onboarding is fully verified. Native/deployed browser, role-specific
operations, reference fidelity, accessibility and theme acceptance remain open.
Hospital profile/publication is the next B03 implementation task, followed by the
separate pharmacy deployment adapter and legacy-approval reconciliation. Existing
queue, invoice, pharmacy, schedule and tenant repository mismatches remain in scope.
Application team details alone do not create staff memberships.

The inventory still contains 108 unique references: 76 patient and 32 specialist,
62 mobile routes and three layouts. S-001 through S-005 remain in progress; no
reference is accepted. Automatic approval review previously rejected local preview
startup as **blocked by policy**; no alternate preview startup was attempted.
B03 and the complete-app goal remain in progress.
