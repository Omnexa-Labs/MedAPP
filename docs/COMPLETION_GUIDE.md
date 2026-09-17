# MedApp project completion guide

Updated: 2026-09-17.

This is the working guide for completing MedApp. It covers the full reference inventory in two screen groups: **patient-facing** and **specialist-facing**.

**Planning baseline agreed with the product owner:** most patient-facing screens have been implemented; the specialist-facing screen set has not been implemented. Existing practitioner routes, shared shells, API adapters, and web portal code are material to inspect and reuse. They do not count as completed specialist screens.

Use this guide for sequencing, [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md) for the screen checklist, and [SCREEN_INVENTORY.json](SCREEN_INVENTORY.json) for the structured register. [COMPLETION_BASELINE.md](COMPLETION_BASELINE.md) records the initial technical read-through and its validation limits.

## 1. Scope and counting

| Screen group | Reference screens | Starting point |
| --- | ---: | --- |
| Patient-facing | 76 | Finish and verify the implemented screens; build the reference journeys that are still absent. |
| Specialist-facing | 32 | Implement the specialist experience, using existing code only after checking its suitability. |
| **Total** | **108** | Every reference has its own ID and remains in the completion checklist. |

The inventory contains 109 HTML files: 108 screen references plus one animation asset. It also includes 126 PNGs and a specialist design document. Six additional HTML files in `.stitch-html` are linked to their matching booking/consultation references.

Seventeen specialist references are physically stored under `Patient_facing_screens`. These include clinician consultation workspaces with prescribing actions, patient rosters, professional settings, and partner dashboards. The checklist groups them by the person performing the actions and records their original paths. Hospital department discovery and public specialist profiles remain patient-facing.

The specialist group includes doctor, nurse, and hospital/pharmacy partner workflows as subgroups. Their permissions remain separate. This organizational grouping does not give every specialist access to every professional action.

The mobile source currently has 65 non-test route entries and 3 layouts, including active sessions, two-factor setup, care-team sharing, the patient vitals timeline, medical-records hub, hospital/pharmacy workspaces, specialist prescribing and pharmacy reports (recounted from source). A route may contain several states or reference variants. Route count is not a completion measure. Reference variants remain individually tracked until their behavior and appearance are accounted for in an accepted implementation.

Previously deferred features such as community groups and order/delivery references remain in this guide. Where an older document excludes them, record the scope conflict and settle the implementation contract in the assigned batch; do not silently remove the reference from the checklist.

## 2. How to use the guide

1. Pick the next batch whose dependencies are satisfied.
2. Open every reference assigned to the batch and inspect the related current implementation.
3. Record what can be reused and what is missing: route, UI, service contract, data, integration, or validation.
4. Read the service contract and gateway mapping before creating endpoints. Update the contract documentation with the implementation.
5. Complete the UI and its real actions, including role boundaries and loading, empty, error, retry, and permission states.
6. Verify the whole journey through the gateway with the appropriate accounts. Check both themes and target-device behavior.
7. Add acceptance evidence to the register and mark each covered screen accepted. Update the batch log below.

Do not mark a screen done merely because its route renders, it resembles a reference, or a mocked component test passes. “Existing code to verify” means exactly that. “Not implemented” is the starting status for **every specialist reference**, per the product owner's correction.

For references that become states of one shared screen, record the implemented state and evidence against each reference ID. When one design supersedes another, record that decision and the covering reference ID; retain both entries for traceability.

## 3. Patient-facing completion groups

| Module | Screens | Work to finish | Main dependencies | Batch |
| --- | ---: | --- | --- | --- |
| P01 — Access and onboarding | 5 | Splash, sign-in, sign-up steps; complete recovery, verification, social sign-in, and legal links already present elsewhere in the routes. | User identity and sessions | B01 |
| P02 — Home and profile | 6 | New-user/active-care home variants, dashboard, personal profile, trends, and meaningful navigation. | User, EHR, bookings | B01 |
| P03 — Find care and booking | 12 | Directory variants, public specialist profiles, hospital departments, slots, review, confirmation, appointment management. | Directories and booking | B02 |
| P04 — Messages and consultation | 6 | Inbox, consultation chat, clinical sharing, waiting room, and video visit. | Inbox, EHR consent, telemedicine | B06 |
| P05 — Records, labs, reports | 9 | Medical history, overview, upload, lab detail, vitals timeline, report variants, export settings. | EHR, labs, file storage | B07 |
| P06 — Medications and prescriptions | 13 | Active medication list, add/scan/verify, detail, tracking variants, prescription history/view/share, interaction checker, integrated health view. | Clinical medication/prescription contracts, specialist prescribing | B08 |
| P07 — Lifestyle | 3 | Lifestyle hub variants and daily logging with saved history. | Persisted lifestyle data and relevant AI summaries | B09 |
| P08 — Connected devices | 4 | Device connection, data selection, sync progress, and completion states. | Device permissions/providers, wearable ingestion, EHR | B09 |
| P09 — AI and community | 7 | AI assistant, explore, feed, Q&A, community and health-group variants. | Agent services, inbox, social publishing and moderation | B10 |
| P10 — Pharmacy and orders | 4 | Pharmacy hub/profile, order review, and delivery tracking. | Pharmacy/PMS, fulfillment contract, payment integration | B11 |
| P11 — Settings, support, billing | 7 | Settings, security/privacy, notification preferences, help/contact, interaction history, insurance/billing. | User, notifications, support history, commerce | B01 / B09 / B11 |

Notifications, post detail, saved posts, password recovery, sign-up verification, privacy, and terms also exist as application routes without a one-to-one local screen reference. They are explicitly reconciled in the inventory so they remain part of completion.

## 4. Specialist-facing implementation groups

**All groups below start as not implemented.** The goal is a complete professional experience, including the work behind its controls.

| Module | Screens | Implementation required | Main dependencies | Batch |
| --- | ---: | --- | --- | --- |
| S01 — Professional onboarding and identity | 5 | Partner selection, application/status, practitioner credentials, pharmacy onboarding, professional profile settings. | Onboarding, user identity, practitioner/facility records | B03 |
| S02 — Professional dashboards | 4 | Doctor, nurse, specialist, and practitioner dashboard references with the right work queues and navigation. | Role-specific profiles, schedules, notifications | B04 |
| S03 — Schedules and requests | 4 | Schedule hub/management, availability editing, consultation request detail and decisions. | Practitioner availability and booking lifecycle | B04 |
| S04 — Patient roster and records | 5 | Roster variants, filtering, patient details, intake, vitals/observations, clinical actions. | Authorized care relationships, EHR, appropriate HMS data | B05 |
| S05 — Consultation and team chat | 4 | Consultation workspace variants, AI handoff review, team messaging, clinical notes, vitals requests, and follow-up. | Inbox, EHR, labs, telemedicine, booking | B06 |
| S06 — Prescription issuing | 2 | Prescription composition/review/issue, validation, correction/cancellation, patient delivery, and pharmacy handoff. | Service-owned prescribing contract, practitioner permissions | B08 |
| S07 — Publishing and community management | 4 | Compose health post, community management, create health group, membership approval queue. | Social authoring, membership, moderation, notifications | B10 |
| S08 — Partner operations | 3 | Hospital admin/partner dashboards and pharmacy partner dashboard, connected to scoped operational data. | HMS/PMS identity, tenancy, staff, inventory, billing | B11 |
| S09 — Clinical analytics | 1 | Clinical metrics, filters, trends, and permitted drill-downs with defined calculations. | Event/aggregate data and access-controlled clinical sources | B09 / B11 |

Public doctor/specialist profiles belong to P03 because a patient uses them to choose care. A specialist's own professional editor belongs to S01. Receiving a prescription belongs to P06; issuing one belongs to S06.

## 5. Ordered implementation batches

No calendar estimate is assigned yet. Batch acceptance provides a more useful measure than a percentage inferred from the number of screens.

### B00 — Establish the baseline

- [ ] Reconcile the inventory and open the references relevant to the first implementation batch.
- [ ] Make local dependencies readable and finish mobile type checking and the existing test baseline.
- [ ] Establish the working-tree state without overwriting existing changes.
- [ ] Start the needed backend services, apply their migrations, and verify gateway reachability.
- [ ] Create or confirm development fixtures for a patient, doctor, nurse, hospital partner, and pharmacy partner as required by upcoming batches.
- [ ] Record environment-specific failures separately from code failures.

**Exit:** the team can reproduce the current app/service behavior and has a recorded validation baseline. The previous review's stalled TypeScript/Jest attempts are not passing checks.

### B01 — Finish patient access, home, and account basics

**Covers:** P01, P02, and the account/help/security part of P11. Depends on B00.

- [ ] Complete registration, verification, sign-in, recovery, social sign-in, and session restoration.
- [ ] Complete home states, personal profile editing, and the links into all existing patient sections.
- [ ] Finish account/security settings, support entry points, and legal routes.
- [ ] Ensure sign-out/account changes clear the appropriate user data and navigation state.

Current account work (2026-09-13): email signup verification is implemented per the product owner's
choice, with separate resend/expiry timers and persisted incorrect-code attempts. Local gateway,
SMTP, verified account creation, login/refresh/logout and session regression checks pass. DOB,
gender, optional self-reported blood type and primary health goal now save atomically at signup
and display on the profile after a new login. PostgreSQL migration and API persistence checks
pass. Unavailable signup security/sharing options are disabled and off; completing/skipping the
step records no consent or enrollment. Rendered and device acceptance remain pending.
The patient profile editor now loads existing details, saves only changed fields, refreshes
the signed-in profile, and handles validation, retry and unsaved changes. Active
session management now lists real sessions and revokes a selected refresh family,
including after rotation. Existing access tokens retain their expiry; the screen
explains the configured delay (normally up to 15 minutes). Biometric enrollment,
disable and explicit lock now use protected native credentials; cold starts require
unlock and rotated credentials persist before the profile request. Password changes
offer a new sign-in instead of promising session continuity. Native biometric,
reference and theme acceptance remain pending. Authenticator setup, password-plus-code
sign-in, single-use recovery codes and confirmed disable are now implemented. Setup
requires password reauthentication and code verification, and security changes revoke
refresh sessions. Production encryption-key configuration and device acceptance remain
pending. Care-team sharing now lets patients choose a named doctor/nurse, confirm EHR
read or add-vitals access for 7/30/90 days, review history and revoke access. The backend
enforces scope and expiry, verifies the recipient through the user service, and serializes
revocation with clinical requests. This covers the EHR summary/vitals; cross-service sharing
and specialist workflows remain in B05–B08. Home now distinguishes loading, failed and empty
appointments/wellness, offers real retries and refresh, and connects Labs, Vitals and Records.
Its private queries follow the current account/session and its clock advances while mounted.
The new patient vitals timeline supplies dated, paged EHR readings and measurement/date filters;
the records hub links the available sections. This starts B07 without claiming full document,
history, report or specialist coverage. Google/Apple sign-in is now implemented as a configured native flow, with explicit
account linking and disconnection. The owner has not created provider credentials;
[the setup guide](PROVIDER_SIGN_IN_SETUP.md) records the required configuration and
provider/device acceptance. Continue with B02 patient discovery and booking, then
B03 specialist entry/onboarding; remaining account actions stay in B01.

**Exit:** a new patient can register, recover access, update their profile, restart the app, and reach the intended destination without placeholder account actions.

### B02 — Finish patient discovery and booking

**Covers:** P03. Depends on B01.

- [ ] Reconcile directory/profile variants and implement real filters and detail actions.
- [ ] Return and carry authoritative slot start/end instants; handle timezones and slot contention.
- [ ] Complete booking, confirmation, cancellation, and rescheduling.
- [ ] Show honest states when a provider has no slots or a video room is not ready.

**Exit:** a patient creates and manages a persisted appointment; refresh/restart and the provider schedule reflect the same appointment and time.

### B03 — Implement specialist entry, onboarding, and identity

**Covers:** S01 plus specialist navigation/role foundations. Depends on B00 and reusable account behavior from B01.

- [ ] Implement specialist navigation and role-specific access; review the existing shells before reuse.
- [ ] Implement professional onboarding, credentials, application status, and rejected/pending/approved states.
- [ ] Implement the professional profile editor with actual save/preview behavior.
- [ ] Resolve self-profile lookup and the distinction between account, practitioner, facility, and tenant identifiers.
- [ ] Keep the established web partner-onboarding boundary where applicable; connect its launch and return/status behavior.

**Exit:** an approved professional reaches the right workspace and updates their own identity; pending or unrelated accounts cannot exercise professional actions.

### B04 — Implement specialist dashboards, schedules, and requests

**Covers:** S02 and S03. Depends on B02 and B03.

- [ ] Build the doctor/nurse/specialist dashboard references and their real work summaries.
- [ ] Implement working hours, availability, schedule views, and request decisions.
- [ ] Enforce conflicts and supported role-specific booking rules in the backend.
- [ ] Connect navigation between the schedule, request detail, patient context, and consultation.

**Exit:** a specialist changes availability and manages a real appointment; the patient sees the matching availability/status.

### B05 — Implement the patient roster and clinical access

**Covers:** S04. Depends on B03 and B04.

- [ ] Define an authorized care-relationship/roster contract rather than deriving an unrestricted list from bookings.
- [ ] Implement roster variants, searches/filters, patient details, and their missing/denied states.
- [ ] Persist intake/observations/clinical actions in the correct service.
- [ ] Connect consent and audit behavior to the patient record access journey.

**Exit:** a specialist can find and act on a permitted patient's record, and cannot read or change an unrelated patient's record. The roster reflects persisted changes.

### B06 — Complete consultations and communication on both sides

**Covers:** P04 and S05, with booking and EHR connections. Depends on B04 and B05.

- [ ] Complete patient/specialist conversation views, attachments, voice messages, and relevant read state.
- [ ] Implement permission-aware sharing of records, vitals, and medication context.
- [ ] Connect waiting-room checks, room identity/token/join/leave/end operations, and real audio/video transport.
- [ ] Implement specialist notes, reviewed AI handoff context, vitals requests, and follow-up actions.
- [ ] Verify disconnect/reconnect, denied permissions, cancellation, and one participant leaving.

**Exit:** a patient and specialist complete the same consultation on two sessions/devices; messages and clinical outcomes persist, and ending/leaving a call has the correct effect for each role.

### B07 — Complete records, labs, and reports

**Covers:** P05 and the corresponding specialist record/lab actions. Depends on B05 and B06.

- [ ] Complete upload, validation, progress/failure, storage, retrieval, and authorized download.
- [ ] Implement history, lab detail, trends, and report preview/export references.
- [ ] Connect specialist-created orders/results/notes where required by the clinical journey.
- [ ] Ensure a failed source never appears as an empty medical record.

**Exit:** a permitted record/result can be created or uploaded, viewed by the intended role, and exported with accurate content and access controls.

### B08 — Complete prescribing and medication follow-up

**Covers:** P06 and S06. Depends on B05 and B07.

- [ ] Define the patient medication, prescription, and adherence contracts and their owning service.
- [ ] Implement specialist prescription issue/review/correction/cancellation with role checks.
- [ ] Connect the patient's new/active/past prescription views and sharing behavior.
- [ ] Replace medication samples; persist self-reported medicines and dose/adherence actions.
- [ ] Finish scan verification and connect an appropriate interaction-data source before presenting interaction results.
- [ ] Integrate partner dispensing without treating MedApp patient credentials as PMS staff credentials.

**Exit:** a specialist issues a prescription; the correct patient sees it, tracks its medication, and can revisit the saved state. Changes and dispensing acknowledgments reconcile across the relevant systems.

2026-09-16 partial integration: pharmacy dispensing/correction reports now reach
patient-owned history through a durable queue and authenticated receiver. This
supports P-043/S-031, but does not complete specialist issuing, medication-course
states or the B08 exit. See [PHARMACY_SYNC.md](PHARMACY_SYNC.md).

2026-09-16 prescribing milestone: EHR owns doctor-authored drafts, reviewed issuing,
immutable corrections/cancellations and patient-scoped history. Verified doctors
require explicit `records_and_prescriptions` consent. Durable pharmacy handoff and
withdrawal reconcile with dispensing reports; replacement requires confirmed
withdrawal of a routed original. Specialist compose/review and patient
details/history/text-copy routes are connected. See [PRESCRIBING.md](PRESCRIBING.md).
Medication tracking, adherence, scanning, interaction providers and rendered/device
acceptance remain open. The B08 exit and all 108 reference acceptances remain incomplete.

2026-09-16 medication milestone: patient-owned courses and dose reports now persist
in EHR. Patients can track issued prescription items or add self reports, choose
daily/manual tracking, report taken/skipped doses, correct entries with retained
history, and pause/resume/stop/complete tracking with a reason. Prescription and
pharmacy states remain separate. Lists, tracker, details, history and fresh text
exports are connected. See [MEDICATION_TRACKING.md](MEDICATION_TRACKING.md) and
[validation evidence](COMPLETION_BASELINE.md). This supports
P-039/P-040/P-041/P-045/P-047/P-048 without accepting them. Scanning, interaction
providers and rendered/device/reference QA remain open. The following update supersedes
the plan-revision/reminder implementation gap.

2026-09-17 schedule/reminder milestone: future daily-time/end-date changes retain
historical plans and dose attribution. Reminder preferences, native registration,
generic Expo push dispatch and attempt history are implemented. Worker suppression
uses current course, prescription, device and dose state; uncertain sends are not
resent. See [MEDICATION_REMINDERS.md](MEDICATION_REMINDERS.md). The 208 unit/component
checks pass; new PostgreSQL migration/concurrency checks and real provider/device
delivery remain pending. Docker repair and preview startup were blocked by automatic
approval review. No reference is accepted and B08/B09 remain incomplete.

### B09 — Complete daily follow-up and clinical insights

**Covers:** P07, P08, notification/preferences work in P11, and clinical-data portions of S09. Depends on B07 and B08.

- [ ] Persist lifestyle entries and render summaries from saved history.
- [ ] Complete consented device connection, selection, sync, retry, and disconnect for supported providers.
- [ ] Connect medication/follow-up reminders and persistent notification preferences.
- [ ] Implement scoped clinical insight views with documented metric definitions and real source data.

**Exit:** saved or synced data appears in the appropriate patient/specialist views, repeated sync does not duplicate records, and reminders respect the saved preferences.

### B10 — Complete AI, community, and professional publishing

**Covers:** P09 and S07; remaining interaction-history behavior in P11. Depends on B03, B06, and relevant patient-data contracts.

- [ ] Finish AI conversation and practitioner handoff paths.
- [ ] Implement specialist post authoring and patient feed/detail/save/comment interactions.
- [ ] Implement group creation, membership, approvals, management, and moderation.
- [ ] Reconcile explore/directory variants and any intended follow/subscription behavior.
- [ ] Provide actual persistence and permissions for interactions displayed in history.

**Exit:** a specialist publishes or manages content and the right patient audience can discover/interact with it; group and moderation decisions change access correctly.

### B11 — Complete partner operations, orders, and billing

**Covers:** P10, S08, commerce portions of P11, and remaining operational analytics in S09. Depends on B03, B07, and B08.

- [ ] Reconcile hospital/pharmacy reference dashboards with HMS/PMS portal implementations.
- [ ] Complete tenant-scoped staff, facilities, inventory, prescribing/dispensing, and billing connections.
- [ ] Define the actual order/fulfillment/delivery state model behind review-order and track-delivery.
- [ ] Integrate the selected payment provider, status/webhook reconciliation, and refunds.
- [ ] Define what the insurance/billing screen actually supports and obtain the required partner integration.
- [ ] Complete the operational admin work needed to approve partners, manage content, and resolve the supported workflows.

**Exit:** the patient and relevant partner see consistent order, dispensing, billing, and payment state. Delivery progress and successful charges come from actual provider/system outcomes.

### B12 — Acceptance and release preparation

**Covers:** every patient and specialist inventory entry. Depends on B01–B11.

- [ ] Review every reference ID and application-only route; complete outstanding states and actions.
- [ ] Verify both themes, small screens, large text, accessibility, keyboard/back behavior, and interrupted requests.
- [ ] Run the applicable component, service, gateway integration, and device checks.
- [ ] Check effective CI coverage for all services/frontends and complete missing coverage.
- [ ] Verify the target build, configuration, migrations, monitoring/readiness, recovery, and deployment process.
- [ ] Attach evidence for each accepted screen and close remaining blocking dependencies.

**Exit:** all planned screen references are accounted for, the agreed journeys pass on the target platforms, and the release has a reproducible validation record.

## 6. Decisions and dependencies to resolve during the assigned batch

These are tracked implementation dependencies, not questions that block writing this guide.

| Decision | Needed by | Concrete preparation |
| --- | --- | --- |
| Target devices/platforms for release | B00/B12 | Inspect existing Expo/native configuration and establish the actual device validation matrix. |
| Canonical reference when variants differ | Each relevant batch | Compare the variants and current design system; record the chosen state/layout and coverage for every reference. |
| Professional roles and permitted operations | B03–B05 | Map current identities/capabilities to doctor, nurse, hospital, pharmacy, and administrator actions. |
| Clinical ownership and consent model | B05/B08 | Inspect EHR/HMS/PMS contracts and prepare schemas/flows for roster, notes, prescribing, medications, and adherence. |
| Media provider | B06 | Prepare the two-party room/token/media contract, supported platforms, and configured integration requirements. |
| Wearable and interaction-data providers | B08/B09 | Identify supported real data sources and implement explicit unavailable states where a source is absent. |
| Groups, memberships, follow/subscription contracts | B10 | Reconcile older deferred scope with the current complete-screen objective and prepare the needed social contracts. |
| Payment, insurance, fulfillment, delivery partners | B11 | Define supported outcomes and integration requirements before wiring the reference controls. |

## 7. Acceptance record and progress

Each screen register entry carries:

- A stable ID, group/module, original HTML and image references, and the next batch.
- The current UI status, API status, and QA status as separate fields.
- Related existing code to inspect, which may be only a reuse candidate.
- An accepted flag and evidence list; future evidence should identify the change, tested scenario, platform/theme, and result.

No screen is marked accepted by this planning pass. This measures **verified acceptance**, not how much patient UI has already been written. Specialist entries remain “not implemented” until their implementation work is performed.

| Batch | Status | Evidence / next action |
| --- | --- | --- |
| Planning inventory | Complete | 108 screen references mapped into two groups; original paths retained. |
| B00 | In progress | Mobile dependencies installed: Expo 55.0.31 / React Native 0.83.10; compatibility, Doctor 20/20 and TypeScript pass. Latest full user-service suite: 143 passed; the final provider rerun passes 16 cases (144 distinct cases across those runs). Temporary PostgreSQL 16 verifies migrations, API persistence and session refresh/revocation concurrency. Earlier full mobile run: 1,563/1,564 passed; the toast correction then passed 16/16. Full-suite shutdown/timing remains unresolved; focused runs exit normally after documented cold-render timing adjustments. Local gateway/SMTP checks pass after service readiness; unavailable upstream connections currently surface as gateway 500s. Rendered/device QA and other services/migrations still need evidence. |
| B01 | In progress | Account/security evidence remains in the baseline. Home now has explicit loading/empty/error/retry states, account-scoped requests and working patient record links. Care-team permissions remain enforced. The latest full EHR suite passes 38 cases; 79 distinct mobile cases pass across the final relevant reruns, alongside TypeScript and PostgreSQL/live gateway paging/migration checks. Google/Apple native sign-in, explicit linking and disconnection are implemented with 45 distinct passing mobile cases, 144 distinct backend cases and PostgreSQL/gateway evidence. Provider credentials, production configuration, native security acceptance and remaining account/reference/device work stay open. |
| B02 | In progress | Real clinician slots, atomic rescheduling and database overlap migration remain implemented. Find Care now includes all five categories, paginates pharmacy/pharmacist results and applies supported specialty/home-visit filters. Public clinician profiles and saved appointment details reload from their APIs. Confirmation carries only the saved booking ID; history distinguishes past and cancelled bookings and opens real details. Latest component/TypeScript evidence is recorded in the baseline. PostgreSQL/live-gateway validation remains pending because Docker cannot start; native/reference acceptance, public social/review variants and fee/currency gaps remain open. B03 specialist entry and identity can proceed while those external validation gates remain pending. |
| B03 | In progress | Doctor/nurse self-profile, application status and the partner website's draft/credential/submission/correction/history journey are implemented. Mobile start/continue/correct actions now use a single-use authenticated handoff; validated warm/cold return reloads saved status and renews JWT permissions, with a persistent native return marker and manual recovery. Final handoff checks: 38 backend, 45 mobile and 52 website tests pass, with mobile TypeScript and the website production build. CUA verifies the web handoff through the real gateway/user service using SQLite, a Redis test double and an HTTP return receiver; earlier practitioner/facility browser evidence remains in the baseline. S-001 through S-005 remain in progress and unaccepted. Doctor/nurse approval now queues profile and role activation with durable receipts, bounded retry and current-session renewal; 329 service cases, four migration checks and two real loopback HTTP journeys pass. Applicant activation status now distinguishes pending/retry/attention/completed setup and preserves the authenticated return; 72 website tests and the production build pass. Admin Workspace SSO backend is implemented with 25 final focused passing cases; the complete user-service run passes 192 (195 distinct cases across both runs). Local Next.js preview startup was rejected by automatic approval review as blocked by policy, so the new display has no rendered acceptance. The admin console now implements Workspace/MFA sign-in, scoped server sessions, queue, credential verification, versioned decisions, history and activation retry; 50 tests and its production build pass using the existing dependency graph. Browser/live-provider acceptance is still open. Hospital handoff is now implemented and verified as recorded below. Next: hospital profile/publication, the pharmacy deployment adapter, legacy-approval reconciliation, regional/NPI fields, professional navigation/profile completion, production configuration/infrastructure and native/reference acceptance. |
| B04–B12 | Planned; B07 groundwork started | Patient vitals timeline and medical-records navigation have partial software evidence. Full records/documents and the other batches remain. All 32 specialist references remain in scope; the other 27 retain their not-implemented baseline. |

Next implementation batch: **B03 specialist entry, onboarding and identity**. B00/B01/B02 retain their outstanding environment, integration and reference acceptance checks. B03 has its own completion criteria and no inherited completion credit from partial practitioner code.

B03 update, 2026-09-14: hospital approval now creates a private directory profile,
provisions the matching HMS database and grants its initial owner a scoped
membership. The applicant keeps their existing MedApp role. Receipts make retries
idempotent and prevent replay from restoring revoked access. HMS can exchange a
verified MedApp session for a short-lived hospital session; the gateway restricts
that token to HMS, and operations recheck live membership and tenant readiness.
Configuration wiring, migrations and validation evidence are recorded in the
baseline and [HMS contract](api/hms_service.md).

B03 browser update, 2026-09-14: HMS now has MedApp email/password and MFA sign-in,
server-held sessions, explicit hospital selection and renewal. Switching hospital
or losing a staff role replaces cached clinical data and mounted forms. Delayed
responses cannot erase a newer sign-in or restore a signed-out session. There are
58 passing automated checks and a passing production build including TypeScript;
lint has no errors and one existing invoice-form warning. The count includes four
real Redis persistence/locking checks using a disposable container. Rendered checks
remain pending after the earlier automatic approval rejection of Next.js preview
startup. This work accepts no additional reference screens.

B03 handoff update, 2026-09-14: mobile Hospital workspaces now lists live memberships
and opens the HMS portal with a single-use proof. Explicit account confirmation
creates a separate browser session, followed by hospital selection. Return closes
that session, preserves the MedApp source session and reloads current memberships.
Hospital and onboarding proofs/return markers are separate. The checks pass across
208 identity-service cases, 73 hospital-portal cases (including four real Redis
cases), 48 distinct mobile cases and five real HTTP/PostgreSQL integration cases:
334 distinct checks in these suites. The production build, mobile/HMS type checks,
scoped Ruff and Compose configuration pass; lint has no errors and one existing
invoice-form warning. Native/deployed browser and provider acceptance remain open.

Next B03 work: finish hospital profile/publication acceptance, the separate pharmacy
deployment adapter, and legacy-approval
reconciliation. Existing operational queue, invoice, pharmacy, schedule and tenant
repository methods also need reconciliation with the actual API before B11
acceptance. Submitted hospital team details do not grant staff memberships; the
administrator must invite each person and the verified recipient must accept.
Production credentials/infrastructure and native/reference acceptance remain open.

B03 staff update, 2026-09-15: hospital administrators can create email-bound
invitations with hospital roles and optional employment details. Recipients review
and accept from the hospital chooser using the invited verified MedApp email.
Acceptance creates/reuses the tenant staff record and grants hospital access without
changing the platform role. Administrators can page/search records, edit staff
details, cancel invitations, review access history and change/revoke roles using
the current membership version. Last-administrator protection and new-invitation
requirements prevent accidental lockout or reuse of old codes to restore access.
Management migration `20260915_0003` retains invitation and access history.

The administrator shares the one-time code privately; automatic invitation email
is not implemented. There are 147 passing backend cases and 94 distinct passing
portal cases, including all 10 staff UI cases. PostgreSQL end-to-end checks failed
during Docker/migration setup and remain unverified. Results and rendered-check
limits are recorded in the [completion baseline](COMPLETION_BASELINE.md). This is supporting
specialist workflow evidence, not acceptance of hospital dashboard references.

B03 hospital profile update, 2026-09-15: the HMS portal now loads the approved
hospital through current administrator access, saves versioned directory drafts,
shows saved/public previews and requires explicit publication or withdrawal.
Draft saves preserve the current public listing. Accreditation, ownership, hospital
ID and approval evidence remain outside the editable fields. History records each
changed revision and its actor. Stale edits and uncertain responses preserve inputs
and require explicit reload; changing hospital cancels the old editor's requests.

Hospital migration `20260915_0005` separates drafts from public fields and protects
publication history during downgrade. HMS and the directory receiver use a new,
dedicated service secret; see the [HMS contract](api/hms_service.md#hospital-profile-and-publication)
and [directory contract](api/hospital_service.md). Patient insurance filtering now
matches any accepted insurer exactly, ignoring case. Actual API, component,
migration and real-service results are recorded separately in the
[completion baseline](COMPLETION_BASELINE.md). This feature adds no reference
screen and does not establish rendered hospital dashboard acceptance.

Final validation for this milestone passes 280 distinct checks, including the seven
real HTTP/PostgreSQL cases and all eight dedicated tenant/database cases using
disposable Linux containers. The portal production build, TypeScript, targeted
lint, scoped Ruff and Compose configuration pass. Migration and service-secret
setup are documented in the linked API contracts. Rendered/deployed/native and
reference acceptance remain open; automatic approval review previously blocked
local UI preview startup.

Pharmacy backend update, 2026-09-15: approval now creates a private pharmacy
directory identity, waits for an independent administrator to assign a configured
PMS deployment, and activates the reserved MedApp owner with immutable receipts.
Assignment is permanent and versioned; a lost response can be retried without
duplicating a workspace or restoring changed access. The PMS session exchange
confirms the active, email-verified MedApp account and creates SSO-only staff using
the actual identity. It leaves the platform role unchanged. Public directory reads
exclude private profiles and internal routing fields; stock uses confirmed
deployment configuration and validates the returned pharmacy and drug identity.

All 83 checks pass across the focused unit suites and real PostgreSQL
migration/service journey. The evidence is recorded in the
[completion baseline](COMPLETION_BASELINE.md). Configuration, operator steps and
remaining UI limitations are in the [pharmacy contract](api/pharmacy_service.md).
This backend milestone does not implement or accept a pharmacy reference screen.

Pharmacy portal update, 2026-09-15: the admin application detail now provides
configured deployment selection, permanent-assignment confirmation and continuation
into the existing activation retry. The PMS portal now supports MedApp password/MFA
and explicit local staff login with server-held Redis sessions. Browser operations
use finite same-origin routes, verified pharmacy context and session scopes;
revocation/sign-out clear cached data and remount forms. Portal settings displays
the actual pharmacy and signed-in identity. Deployment configuration is recorded in
the [portal setup guide](../frontend/pms_web/README.md).

Final verification: **160 passing checks** (74 admin, 53 pharmacy portal including
four real Redis cases, 30 PMS and three PostgreSQL/HTTP/migration cases). Both web
production builds and type checks pass, as do PMS lint, scoped Ruff and Compose
validation. See the latest baseline entry for report paths. Rendered/native,
live-deployment and reference acceptance remain open; no screen is accepted solely
on this implementation and component/backend evidence.

Pharmacy handoff update, 2026-09-15: MedApp now lists the owner's approved,
activated pharmacy workspaces and opens the selected deployment using a
short-lived, single-use proof. The PMS confirms the account and exact pharmacy,
creates a separate browser session, and closes that session before returning to
MedApp. Onboarding, hospital and pharmacy return markers are separate. The
configuration guide includes the user-service migration, per-deployment
credentials and matching return allowlists.

Final test evidence: **400 passing checks** (226 user-service, 36 pharmacy
directory, 74 PMS portal including four real Redis cases, 61 mobile and three
PostgreSQL/HTTP/migration cases). Reports and remaining validation limits are in
the latest baseline entry. The new workspace selector is a supporting route,
not an accepted pharmacy dashboard reference.

Pharmacy profile update, 2026-09-15: the PMS owner can edit versioned directory
drafts, review saved/public details, confirm publication or withdrawal, and read
change history. The directory independently checks current approved ownership
and PMS access. Concurrent saves cannot overwrite newer versions. Services,
weekly hours and head-pharmacist details now reach the patient pharmacy screen;
overnight closing is labelled as the next day. Licensing stays read-only.
Photo previews support hosted HTTPS images and failure recovery; managed photo
uploads remain to be implemented. This is supporting workflow progress, with
rendered/device and complete reference acceptance still open.

Final evidence for this profile milestone: **213 passing tests** (63 directory,
88 PMS portal including four real Redis cases, 59 patient mobile and three
PostgreSQL/HTTP/migration cases), plus the PMS production build, mobile/PMS
TypeScript, PMS lint and scoped Ruff. See the latest baseline for report paths,
corrections from initial runs and the limits of this validation.

Managed pharmacy photo update, 2026-09-15: the PMS owner can now choose a photo,
save it to the private draft, preview it and publish separately. Removal and
replacement follow the saved profile version. Images are bounded, normalized
and stored with the draft in one PostgreSQL transaction; unreferenced photos
are removed. Public photo reads require the exact current published image.
The service exposes no draft bytes anonymously. Apply migration 20260915_0004
and configure PHARMACY_PUBLIC_API_ORIGIN as described in the pharmacy contract.
There are 223 distinct passing automated checks in the recorded suites; see the
[latest baseline](COMPLETION_BASELINE.md) for report paths and remaining limits.
Managed uploads add supporting evidence for P-067/S-003 but accept no reference.

Pharmacy dashboard and inventory update, 2026-09-15: S-031 now has a working
overview with live prescription and stock queues, today/week sales activity and
links to the relevant records. Catalog search/paging, creation, versioned editing
and archiving are implemented. Batch receipt, adjustment, expiry filters and
movement history use actual inventory data. Stock writers serialize changes;
manual receipt/adjustment retries reuse atomic request receipts. See the
[operations contract](api/pms_service.md) and [validation record](COMPLETION_BASELINE.md).
The reference is **in progress**, not accepted. Scanning, refill orders, delivery,
clinical interaction alerts, partial purchase receipts and prescription corrections/
refunds remain assigned to B08/B11; none has been removed from scope.

Pharmacy purchasing update, 2026-09-15: draft creation/editing, externally placed
order tracking, partial deliveries, split batches, outstanding/cancelled quantities
and before/after order history are implemented. Purchasing writes use request
replay keys and saved revisions; receipt-versus-cancellation races preserve one
consistent outcome. Administrators can reconcile recorded earlier batches without
changing physical stock. Missing or unsupported historical evidence stays flagged
for records review. Apply PMS migration `0004_partial_receiving` with the updated
portal/API. The latest baseline records 228 passing automated checks and the
production build. S-031 gains supporting evidence and remains unaccepted.

Pharmacy POS/prescription update, 2026-09-15: checkout and dispensing now review
FEFO batch prices and recheck the total when saving. Saved receipts, paged ledgers,
prescription entry, partial dispensing, cancellation of remaining units and
reasoned walk-in sale voids are implemented. Atomic request receipts protect
retries while a form remains open; saved revisions protect competing actions.
The latest baseline records 263 passing automated checks, TypeScript/lint and
the production build. Apply `0005_transaction_recovery` with the updated portal/API.
S-031 remains in progress and unaccepted; browser/device and full reference checks
have not been completed. Payment entries do not issue charges or refunds.

Pharmacy corrections update, 2026-09-16: partial receipt credits now preserve the
original sale and record staff attribution, reason and physical disposition.
Never-collected units restore original batches and reduce verified prescription
counts; customer returns remain outside usable stock and preserve clinical history.
Completed external refunds have their own ledger, remaining-credit limits and
administrator correction of incorrectly entered records. Reports separate sales,
credits and refund settlement. Older prescription links require explicit records
review, including separate allocations when the same medicine appears twice.
Apply `0006_sale_corrections` with the API and portal. See the
[correction contract](api/pms_service.md#receipt-corrections-and-completed-refund-records)
and [latest validation record](COMPLETION_BASELINE.md). S-031 remains unaccepted.
This workflow does not initiate provider payments. The later synchronization
update below adds automatic delivery of pharmacy correction reports.

Pharmacy synchronization update, 2026-09-16: MedApp ingestion freezes the patient
identity and rejects partial or ambiguous prescriptions. Dispensing, both receipt
correction dispositions, cancellation and line reconciliation save full snapshots
with the local transaction. A separate leased worker retries delivery; the receiver
deduplicates event/sequence receipts and preserves newer patient state if reports
arrive out of order. Staff have delivery status and versioned retry controls.
The patient prescription-history route now uses account-scoped real reports with
quantities, returns and report times, separate from medicine-course completion.
Apply `0007_medapp_delivery` and `20260916_0005`; use the
[rollout guide](PHARMACY_SYNC.md) and [validation record](COMPLETION_BASELINE.md).
P-043 and S-031 remain in progress and unaccepted.

Prescribing update, 2026-09-16: verified doctors with explicit patient consent can
save drafts, review and issue, cancel and prepare linked replacements. Patients
see saved clinical records and can export a freshly retrieved text copy. Pharmacy
send/withdrawal commands use durable acknowledgements; a routed original requires
confirmed withdrawal before replacement. This supports S-023/S-024 and
P-042/P-043/P-049/P-050 without accepting a reference. See the
[prescribing contract](PRESCRIBING.md) and [validation record](COMPLETION_BASELINE.md).

Android build preparation, 2026-09-17: the product owner selected Android for the
first live reminder test. EAS variant profiles and a configuration preflight are
implemented, with 28 passing configuration tests. Follow [mobile build setup](MOBILE_BUILD_SETUP.md)
for Expo/Firebase configuration and the phone acceptance record. The local check
still needs the Expo project UUID, reachable gateway URL and matching Firebase
client file. No phone is connected through ADB, no native build was produced,
and the prior Docker repair/preview policy blocks remain unresolved. This adds
no reference acceptance credit.

Next B03/B08/B11 implementation steps:

1. Complete deployed browser and native acceptance for hospital
   staff and profile publication using the recorded checks and required configuration.
2. Finish PostgreSQL migration/concurrency and real-device acceptance for the
   implemented schedule revisions and reminders; complete scanning/verification and an appropriate
   interaction-data integration. Continue real refill/order/delivery contracts
   using the saved clinical prescriptions and pharmacy reports.
   The dashboard, catalog, purchasing/partial-delivery, POS/prescription and
   correction/refund-record workflows now support this work. Supplier returns/
   credits, provider payment/refund reconciliation and recovery after route departure
   or a full browser restart remain to be completed.
   Mobile handoff/return, versioned profile publication and managed photo uploads are implemented.
   Admin assignment and the portal's MedApp session flow are implemented and
   software-verified as recorded above; they still need rendered/deployed acceptance.
3. Reconcile legacy approvals and existing hospital/pharmacy records explicitly,
   including purchase orders or prescription receipts that lack usable historical evidence;
   do not infer ownership or restore revoked memberships from old data.
4. Reconcile the remaining operational HMS repository/API mismatches before B11
   screen acceptance, followed by rendered, accessibility and theme validation.

## 8. Working conventions

Use the established components, shells, typography, color tokens, and theme behavior. Read [BRAND.md](BRAND.md), [MOBILE_UX.md](MOBILE_UX.md), the relevant [API contract](api/README.md), and applicable project instructions before implementation. Reference exports may contain older typography, role navigation, or invented example data; reconcile those with the canonical design system and real service contracts.

Keep route files thin, network plumbing in the shared client/adapters, server state in query caches, and clinical data in the owning service. Read the versioned Expo v55 documentation required by the mobile `AGENTS.md` before writing mobile code.

The original planning pass changed documentation only. Implementation has now started with B00/B01/B02/B03;
the log above records the checks actually performed. It does not certify the remaining services,
device builds, external email/media/payment providers, or deployment.

Planning validation passed: 108 unique screen IDs; all 236 files under `UI_screens` accounted for as screen references, previews, or supporting material; all 53 non-test route entries reconciled; all 6 supplemental HTML references mapped; 355 local documentation links checked. Every specialist entry has the starting status `not_implemented`.
