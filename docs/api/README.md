# API contracts — index and gap register

One row per backend service: whether its contract is documented, whether the app talks to it, and
what is knowingly incomplete. **If you are wiring a service, read its contract doc first; if there
isn't one, writing it is part of the job.**

Standing rules this register exists to serve:
- **Create endpoints only if they don't already exist** (CTO). Twice now a "missing" endpoint turned
  out to be present and merely unrouted or undocumented.
- **Document each logic and the API contract** (Emmanuel Kabu, 2026-08-07).

---

## Status

2026-09-16 clinical update: EHR owns [verified-doctor prescribing](../PRESCRIBING.md)
and [patient medication tracking](../MEDICATION_TRACKING.md). Patient medications
and adherence use `/v1/patients/{patient_user_id}/medications`; they do not use
PMS staff credentials. Earlier gap entries below describe historical audits.
Clinical issuing, patient history, pharmacy handoff and saved dose reports now
have implementation/test evidence. Scanning, interaction providers, reminders
and rendered/reference acceptance remain open.

2026-09-15 pharmacy update: [directory and PMS activation contract](pharmacy_service.md)
documents approved ownership, operator deployment assignment, private directory
reads, MedApp-to-PMS session exchange and trusted stock routing. Per-pharmacy PMS
deployments are independent. Admin assignment and the portal's MedApp/local staff
session flow are implemented, including the verified PMS identity context.
The mobile pharmacy workspace list and deployment-bound handoff/return are
implemented. Versioned owner profile drafts, publication/withdrawal and history
are now implemented, with published services and pharmacist details wired into
the patient screen. Managed photo uploads now save private drafts, normalize images
and serve them publicly only while published. Apply pharmacy migration 20260915_0004
and set the public API origin. Operational and rendered/device acceptance remain pending. Older route/wiring notes below
describe the starting state.

The [PMS operations contract](pms_service.md) now documents live dashboard data,
catalog edits, batch receipts/adjustments, movement history, role permissions,
revision conflicts and request replay. Apply PMS migration `0003_inventory_revisions`
before deploying that API and portal. Purchasing adds migration `0004_partial_receiving`:
versioned drafts, partial deliveries, cancellation of outstanding quantities and
administrator review of earlier batch allocations. Use the current operations
contract for the required request keys and received-date shape. Full B08/B11
workflows remain open.

| Service | Routes | Contract doc | App wiring |
| --- | ---: | --- | --- |
| `inbox_service` | 11 | ✅ [inbox_service.md](inbox_service.md) | Inbox + chat thread wired; practitioner room + AI handoff seeded; **attachment upload live on the backend, client not yet wired** |
| `ehr_service` | 7 | ✅ [ehr_service.md](ehr_service.md) | Overview + **patient record** wired (`getBundle`); **no patient LIST exists, so the roster cannot be** |
| `user_service` | 17 | ✅ [user_service.md](user_service.md) | auth + `/v1/me` wired |
| `booking_service` | 8 | ✅ [booking_service.md](booking_service.md) | booking + appointments wired |
| `doctor_service` | 9 | ✅ [doctor_service.md](doctor_service.md) | Find Care wired |
| `hospital_service` | 7 | ✅ [hospital_service.md](hospital_service.md) | hospital detail wired |
| `pharmacy_service` | 7 | ✅ [directory_services.md](directory_services.md) | pharmacy detail wired |
| `nurse_service` / `pharmacist_service` | 13 | ✅ [directory_services.md](directory_services.md) | discovery lists wired |
| `social_service` | 9 | ✅ [social_service.md](social_service.md) | Feed + post detail wired; **groups, follow and discovery CUT for v1 — see below** |
| `telemedicine_service` | 9 | ✅ [telemedicine_service.md](telemedicine_service.md) | Client verified live; **screens not wired — no video transport exists** |
| `lab_service` | 4 | ✅ [lab_service.md](lab_service.md) | **Lab results screen wired 2026-08-08** — results + server-side search; needs a design gate |
| `notification_service` | 5 | ✅ [notification_service.md](notification_service.md) | Client verified live; **no notifications screen exists** |
| `payment_service` | 6 | ✅ [payment_service.md](payment_service.md) | **No client, by decision** — payments are SIMULATED, no provider integrated |
| `wearable_sync_service` | 5 | ✅ [wearable_sync_service.md](wearable_sync_service.md) | Client verified live; **Lifestyle screens not wired** |
| `onboarding_service` | 8 | ✅ [onboarding_service.md](onboarding_service.md) | Client verified live; **had no container until 2026-08-07** |
| `analytics_service` | 5 | ✅ [analytics_service.md](analytics_service.md) | **No client, by decision** — admin-only, no admin surface in this app |
| `pms_service` | 47 | ❌ | Medications/scripts — not wired; **now reachable at `/v1/pms/*`** |
| `hms_service` | 51 | ✅ [hms_service.md](hms_service.md) | DB fixed, schema applied; **blocked on tenant identity** |
| `api_gateway` | 0 own | ❌ | Proxy only — see gateway gap below |

**"owed"** = the app already calls it, but the contract was never written down. That is a real debt:
those clients were built before the documentation rule and their gaps are recorded only in code
comments, if at all.

---

## Cross-cutting gaps

### The gateway is a silent single point of failure
`api_gateway` has no routes of its own — it proxies via a `ROUTES` prefix table. A service missing
from that table returns `404 {"error":"unknown route"}` **while the service itself is healthy**.
`inbox_service` was missing for months; from the app's side messaging simply did not exist, which
is almost certainly the origin of the false "no messaging endpoints" claim.

**No test can catch this.** Frontend suites mock the client; backend suites call the service
directly. Only an end-to-end call through port 8010 exercises it.

> **Before wiring any service, check it is in `backend/services/api_gateway/app/config.py::ROUTES`.**

#### HMS and PMS are NAMESPACED, and that was not optional (added 2026-08-07)
They are separate products and could not take their own prefixes:

- **`pms_service` mounts `/v1/auth`** — already owned by `user_service`. A duplicate key in the
  `ROUTES` dict does not raise, it **silently wins**, so a naive add would have proxied *every login
  in the product* to the pharmacy system. This was caught before applying, not after.
- **`pms_service` also mounts `/v1/prescriptions`**, which the mobile app already calls.
- **`hms_service` mounts at bare `/v1`**, which would match everything not claimed by a longer
  prefix and turn clean 404s into HMS errors.

So the public surface is `/v1/hms/*` and `/v1/pms/*`, and `_rewrite_path` strips the namespace
before proxying. No service was modified and no endpoint created — only the public address:

    /v1/hms/patients  ->  hms_service  /v1/patients
    /v1/pms/auth      ->  pms_service  /v1/auth

**Verified**: `/v1/auth/login` still returns a `user_service` token (the regression that mattered);
`/v1/hms/*` and `/v1/pms/*` both reach their services.

**Two things a wirer must know:**
1. **`hms_service` 500s** — its container cannot resolve the `postgres` host, so migrations have
   never run. An infra fault, not a routing one, and unfixed.
2. **`/v1/pms/*` returns 401 for a MedApp token.** PMS has its OWN `/v1/auth` and its own identities;
   a patient token is not valid there. Wiring anything to PMS needs a second credential story,
   which is a product decision, not a client detail.

### The `server_default` migration defect
Hand-written migrations that spell `created_at`/`updated_at` as `nullable=False` without
`server_default`. The model mixin declares one, but a hand-written migration never consults model
metadata, so the live column gets NOT NULL and no DEFAULT and every INSERT fails.

Confirmed in **four** services: inbox, hospital, lab (migrations written, **never applied**) and
ehr (fixed 2026-08-07 by `20260807_0002`). **Assume any unwired service has it until proven
otherwise** — it will not show up until the first write.

### Dependency return types are unenforced
`ehr_service` returned a `dict` from `get_current_principal` while every consumer was annotated
`Principal`. FastAPI does not check this, and **the suites mock the dependency, so the mismatch only
existed against the real one**. Worth grepping for in any service before wiring it.

### Payments do not take money
`payment_service` sets `provider_reference = f"{prefix}_{uuid4().hex}"` and stops. There is no
Stripe SDK, no M-Pesa call, no provider client in the service at all — so a payment can reach
`confirmed` without a currency unit moving, and `booking_service` has no payment gate either.

**Nothing in the app should call it until a provider is chosen.** This is the one service where a
plausible-looking client is actively dangerous rather than merely premature.

### A healthcheck can pass while the container is unreachable
`hms_service` was reported HEALTHY by Docker for hours while it could not resolve `postgres` at all.
Its healthcheck polls `127.0.0.1/healthz`, which never leaves the container, so it proved only that
the process was alive.

The container was running and attached to **no network** — `NetworkSettings.Networks` was empty
while `HostConfig.NetworkMode` read `medapp_default`. A stale container from an earlier failed start
was reused by `up -d` and never reattached. `docker compose rm -sf <svc>` then `up -d` fixes it.

**Two lessons:** a healthcheck that does not cross the network boundary is not a readiness signal,
and `up -d` reusing a broken container looks identical to a config bug.

### Two endpoints are safe ONLY because the gateway does not route them
`user_service` `GET /users/{id}` and `analytics_service` `POST /v1/internal/events` are both absent
from `ROUTES` on purpose. The analytics one takes **no principal at all**, so adding it to the table
would create a public unauthenticated write into the analytics store — anyone could forge booking
and payment events, and those numbers are what the business reads.

Treat `ROUTES` as a security boundary, not a convenience list. Adding a line to it is a decision.

### One service had no container at all
`onboarding_service` exists on disk and the gateway routes `/v1/onboarding` to it, but it was the
only one of the twenty services missing from `docker-compose.yml`. Every call failed at DNS inside
the compose network. Added 2026-08-07 on host port 8022.

**Standing check worth running:** diff `ls backend/services` against the compose service list. One
command, and it would have caught this at any point in the last several months.

### A stale image looks exactly like a broken migration chain
`telemedicine_service` failed `alembic upgrade head` with
`Can't locate revision identified by '20260805_0003'`. The revision file existed in the repo; the
running container held only 2 of the 4, because the image predated it. A rebuild fixed it.
**Check the container's `alembic/versions` before debugging the revisions themselves.**

### Alembic env.py path assumptions
`wearable_sync_service` computed `BACKEND_DIR = BASE_DIR.parents[1]`, which raises `IndexError`
inside the container (the service lives at `/app`, so there is no second parent). Its migrations had
therefore **never run in Docker** — the service had no tables at all. The repo checkout has enough
depth, so it only failed where it mattered, and only surfaced when the service was actually started.

Worth grepping the other services' `alembic/env.py` for the same `parents[N]` assumption.

### Seed coverage
`scripts/seed_dev_data.py` covers users, doctors and bookings. It does **not** cover EHR content,
threads, labs, prescriptions or social. Expect empty states, and be careful that "empty" is not
rendered as "lost".

### Host-port collisions caused by the override file itself
`docker-compose.ports.yml` moves ports to dodge other projects, but three of its choices landed on
ports MedApp services already publish: `api_gateway` 8010 vs `ehr_service`, `ehr_service` 8020 vs
`hms_service`, `user_service` 8011 vs `social_service`. Each only surfaced when the two services
were first started together. The file now carries the rule: **an override host port must not be a
port any base service already publishes** - list every effective host port before changing one.

### The RabbitMQ startup race — FIXED 2026-08-07, and the fix needed two attempts
Every publisher connects to RabbitMQ **once**, at startup. `connect_failed` is swallowed,
`app.state.event_bus` stays `None`, and `publish()` then becomes a **silent no-op for the life of
the process**. No reconnect, no health signal. A service that boots first stops publishing until
someone restarts it — which is exactly what made the first profile-rename test do nothing.

Two things were wrong, and the first fix alone did not work:

1. **RabbitMQ had no healthcheck at all**, so `condition: service_healthy` had nothing to wait on.
   The best any service could declare was `service_started`, which means the container process
   launched — not that AMQP accepts.
2. **`rabbitmq-diagnostics ping` is not sufficient**, and this was measured rather than assumed.
   It reports the Erlang node answering, which happens BEFORE the AMQP listener binds. With `ping`
   compose declared the broker healthy and `user_service` still took `ECONNREFUSED` on a cold
   start. `check_port_connectivity` tests the listener clients actually dial.

All 12 broker-using services now declare `rabbitmq: condition: service_healthy`. Note that a LIST
form (`depends_on: [rabbitmq]`) carries no condition and silently means `service_started`, so it is
the race spelled differently — two services had exactly that and were converted.

**Verified**: containers removed, cold start, **zero** `connect_failed` and zero subscribe failures,
and a `PATCH /v1/me` rename propagated to the denormalised snapshots with no manual restart.

### The runtime half — FIXED 2026-08-07 (the compose fix alone was not enough)
Compose ordering does not exist in Kubernetes, and it does nothing for a broker that restarts while
a service is up. Both halves are now closed:

- **`EventBus._ensure_connected()`** — `publish()` connects on demand if it never connected, or if
  the connection has since closed. `aio_pika.connect_robust` already recovers a connection it has
  ALREADY made, so the genuine hole was a connect that never succeeded once. After the first
  success this is two attribute reads.
- **Services keep the bus on a failed connect** instead of storing `None`. Storing `None` was what
  made the failure permanent: `publish()` was never reached again, so there was nothing to retry.
- **`publish()` no longer asserts it is connected.** An assert turns a recoverable broker blip into
  a 500 on whatever request happened to be publishing, and asserts vanish under `-O`.

**Verified the hard way**: `user_service` was started with RabbitMQ deliberately DOWN (it logged
`connect_failed`, as expected), the broker was then brought up, and a `PATCH /v1/me` rename
propagated to the denormalised snapshots **with nothing restarted**. The anonymity guard held
throughout.

### Subscribers retry too — FIXED 2026-08-07
The publisher self-heals because every `publish()` is a fresh chance to connect. A subscriber has no
such opportunity: it connects once and then only receives, so one failed attempt meant silence for
the process lifetime with nothing to signal it.

`social_service` now subscribes in a BACKGROUND task with exponential backoff capped at 30s. Two
properties worth keeping if this is copied:

- **Startup is never blocked.** Awaiting the retry loop would couple API readiness to the broker —
  a down broker would hold the service in startup instead of serving a feed that reads from
  Postgres and needs no RabbitMQ at all.
- **Backoff caps rather than growing without bound**, so a broker returning after an hour is picked
  up within the minute.

The task is cancelled on shutdown and `CancelledError` is re-raised, not swallowed — swallowing it
hangs shutdown.

**Verified**: `social_service` was started with RabbitMQ DOWN. It logged retry attempts, served
normally, and subscribed unattended on the 6th attempt once the broker came up. A `PATCH /v1/me`
rename then propagated to the snapshots **with nothing restarted on either side**, anonymity guard
intact.

**When a second consumer appears, move the retry loop into `shared/events`.** It lives in
social_service only because it is the codebase's single subscriber; copying it into a second
service is the moment to promote it.

### Local stack
- `make up` / `make seed` ignore `docker-compose.ports.yml` (both hardcode one `-f`). On a machine
  where another project holds 5432 they fail, and `make seed` tears down running containers. Pass
  both files explicitly.
- The `COMPOSE_FILE=a:b` form is POSIX-only; on Windows the colon is read as part of the drive path.

---

## Per-service gaps already recorded

**`inbox_service`** — no message preview, unread count or counterparty on `ThreadOut` (three
additive fields would fix all three, no new route); no presence, join events or delivery receipts.
`last_message_at` is set at creation, not first message. `sender_role` is coarse ("user"), so group
attribution reads wrong. **Attachments closed 2026-08-08** — multipart upload, per-thread
authorisation and a `duration_ms` for voice notes are live and verified through the gateway; the
composer (`useComposerMedia.ts`) is still device-local and has to be wired. Storage is a local
volume, which means **this service cannot be scaled horizontally** until it moves to object storage;
staged-but-never-sent attachments are never reaped. Both are in the contract doc's explicit
"what was NOT built" list.

**`social_service`** — the Community feature shipped a group catalogue, a specialist directory and a
follow graph, none of which exist in the backend in any form. All of it was cut on 2026-08-07; the
inventory is below so nothing is lost by deletion.

**`ehr_service`** — `GET /v1/patients` 404s, so **there is no patient LIST anywhere in the backend**;
the three working routes are addressed by a single user id and answer "tell me about this patient",
never "who are my patients". Path param is a **user** id despite its name. `kind` is free text,
`value` is a string, and **no reference ranges, bounds or units-with-meaning are stored** — see the
clinical-screens cut below. No seeded content. `PatientBundleOut` is `patient + vitals + consents`
only: no demographics beyond a display name, no ward, no admission, no episode, no clinical notes.
Consent create/delete intentionally unwrapped — legally weighted, needs a designed flow.
**Patient-record is now wired** (`getBundle`); the roster is not, and cannot be.

**`notification_service`** — no read/unread state of any kind. `InboxMessageOut` carries
`{ delivery_id, event_id, event_type, title, body, channel, status, delivered_at }`; `status` is
DELIVERY status and documented as free text, and `delivered_at` is when the server sent it. Nothing
records whether the **patient** has seen a message, so an unread badge cannot be computed. See the
patient-home cut below for the three fields that would fix it.

**`wearable_sync_service`** — ingest is device-shaped only. `POST /v1/wearables/sync` takes a
`deviceId` and a batch of samples; there is **no manual-entry route**, so a patient cannot log a
night's sleep or a workout from the app. No goals or targets are stored either — nothing anywhere
holds "8,000 steps", so any denominator on a progress row is client-side invention.

**No content service at all** — there is no insights, articles or health-tips endpoint in any
service, and no plan to route one. Every "health insight" card in the app was JSX.

**`booking_service`** — **no availability route.** The gateway's `ROUTES` has no availability key and
the service exposes only `POST/GET /v1/bookings`, `GET /v1/bookings/{id}` and
`POST /v1/bookings/{id}/cancel`. So the slot grid the patient picks from is a bundled constant while
the booking it produces is real. Also **no reschedule route** (already noted below), no
consultation-TYPE column (the type the patient picks is discarded at the boundary), no facility on
`BookingOut`, no pending/"in review" status, and no booking reference — `BookingStatus` is
`booked | cancelled` and nothing else. See the booking-flow cut below.

**`doctor_service`** — **`consultation_fee_cents` has no currency column.** The amount is an integer
in minor units with nothing on the wire naming the unit, so every render of a price in this product
assumes `"GHS"`. That assumption is isolated to one helper and flagged there, but it is an
assumption, and it is wrong the moment a clinician bills in anything else. Also no presence/
availability signal of any kind, and no `/v1/doctors/specialties` list.

### What the patient-home fabrication cut removed (2026-08-08)

`HomeScreen` issued **zero network requests** and `PatientDashboardScreen` issued zero as well. The
only true value on either was the greeting's first name; everything else was a module-level literal,
and several of those literals were statements about the patient's body.

The screens are not comparable, so the two rulings differ:

**`patient-dashboard` is DELETED — screen, route, feature folder and test.** The evidence, all of
it pre-existing and flagged in place across three prior migrations:

- **It was reachable by nothing.** A route audit found exactly one reference to
  `/(app)/patient-dashboard` in `src/`: the gitignored preview harness `app/(public)/zpdb.tsx`,
  which is itself a temporary capture tool. The screen's own header said so, its route file said so,
  and its test file said so. Its back button had a Home fallback specifically because there was no
  history to pop.
- **The IA question was never answered.** Its header opened with a FLAG saying the frame duplicates
  `HomeScreen` in purpose while the shipped `overview` tab already points at a different, built
  screen — and asked for a PM/lead call that never came, through three chrome migrations.
- **It fabricated a clinical ALARM.** BP `138/90` badged *"Above your target range"* in error tone,
  next to HR 72, SpO2 98% and the sentence *"You have 1 appointment today and vitals are stable."*
  Nothing in this app has ever read a vital. An out-of-range badge on an unmeasured number is the
  most dangerous string the codebase contained.
- **Nine of its ten controls were dead**: Join Call `onPress={() => {}}`, Read More
  `onPress={() => {}}`, a FAB that was a plain `<View>` styled as a button, four Quick Action tiles
  whose component took no `onPress` prop, and two document rows whose component took none either.
- It also disagreed with Home about the same "next appointment" — *"Dr. Sarah Chen"* here,
  *"Dr. Adjoa Boateng"* there. Both were invented.

Nothing shipped is lost by the deletion: every section it drew exists live elsewhere (appointments
on Home and `appointment-management`, vitals trends on `overview`). To restore it as a screen would
need the IA call first, then an `ehr_service` vitals read with seeded content, then a documents
endpoint — none of which exist. Its one reusable asset, the shared `VitalStatCard`, already lives in
`components/ui` and is untouched.

**`HomeScreen` is WIRED where a source existed and CUT where none did:**

| Removed | Why | To restore |
| --- | --- | --- |
| *"Your blood pressure readings look steady this week — great progress on your care plan."*, quoted and attributed to **MedAI** | a fabricated clinical inference presented as a system that had analysed the patient, on a screen with no vitals request | a vitals source (`ehr_service`, seeded) **and** a real inference service; the slot now holds a plain invitation to the assistant |
| "Why this?" / "Dismiss" trust row | the transparency controls for that inference — both dead Pressables guarding nothing once it went | returns unchanged with a real model output |
| Whole "Your Health Insights" section — *"Morning breathing improves your HRV"*, its body copy, its category chip, its licensing-placeholder image tile | invented article, no content service anywhere | a content/insights endpoint |
| "Log Sleep" / "Log Activity" tiles | the `InputTrigger` component took **no `onPress` prop at all**, so they could not have been wired; there is no manual-log route to wire them to | a manual-observation route on `wearable_sync_service` (or a new observations endpoint) |
| Step goal — the "/ 8,000" in "6,240 / 8,000" | nothing stores a target | a goals field on the user profile or wearable summary |
| Quick Services "View All" | `actionLabel` passed with no `onAction`, so it rendered a button-role link with `onPress={undefined}`; there is no all-services screen to point it at | n/a — the strip is every service |
| Bell unread badge + `unreadCount` on `PatientAppBar` and `PatientShell` | the branch could never fire: no screen passed a count, and no read state exists on the wire | `read_at` on `InboxMessageOut` (server-owned, survives reinstall), `POST /v1/me/inbox/{delivery_id}/read` plus a mark-all, and either `unread_count` on the list envelope or `GET /v1/me/inbox/unread-count`. De-duplicate on `event_id`, not `delivery_id` — push and in-app deliveries of one happening count once |

Wired instead of cut, using endpoints that were already live and already adapted:

- **Upcoming appointment** — `GET /v1/bookings` via `appointmentsApi.listAppointments()`. Home now
  scopes its query by user and session revision; the `appointments` invalidation prefix still
  refreshes it after booking changes. This replaces the invented clinician, the literal `"Tomorrow, 10:30 AM"` (which never
  became yesterday) and a fixed "Virtual" badge that told every patient their clinic visit was a
  video call. Join Call now carries the **room** id as `sessionId` — it previously sent the
  appointment id under that name, which the waiting room resolves to no room.
- **Sleep and Steps** — `GET /v1/wearables/summary` through the shared `dailyTotalFor`, so this
  screen inherits the PO's cumulative-latest-per-device rule rather than re-deriving it. A figure
  with no reading for today is **not rendered**; a zero would claim the patient did not move.

As of 2026-09-13, Home separates appointment/wellness loading, retry and empty states; it refreshes
on focus, resume and pull-to-refresh. **Labs, Vitals and Records** now open the existing lab list,
the new patient vitals timeline and a medical-records navigation hub. The timeline preserves
recorded values/units/notes and uses consent-enforced cursor paging. **Pharmacy** remains a
non-interactive tile while directory/partner work is pending B11. Documents, uploads and full
medical history remain B07; no specialist screen is accepted by these patient changes.

### What the overview / profile / scripts / lifestyle fabrication cut removed (2026-08-08)

Four more patient surfaces were presenting constants as the signed-in user's own clinical record.
Two of the defects were live safety problems rather than cosmetic ones, and they set the standard
for the rest of the pass:

- **"Send Now" told a patient their prescription was at the pharmacy.** `ActiveScriptShareScreen`
  ran `setTimeout(…, 1500)` and opened a modal reading *"Your prescription has been securely
  transmitted to the pharmacy. You will receive a notification when it's ready for pickup."* There
  was no request, no pharmacy integration, no notification pipeline and no failure branch. The
  patient travels to a pharmacy that was never told anything; delay in dispensing an
  antihypertensive is direct clinical harm.
- **The profile's emergency-contact number was a live `tel:` link to a 555 number.** A user in a
  real emergency taps the one control on that screen that has to work and reaches nobody.

The standing rule applied throughout: a fabrication is **deleted**, not relabelled. Where a
capability is genuinely wanted and absent, the screen says so in words (the pattern
`PatientRecordScreen`'s `ActionInfoSheet` already uses) rather than shipping a greyed control, which
still asserts the product can do the thing and is merely busy.

| Removed | Where | Why | To restore |
| --- | --- | --- | --- |
| Quick Send pharmacy list (CVS, Walgreens, "0.8 miles away"), "Send Now", the 1.5s fake transmit and the "Script Sent!" modal | `ActiveScriptShareScreen` | no route in any service transmits a prescription; `pharmacy_service` is a **directory**. The two chains are US brands in a Ghana-seeded product | a dispense/transmit endpoint plus a pharmacy partner integration, and a real failure state |
| "One-Time QR" hero, the 5:00 countdown and the QR dialog | `ActiveScriptShareScreen` | the "temporary, encrypted, one-time" code was a **static remote PNG** — identical bytes for every user and every script, forever | a signed short-lived token endpoint and a QR renderer (no QR library is a dependency) |
| "HIPAA Compliant • 256-bit AES Encryption • Clinical Grade Security" footer; "IDENTITY VERIFIED" badge; "SECURE SCRIPT" chip | `ActiveScriptShareScreen` | unbacked regulatory and security assertions in shipped UI | an actual compliance position, which is a legal question and not a UI one |
| Unconditional "Verified" chip; "Signature QR code"; "Digitally signed, timestamped, and end-to-end encrypted"; the `SHA-256: f1e2d3c4b5a6…` stub; the "MEDAPP SECURE" watermark | `ActiveScriptViewScreen` | nothing signs, stamps or encrypts this document. `lib/documents/builders.ts` had already refused to copy the hash into the exported file for exactly this reason; the screen now agrees with its own export | a prescription-signing service and a verifiable hash |
| "Send to Pharmacy — Directly integrate with local CVS or Walgreens", "One-Time QR" and "Print Script" option cards; the "Print Script" and "Copy Clinical Link" rows | both script screens | two advertised capabilities that do not exist, and three controls with no `onPress` | as above, plus a print pipeline (`expo-print` is not a dependency) and a clinical-link endpoint |
| Eighteen `params.X ?? "<clinical constant>"` fallbacks — patient "Alex Rivers", DOB 12/05/1988, licence MD-99283-A, "Hypertension management", 30 Tablets, 3 refills, "Central Cardiology Center", the Rx number, "Dispense as written", "Patient to monitor BP weekly" | both script screens | a partial deep link rendered a coherent-looking prescription blending the caller's fields with fabricated ones, with nothing on screen to tell them apart. The five core fields are now required (missing → not-found state); the eight optional ones render only when passed | nothing to restore — a caller supplies them or the screen omits them |
| `TREND_METRICS` — BP 118/76, HR 72bpm, sleep 7.2h, hydration 1.8L, and a week of sparklines | `OverviewScreen` | `useQuery` destructured only `data`, so **loading, error and empty were one `undefined`** and all three drew this constant. A patient checking readings during a backend outage saw confident wrong numbers and could export them to a file | nothing — `GET /{userId}/summary` is wired, and the three states are now separate |
| `MED_DOSES` (Lisinopril 10mg taken / Atorvastatin 20mg not taken), `MILESTONES` ("BP stabilized to 120/80 within 7 days"), `DEVICES` (Apple Watch Ultra "synced 2m ago"), `SCRIPTS` (two active prescriptions) and the "Health Insight" card ("sleep quality improved by 12%") | `OverviewScreen` | all module constants, and the first three were **written into the exported health report** — a fabricated medical record in a file the patient can forward to a clinician | `pms_service` for medications and scripts (namespaced at `/v1/pms/*`, and 401s for a MedApp token — see above); `wearable_sync_service` for devices; nothing exists for milestones or insights |
| `PROFILE_PHOTO_URI` | `OverviewScreen` | a remote photograph of a stranger rendered as **every** signed-in user's avatar | nothing — the shell resolves photo → initials → silhouette from the auth store |
| "Export" quick action | `OverviewScreen` | no `onPress`, ever. Wiring it to the same summary would have made two buttons producing identical files under different promises | an EHR export route |
| Patient ID MED-208471, a fictional verified email, phone, Austin TX address, DOB, sex, **blood type O+**, age, weight, PCP "Dr. Sarah Chen", emergency contact "Maria Davis" and its `tel:` link | `PatientProfileOverviewScreen` | These were fictional values displayed beside a real account; the invented blood type and emergency number were especially unsafe. As of 2026-09-13, `/v1/me` restores saved DOB, gender, self-reported blood type and primary health goal, which the profile displays and its editor can update. Missing values remain explicit. | Real address/weight/provider data and an emergency-contact field with its own edit flow; no fabricated fallback values |
| Steps / Heart Rate dual-line chart and "15% more active this week" | `PatientProfileOverviewScreen` | normalised 0–1 constants with no unit and no source | a vitals or wearables series with real units |
| "Share Records", "Edit Profile", the camera "Change profile photo" FAB | `PatientProfileOverviewScreen` | These controls were removed as no-ops. As of 2026-09-13, Edit profile opens a real patient editor using `PATCH /v1/me` for name parts and optional personal details, with confirmed save/readback. | A share destination and a separately implemented avatar upload/storage flow; `/v1/me` does not support avatar updates |
| `SEED_MEDS` — "Lisinopril 10mg, 8:00 AM, Taken" with a "2 of 3 taken" counter and a working "Mark Taken" | `LifestyleHubScreen` | a **named prescription list** with an adherence state, which a patient could read as their own regimen. Adherence is exactly what a clinician asks about | `pms_service`, as above |
| `NUTRIENTS` (1,850 kcal / 85g protein / 1.1mg B2), the `MOOD` series, `WATER` ("Today: 2.1L"), the 150/200-minute activity ring, and the Day/Week/Month control whose `range` nothing read | `LifestyleHubScreen` | constants no action could change — logging 3.4L of water on the Manage screen left the Hub reading 2.1L | a lifestyle-log service; none exists |
| The sticky "Save & Close" FAB | `LifestyleManageScreen` | `onPress={() => router.back()}`. Sleep, water, workout, mood and stress lived in `useState` and were discarded on dismiss. A control shaped, labelled and tick-glyphed like a save **is** a claim the data was recorded | a lifestyle-log write endpoint |
| The AI Meal Planner card: the prompt field, "Generate with AI", the canned "Grilled Salmon & Quinoa" recommendation with its "Based on your intense morning workout…" reasoning, the ingredient chips, and "Upload Food Photo" | `LifestyleManageScreen` | fabricated **dietary advice attributed to an analysis of the patient**, referencing a workout the app has never recorded. The photo upload had no `onPress`, under the caption "AI will identify ingredients automatically" | a meal-planning model behind a real endpoint, and an image picker (none is a dependency) |

**Wired in the same pass, because it was already written and never called:** `ehrApi.listVitals()`
(`GET /v1/patients/{userId}/vitals`) now backs the Overview sparklines, filtered by the 7D/1M/3M/1Y
control — which previously set state nothing read. Two consequences worth knowing for anyone else
charting these: `value` is a **string** and blood pressure arrives as `"122/80"`, so those readings
get **no** sparkline rather than a silent systolic-only chart; and a metric with fewer than two
numeric points in the window draws nothing, because one dot is not a trend.

**Kept, and why it is legitimate:** `LifestyleHubScreen`'s sleep chart still falls back to a sample
week when no device has reported — but it renders *"Sample data — connect a device to see your own
sleep"* underneath. That label is the entire difference between a fallback and a fabrication, and it
is the pattern the other cards on that screen failed to follow.

**Two screens are now reachable only by deep link.** `active-script-view` and `active-script-share`
were reached from the Overview's Active Scripts card, which was the deleted `SCRIPTS` constant. They
render their not-found state without params, and they regain an entry point when `pms_service` is
wired and a real prescription list exists.

**A correction to the brief this pass worked from:** it referred to shared `EmptyState`, `ErrorPanel`
and `SkeletonCard` components in `src/components/ui`. There are none — `EmptyState 517:1773` and
`ErrorPanel 517:2111` are approved in Figma and **uncoded** (docs/PIPELINE.md §5), and several
screens each carry a private copy. The Overview panels follow that existing precedent rather than
promoting the components under a fabrication fix;
`features/care/components/FacilityStatePanels.tsx` sets out the reasoning at length.

### What the Community cut removed (2026-08-07)

The screen was a three-tab browser — "For You / Explore / Community" — and two of the three tabs
were **entirely** unbacked. `social_service` has posts, comments, Q&A, reactions and moderation. It
has **no group table, no membership table and no follow edge**, so every count, every Join and every
Follow on those panels wrote to a `useState` and nothing else: a tester who joined a group and
reopened the app had never joined anything.

Two whole files were deleted (`ExploreScreen.tsx`, `CommunityHubScreen.tsx`) and with them both
tabs, which left one panel — and a segmented control with one segment is chrome pretending to be a
choice, so the tab bar went too. **The bottom-nav Community tab is unaffected**; it lands on the
feed, which is what it always did.

Removed, all user-visible unless noted, with what each would cost to restore:

| Removed | Where | Why | To restore |
| --- | --- | --- | --- |
| Suggested Groups carousel, `GroupCard`, Join/Joined, member counts, "View All" | CommunityScreen | no group or membership table | group + membership tables, `GET /v1/social/groups`, `POST/DELETE .../membership` |
| Community Hub panel: group catalogue, category filter, My Groups, Discover, per-group search, "3 New Posts", group 3-dot menu | CommunityHubScreen (deleted) | same, plus the search filtered an in-memory array and the unread badge was a literal | as above, plus a per-group unread count and a per-group timeline |
| Explore panel: trending hero, Top Specialists to Follow, Follow/Following, Profile button, trending topic chips, Suggested Community card | ExploreScreen (deleted) | no follow graph, no trending signal, no discovery endpoint; the search box filtered nothing and four Pressables had no `onPress` | follow edges + `GET /v1/social/following`, a discovery/search route, and a trending computation |
| "Recommended for You" banner | CommunityScreen | literal JSX, no recommender behind it | a ranking service; the feed endpoint returns chronological posts only |
| "Following" tab | CommunityScreen | removed earlier for the same reason; recorded here for completeness | follow graph |
| Post media band + "Medical Journal" provenance badge | CommunityScreen `PostCard` | `PostOut` has no image field; the badge asserted a source | an attachment/media field on the post schema |
| Post inline "Key Differentiator" info card | CommunityScreen `PostCard` | no structured-callout field on `PostOut` | a typed content block on the post schema |
| Post author avatar photo | CommunityScreen `PostCard` | nothing stores a patient or clinician avatar; two seeded doctors shared one stock photo | an avatar URL on the user profile; `AvatarWithFallback` renders initials until then |
| Verified tick beside every byline | CommunityScreen `PostCard` | no verification field on `PostOut`, and patients publish to this feed too — it decorated every author with a trust claim the backend never made | a `verified` / credential flag sourced from `user_service` |
| Post "More options" 3-dot | CommunityScreen `PostCard` | dead control, no `onPress` | returns with the report/delete wiring, which is the next step |
| "Practitioner Insights — verified health professionals" heading | CommunityScreen | `GET /v1/social/feed` takes no author-role filter and returns patient posts too | an author-role filter on the feed endpoint |
| Hardcoded feed posts (3 invented articles by seeded doctors) | CommunityScreen | the live feed had already replaced them; the const was orphaned | n/a |

**Still local-only and knowingly so:** the post Like and Bookmark controls hold `useState` and
persist nothing. `reactToPost` exists in `api.ts` and is deliberately unwired pending the next step;
there is no bookmark route at all.

**Unused but retained in `api.ts`:** `reactToPost` (next step), `listQA` and `askQuestion` (real,
working routes with no screen yet), `createPost` (no composer screen).

**Two real fields the feed card still drops:** `post.title` and `post.excerpt`. The card renders
`body` only, which is a hangover from the mock — the mock had no title. Adding them is an addition,
not a removal, so it was left for the screen's next pass rather than folded into a deletion.

### What the booking-and-appointments honesty pass removed (2026-08-08)

Unlike the two cuts above, **this flow is mostly real**: `POST /v1/bookings` works end to end and a
booking made in the app appears on the appointments screen. That is exactly what made the
fabrications here dangerous rather than merely cosmetic — a fake slot, a fake fee and a fake
practitioner all fed a live medical write.

**Two dead controls were WIRED rather than removed**, because the endpoint existed the whole time:

- **Cancel appointment.** `AppointmentManagementScreen` had `onPress={() => { /* TODO: hook into
  DELETE /v1/appointments/:id once ready. */ }}`. That route does not exist and never did, while
  `POST /v1/bookings/{id}/cancel` does and `appointmentsApi.cancelAppointment` was already written
  against it and had **never been called by anything**. A patient pressed Cancel, got no feedback,
  and assumed it worked; the booking stayed `booked` and a clinician held the slot. Now a
  confirmation dialog, a real mutation, `invalidateQueries(["appointments"])` and a visible error
  branch.
- **Reschedule.** The push omitted `practitionerId` entirely, so the review screen's required-params
  guard fired and the patient — having already chosen a date, time, mode and type — was told *"This
  booking session has expired."* The id was on the object all along for the telehealth handoff. The
  shipped test asserted name/specialty/avatar and never the id, which is how it stayed green.

**Reschedule is implemented as book-then-cancel, and it is not atomic.** There is still no
reschedule endpoint (see "Debt paid" below, which already recorded this). The order is deliberate:
cancel-first can leave a patient with **no** appointment when the new slot is taken mid-review, while
book-first can only leave a duplicate — visible on the next screen, in a list with a working Cancel
on every row. A failed second call is carried to the confirmation screen and stated there, never
swallowed. **An atomic `PATCH /v1/bookings/{id}` would delete this entire construction.**

Removed, all user-visible, with what each would cost to restore:

| Removed | Where | Why | To restore |
| --- | --- | --- | --- |
| "Secure encrypted checkout" footnote + padlock | `ReviewAppointmentScreen` | there is no checkout: no payment step, no amount, no card, no `payment_service` call — and no provider integrated behind it | a payment provider first (see "Payments do not take money"), then a real checkout step |
| "a $10 processing fee may apply" | `ReviewAppointmentScreen` cancellation policy | a financial term stated to a patient, sourced from a string constant, in the wrong currency for a GHS product | a cancellation-fee field on `booking_service` |
| `SEED_CLOSED_STRIP_INDEX = 3` | `use-booking-availability` | closed the 4th day of every strip for every clinician — an invented day off | `GET /v1/slots` |
| "From provider" provenance badge on Duration | `ReviewAppointmentScreen` | the value is derived from `SEED_SLOTS`, a bundle constant; the badge certified a provider that had said nothing | `GET /v1/slots`, at which point the badge is true |
| "See Calendar" (header) and "See calendar" (no-slots) | `SelectTimeSlotScreen` | `openCalendar` was `() => {}`; the second was the **only** escape the empty state offered | a full-month picker frame and route (neither exists) |
| "Try again" on the provider profile | `PractitionerTelehealthProfileScreen` | called `setState("default")` on a screen that issues no request — it manufactured the appearance of a recovery | Implemented 2026-09-13: real doctor/nurse/pharmacist single-resource profile queries, retry and refresh. Route display values are ignored. |
| `DEFAULT_PROVIDER` — "Dr. Julian Sterling, Cardiologist" | `PractitionerTelehealthProfileScreen` | a **named fictional clinician, bookable**: any param-less arrival rendered him under a live dock that pushed `julian-sterling` into a real `POST /v1/bookings` | nothing — it must not return; the screen now renders a no-data state |
| "Available Now" and "Nearest" facets | `FindCareScreen` | matched badge substrings no adapter emits, so either one emptied the directory into "No matches" and blamed the user's filters | a presence signal / a distance field |
| "Specialty" picker trigger (and its `PickerTrigger` component) | `FindCareScreen` | a chevron promising a menu, empty `onPress` | Implemented 2026-09-13: specialty text filters use the existing doctor/nurse/hospital query contract; no fabricated specialty catalogue is required. |
| Message button on every provider card | `FindCareScreen` | empty `onPress`; also not a small job — `inbox_service` keys threads on a **user** id and a directory entry carries a **profile** id, with no resolution between them | a profile-id → user-id lookup, then thread creation |
| Presence dot + `"<name> is online"` label, and `AvailabilityTone` | `FindCareScreen` / `care/types.ts` | every adapter hardcoded `availability: "online"`; the `busy`/`away` branches were unreachable by construction | any presence source at all — there is none |
| `PLACEHOLDER_AVATAR` | `care/api.ts` | a photograph of a real stranger substituted for every null `photo_url`, repeated down the directory over other people's names | nothing — `AvatarWithFallback` draws initials, which is what BRAND §App shell already required |

**Added, not removed — `consultation_fee_cents` now reaches the patient.** It has been on
`GET /v1/doctors` the whole time and `adaptDoctor` discarded it, so a patient confirmed a medical
appointment without ever being shown its price. It now travels directory → profile → slot picker →
review as minor units, and exactly one place divides by 100.

**The currency could NOT be sourced.** `DoctorProfileOut` has `consultation_fee_cents` and **no
currency column anywhere in `doctor_service`**. The review screen reuses the existing
`consultationFee()` helper in `features/practitioner/format.ts`, which already carried this flag and
already assumes `"GHS"` from the frame and the seeded Accra/Kumasi roster — reused deliberately, so
there is one unsourced assumption in the codebase rather than two. **It will be wrong the first time
a clinician bills in anything else. The fix is a `currency` column on the doctor profile.**

**Availability is still 100% fabricated and is now labelled as such.** `/v1/slots` does not exist,
so the slot grid remains `SEED_SLOTS` while `POST /v1/bookings` is real — patients can still book
times no clinician offered. The grid carries a visible notice saying the times are not confirmed
with the clinician, driven by an `isProvisional` flag on the payload so the real endpoint deletes
the notice rather than someone having to remember. **This is a mitigation, not a fix.**

---

### What the clinical-screens cut removed (2026-08-08)

Four screens that render medications, vitals, prescriptions and patient records were rebuilt so that
nothing on them asserts a clinical fact the backend did not supply. **Fabricated clinical data on
these screens is a patient-harm risk, not a cosmetic defect**, so the bias throughout was deletion
over decoration. The inventory is here so nothing is lost by removing it.

#### The defect worth naming first

`ActiveMedicationsScreen` computed its list, its loading flag and its error flag from three
unrelated pieces of state, and rendered the empty state whenever the list was empty and loading was
false. `hasError` was a separate `useState` that no data path ever set. **Swapping the local constant
for `useQuery(...).data ?? []` — the obvious one-line wiring — would have rendered a 500 as
"No active medications. Ask your clinician to share a prescription."** `PatientRecordScreen` had the
same shape: `record` was `undefined` on any failure and rendered "This record may have moved, or you
may not have permission to view it" with `state` still `"ready"`.

Both now derive state in ONE exported, directly-tested function from ONE query object
(`medications/state.ts`, `PatientRecordScreen.deriveState`). The rule in both: **`isError` is tested
before `data` is looked at, and not-found requires an explicit 404.** No argument combination yields
"empty" or "not found" from a failure.

| Removed | Where | Why | To restore |
| --- | --- | --- | --- |
| 14 fabricated patient records — names, ages, wards, conditions, clinical notes | `roster2/mock-data.ts` (deleted) | no patient list exists anywhere; `GET /v1/patients` 404s and the three working EHR routes take a single user id | a clinician patient-list route, plus ward/admission data that only `hms_service` could own |
| An invented critical alarm (HR 126 / BP 160/98 / SpO₂ 91%) in a red tile, **contradicting the same patient's record screen** (SpO₂ 98%, normal) one tap away | `roster2` | two fixtures disagreeing about one patient | as above |
| 12 of 14 patients sharing one byte-identical vitals triple (HR 76 / BP 124/78 / SpO₂ 98%) | `roster2` | a roster scanned for outliers was showing a constant | as above |
| Roster search, ward/condition/sort filter sheet, priority-vs-latest sort, "Needs review"/"Critical" chips | `ActivePatientRoster2Screen` | filters over invented rows; the "Active" and "All" scope chips were identical and there was no `active` branch at all | a patient-list route with triage + workflow fields |
| "Confirm intake" → "Marcus Chen is now in your active care roster", and its **unconditionally-succeeding** "Try again" | `roster2` | no referral or intake route exists; a retry that cannot fail | a referral/intake resource with accept + decline |
| "Review now" → "{Name}'s critical-care review was recorded" | `roster2` | no request and no intermediate step — the button WAS the confirmation | a clinical-review resource |
| Confirm discharge → "Discharge saved — removed from the active roster" | `PatientRecordScreen` | nothing was sent, no roster changed, and re-entering showed the patient still admitted | an admission/episode model with a discharge transition (`hms_service` territory) |
| Care timeline card: 3 entries, an attachment chip (`Blood_Panel_V4.pdf`), and "Consultation · Dr Miller" — **a clinician not in the dev seed** | `patient-record/mock-data.ts` (deleted) | `PatientBundleOut` is `patient + vitals + consents`; there are no clinical notes, encounters or documents | an encounter/note resource, plus a document store |
| Patient age, ward, patient code (`PT-8821`), "Needs review" badge, "Reviewed 2h ago", clinical summary paragraph | `patient-record` | none of these are on the bundle; all were fixture | demographics + ward + triage on the EHR patient model |
| `DEFAULT_PATIENT_RECORD_ID = "amina-mensah"` — **an absent id resolved to a specific named patient's chart** | `patient-record/mock-data.ts` | a link naming nobody opened somebody | n/a — an absent id now renders not-found |
| "Updated 2 min ago" (always), "Showing saved clinical data from 09:42" | `PatientRecordScreen` | literals; there was no cache and no 09:42 | now derived from the newest vital's `recorded_at` |
| `providerName: "Dr. Julian Sterling"` pushed into every video call from every account | `PatientRecordScreen` | a fixed clinician identity shown to the patient regardless of who was signed in | now the signed-in user |
| "View full history" | `PatientRecordScreen` | toggled `slice(0, 3)` against a 3-entry array, so it revealed nothing and only relabelled itself | returns with a real timeline |
| "Request refill" → "Request sent · Pending review · We'll notify you once it's ready" | `ActiveMedicationsScreen` | nothing sent, nothing stored, no notification possible, erased on navigate | a patient-scoped prescription/refill route — see the `/v1/prescriptions` note above; **both instances are staff-role-gated and PMS rejects a MedApp token** |
| "Add a medication" (footer and empty state) | `ActiveMedicationsScreen` | an `Alert` saying entry was unavailable | a patient medication-entry route |
| "Last filled 12 Jul · 14 days left" | `ActiveMedicationsScreen` | one literal under all three medications, backed by no field — two fabricated clinical facts per card | fill dates on a medication record |
| "Offline · Updated 12 Jul at 09:42", "Showing your last saved list" | `ActiveMedicationsScreen` | a fixed date that would still read 12 Jul in 2027, describing a cache that does not exist | an offline cache, if one is ever built |
| Both "Try again" buttons | `ActiveMedicationsScreen` | flipped a local enum; nothing refetched | n/a — the wired screen retries the query |
| "This record came from your prescriber." | `MedicationDetailsScreen` | **the exact opposite of true** — no medication endpoint exists and `source` is a field on a fixture | a real prescription record |
| `?state=` preview hatches on the medication list, patient record and roster | all three | a URL parameter could force any UI state, including states that render clinical data | n/a — states come from queries now; the detail screen's hatch is kept and **gated on `__DEV__`** |

**Kept and LABELLED rather than deleted:** the three sample medications
(`medications/sample-data.ts`). There is no endpoint to wire and the detail screen's layout is real
design work, so the entries stay with an unmissable "Sample data — these are not your medications"
on the list, on every card, on the detail record, and — because it is the one artefact that leaves
the app — as the **first and last line of the shared export file**.

**Vitals now carry reference ranges** (`patient-record/vital-ranges.ts`). `VitalOutWire` is
`{kind, value, unit}` with no bounds, and `abnormal` was a hand-typed boolean in a fixture, so every
real reading would have rendered unflagged — a 91% SpO₂ included. Ranges are **keyed per unit and
never converted** (98.6 is healthy in °F and lethal in °C), a blood pressure is scored on both halves
and described by the one that failed, and a reading whose kind or unit is unknown is **`unclassified`
— a real third state, rendered in its own group, never as a pass**. `abnormal` is gone from the type;
there is no prop through which a caller can assert a verdict.

**Still missing from the ranges model, deliberately:** paediatric, neonatal, pregnancy and
sex-specific intervals. `PatientBundleOut` carries no date of birth and no sex, so a cohort could
only have been derived from the fabricated age the fixture supplied. Every entry declares
`audience: "adult"` so the other cohorts have somewhere to go when demographics reach the client.

---

## Debt paid 2026-08-07

The six "owed" rows are now documented. Every service the app talks to has a contract file.

What the retro-documentation pass turned up that was not written down anywhere before:

- **Hardcoded seed ids in a shipped client** — `/v1/hospitals/hosp-1` and `/v1/pharmacies/pharm-1`
  are real requests pinned to seed rows, and 404 against any other data.
- **`is_listable` defaults to FALSE** on doctors, nurses, pharmacists and pharmacies, so anything
  created through the API is invisible until flipped.
- **Money is in CENTS** on doctors and nurses — a raw render is 100x the price.
- **Booking has no "completed" state**; it is derived client-side from `ends_at`, and a past
  cancelled booking renders as completed unless `cancelled` is tested first.
- **Booking has no reschedule endpoint** — cancel-and-rebook is non-atomic.
- **Doctor slots are computed, not reserved** — two patients can be offered the same one.
- **`pms_partner_secret_id`**, a credential reference, sits on the pharmacy read model.

Still genuinely undocumented, because the app does not call them yet: social, telemedicine, lab,
notification, payment, wearable-sync, onboarding, analytics, pms, hms. Write the contract as part of
wiring each, not after.


### Directory and saved appointment follow-up — 2026-09-13

Find Care's All view now queries all five directory categories. Pharmacy and
pharmacist pages use server offsets and expose Load more results; failed categories
remain visible as errors beside successful results. Pharmacy cards use the actual
`pharmacy_id`, and recorded hours no longer claim the store is currently open.
Home Service uses a nurse's recorded home-visit fee, including zero, rather than
matching badge text. Specialty filters are available for doctors, nurses and hospitals.

Public clinician profiles load their saved identity and biography from the matching
single-resource route. Confirmation and both appointment-list detail actions load
`GET /v1/bookings/{id}`. A saved ID is now the only value Review forwards to
confirmation. The display derives local dates, clocks and offsets from the stored
instants and shows cancellation/past states explicitly. A past scheduled time is
not evidence of a completed consultation. The summary-shaped history button now
opens saved appointment details; clinical visit summaries remain separate unfinished work.

B02 is still in progress: public social/review profile variants, exact reference
acceptance, currencies/fees, live PostgreSQL contention and native/device checks
remain open. See the current completion baseline for validation evidence.


### B03 professional identity follow-up — 2026-09-14

Authenticated doctor/nurse self-profile reads and partial updates are implemented;
the mobile doctor lookup no longer scans the full directory. The professional
editor saves basic public identity and listing fields, with draft preview and
session guards. Patient Profile now links to actual application status and
activated professional entry. See [doctor](doctor_service.md),
[nurse](nurse_service.md), and [onboarding](onboarding_service.md) contracts.
Approval-to-account/profile provisioning and the web handoff remain absent.
