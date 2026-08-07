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

| Service | Routes | Contract doc | App wiring |
| --- | ---: | --- | --- |
| `inbox_service` | 8 | ✅ [inbox_service.md](inbox_service.md) | Inbox + chat thread wired; practitioner room + AI handoff seeded |
| `ehr_service` | 7 | ✅ [ehr_service.md](ehr_service.md) | Overview wired; patient-record deliberately not |
| `user_service` | 17 | ✅ [user_service.md](user_service.md) | auth + `/v1/me` wired |
| `booking_service` | 8 | ✅ [booking_service.md](booking_service.md) | booking + appointments wired |
| `doctor_service` | 9 | ✅ [doctor_service.md](doctor_service.md) | Find Care wired |
| `hospital_service` | 7 | ✅ [hospital_service.md](hospital_service.md) | hospital detail wired |
| `pharmacy_service` | 7 | ✅ [directory_services.md](directory_services.md) | pharmacy detail wired |
| `nurse_service` / `pharmacist_service` | 13 | ✅ [directory_services.md](directory_services.md) | discovery lists wired |
| `social_service` | 9 | ✅ [social_service.md](social_service.md) | Client verified live; **feed screen blocked - PostOut has no author name, avatar or counts** |
| `telemedicine_service` | 9 | ✅ [telemedicine_service.md](telemedicine_service.md) | Client verified live; **screens not wired — no video transport exists** |
| `lab_service` | 4 | ✅ [lab_service.md](lab_service.md) | Client written + verified live; **no lab screen exists to wire** |
| `notification_service` | 5 | ✅ [notification_service.md](notification_service.md) | Client verified live; **no notifications screen exists** |
| `payment_service` | 6 | ❌ | **not wired** |
| `wearable_sync_service` | 5 | ✅ [wearable_sync_service.md](wearable_sync_service.md) | Client verified live; **Lifestyle screens not wired** |
| `onboarding_service` | 8 | ❌ | **not wired** |
| `analytics_service` | 5 | ❌ | **not wired** |
| `pms_service` | 47 | ❌ | Medications/scripts — not wired; **now reachable at `/v1/pms/*`** |
| `hms_service` | 51 | ❌ | Roster/dashboard — not wired; **now reachable at `/v1/hms/*`** (503s, see below) |
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
additive fields would fix all three, no new route); no presence, join events, delivery receipts or
attachments. `last_message_at` is set at creation, not first message. `sender_role` is coarse
("user"), so group attribution reads wrong.

**`ehr_service`** — `GET /v1/patients` 404s. Path param is a **user** id despite its name.
`kind` is free text, `value` is a string. No seeded content. Patient-record blocked on slug-vs-UUID,
consent gating and a preview-state harness. Consent create/delete intentionally unwrapped —
legally weighted, needs a designed flow.

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
