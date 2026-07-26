# Backend Implementation Guide

The order to build the 14 services in, and what each one entails. This is a
working document — keep it open while you're implementing, update it as
decisions firm up.

> **Reading time:** ~20 minutes end-to-end. Each service section is
> self-contained — once you're inside a service, you only need that section
> plus [§0 Conventions](#0-conventions).

---

## Table of contents

- [§0 Conventions (read first)](#0-conventions)
- [§1 Build order at a glance](#1-build-order-at-a-glance)
- [§2 Services in order](#2-services-in-order)
  - [2.1 user_service — auth, profiles, KYC, RBAC](#21-user_service--port-8001)
  - [2.2 doctor_service — profiles + availability](#22-doctor_service--port-8002)
  - [2.3 booking_service — the product's core verb](#23-booking_service--port-8005)
  - [2.4 payment_service — Stripe + M-Pesa](#24-payment_service--port-8006)
  - [2.5 notification_service — push, SMS, email](#25-notification_service--port-8008)
  - [2.6 inbox_service — support chat + handoff](#26-inbox_service--port-8013)
  - [2.7 telemedicine_service — WebRTC rooms](#27-telemedicine_service--port-8007)
  - [2.8 ehr_service — records, documents, vitals](#28-ehr_service--port-8010)
  - [2.9 lab_service — uploads + partner labs](#29-lab_service--port-8009)
  - [2.10 hospital_service — facilities, accreditation](#210-hospital_service--port-8004)
  - [2.11 nurse_service — home visits, vitals capture](#211-nurse_service--port-8003)
  - [2.12 social_service — feed, posts, Q&A](#212-social_service--port-8011)
  - [2.13 analytics_service — metrics, reporting](#213-analytics_service--port-8012)
  - [2.14 api_gateway — harden last](#214-api_gateway--port-8000)
- [§3 Cross-service patterns](#3-cross-service-patterns)
- [§4 Definition of Done (per service)](#4-definition-of-done-per-service)

---

## §0 Conventions

These apply to every service. Don't repeat them inside each section.

**Stack**
- Python 3.12, FastAPI, async SQLAlchemy 2.x + asyncpg (Postgres),
  motor (MongoDB), qdrant-client (Qdrant), psycopg2-binary (Alembic / scripts),
  Alembic for Postgres migrations, RabbitMQ via aio-pika, structlog,
  OpenTelemetry, pytest + httpx.
- Env / deps: **uv only**. `uv sync` to install, `uv run …` to execute.

**Layout (every service)**
```
backend/services/<name>/
  app/
    main.py            FastAPI app factory, lifespan, routers, middleware
    config.py          pydantic-settings BaseSettings
    deps.py            DI providers (get_session, get_current_user, …)
    db.py              engine + sessionmaker init (per-service Postgres DB)
    models/            SQLAlchemy models (Postgres)
    schemas/           pydantic request/response models
    routers/           FastAPI APIRouters, one per resource
    services/          business logic (pure, importable, testable)
    events/            publish/subscribe handlers (RabbitMQ)
  alembic/             Postgres migrations (one head per service)
  tests/               pytest, per-resource subfolders
  Dockerfile
  pyproject.toml
```

**Layering rule**
- `routers/` are transport adapters only: validate inputs, call the service
  layer, and map domain errors to HTTP responses.
- `services/` hold the use-case logic and coordinate persistence, events, and
  external calls.
- `models/` and `db.py` own ORM and session concerns.
- `schemas/` define API contracts only; they should not reach into the ORM.
- `deps.py` provides reusable request-scoped dependencies.

If a service is still small, keep the same folders anyway. That avoids future
renames when the service grows and makes every backend service look familiar to
the next engineer.

**Database rules**
- One Postgres DB per service. **No cross-service joins.** Need data from
  another service → call its HTTP API or react to its event.
- Mongo collections live in a per-service Mongo DB too (e.g. `medapp_ehr`).
- Qdrant collections are namespaced: `<service>_<purpose>` (e.g.
  `ehr_documents`, `lab_results`).

**Auth**
- Every protected endpoint depends on `get_current_user` from
  `backend.shared.auth`. This decodes the JWT, returns
  `CurrentUser(id, role, …)`, and 401s on failure.
- The gateway verifies tokens at the edge; **every service re-verifies**.
  Defense in depth.

**Eventing**
- Topic exchange `medapp.events`, CloudEvents 1.0 envelope (see
  `backend/shared/events/`).
- Routing keys are dotted, past-tense: `booking.created`, `payment.succeeded`,
  `vitals.anomaly.detected`.
- Consumers are idempotent (use the CloudEvent `id` for dedup).

**HTTP between services**
- Use `httpx.AsyncClient` from `backend/shared/clients/`.
- Forward `Authorization` and `X-Patient-Id` on patient-scoped calls.
- Timeouts: 5 s connect, 10 s read. Retry: exponential, 3 attempts, idempotent
  GETs only.

**Observability**
- structlog → JSON, OTel for traces. Every request gets a trace ID.
- **PHI never appears in logs or traces.** Wrap any field that might contain
  PHI in `backend.shared.observability.logging.redact()` before logging.

**Definition of Done** — see [§4](#4-definition-of-done-per-service).

---

## §1 Build order at a glance

| # | Service | Why this position | Est. |
|---|---|---|---|
| 1 | **user_service** | Issues JWTs. Everything else assumes a logged-in user. | 1–2 wk |
| 2 | **doctor_service** | Profiles + availability. Pre-req for booking. | 1 wk |
| 3 | **booking_service** | The product's core verb. | 1–2 wk |
| 4 | **payment_service** | Booking is meaningless without payment capture. | 1–2 wk |
| 5 | **notification_service** | Closes the loop: user knows the booking succeeded. | 3–5 d |
| 6 | **inbox_service** | Persistent patient/support chat and human handoff. | 1 wk |
| 7 | **telemedicine_service** | First actual visit happens here. | 1 wk |
| 8 | **ehr_service** | Records persist across visits; pre-req for agents. | 1 wk |
| 9 | **lab_service** | Uploads + partner labs. Feeds ehr + agents. | 1 wk |
| 10 | **hospital_service** | Marketplace breadth (facilities, accreditation). | 1 wk |
| 11 | **nurse_service** | Home visits. Mirrors doctor flow. | 3–5 d |
| 12 | **social_service** | Doctor blog, Q&A. Non-critical. | 1 wk |
| 13 | **analytics_service** | Read-side projections. Don't start until others emit events. | 1 wk |
| 14 | **api_gateway** | Hardens what you've already built. Last on purpose. | 3–5 d |

**One controversial call:** the gateway is last. Run services directly during
dev; harden routing/rate-limit/edge JWT verification only when you stage. The
gateway blocks nothing.

---

## §2 Services in order

### 2.1 `user_service` — port 8001

> **Status:** partially wired. JWT issuance + login skeleton exist. Needs OTP,
> KYC, RBAC enforcement, refresh tokens, password reset.

**Why first:** every other service expects `Authorization: Bearer <jwt>` and a
known role. Until this is solid, every downstream service has to mock its way
around auth.

**Owns**
- Accounts, credentials, sessions
- JWT issuance + refresh
- Phone OTP, email verification
- Profile + role (`patient | doctor | nurse | hospital_admin | platform_admin`)
- KYC state machine for non-patient roles

**Data**
- Postgres only (no Mongo, no Qdrant)
- Tables: `users`, `credentials`, `sessions`, `refresh_tokens`, `otp_codes`,
  `kyc_submissions`, `audit_log`

**Endpoints**
```
POST   /v1/auth/signup                  email/password or phone
POST   /v1/auth/otp/start               phone OTP request
POST   /v1/auth/otp/verify              exchange code for JWT
POST   /v1/auth/login                   email/password → JWT + refresh
POST   /v1/auth/refresh                 refresh → new JWT
POST   /v1/auth/logout                  invalidate refresh
POST   /v1/auth/password/forgot         email link
POST   /v1/auth/password/reset          consume link, set new pw
GET    /v1/me                           current profile
PATCH  /v1/me                           edit profile
POST   /v1/me/kyc                       submit KYC docs (doctor/nurse/hospital)
GET    /v1/users/{id}                   admin or self
```

**Emits**
- `user.registered` — payload: `{user_id, role, created_at}`
- `user.kyc_submitted` — for admin review queue
- `user.kyc_approved` / `user.kyc_rejected`

**Consumes**
- Nothing.

**Integrations**
- SMS for OTP — start with Twilio Verify (Africa's Talking later for cost).
- Email — start with SendGrid.
- Object storage for KYC docs — GCS bucket `medapp-kyc-<env>`, signed URLs.

**Security**
- Passwords: argon2id via `argon2-cffi`.
- JWT: ES256 (asymmetric — gateway and other services verify with public
  key, only `user_service` holds private key). 15-min access, 30-day refresh.
- Refresh tokens are opaque, stored hashed.
- OTP: 6-digit, 5-min TTL, 5-attempt lockout per phone per 24h.
- Rate limit `/auth/*` aggressively (Redis sliding window).

**Tests to write**
- Signup with email and phone happy paths.
- OTP brute-force lockout.
- Refresh rotation (used token can't be re-used).
- KYC state transitions (only `submitted → approved/rejected`).
- JWT signature verification against a tampered token.

**Done when** — see §4. Plus: another service can import the public key, verify
a token issued here, and extract role + user_id.

---

### 2.2 `doctor_service` — port 8002

**Why second:** booking needs something to book against.

**Owns**
- Doctor profiles (specialty, bio, languages, fees, photo)
- Availability (recurring weekly + exceptions)
- Search index (specialty, geo, languages, price band)
- Doctor-managed services (consultation types, durations, prices)

**Data**
- Postgres: `doctors`, `availability_rules`, `availability_overrides`,
  `consultation_types`, `service_areas`
- Qdrant: `doctor_profiles` (embedding of bio + specialties for semantic
  search — only when phase 2)

**Endpoints**
```
POST   /v1/doctors                      create profile (self, role=doctor)
GET    /v1/doctors/{id}
PATCH  /v1/doctors/{id}
GET    /v1/doctors                      search: ?specialty&geo&lang&max_price
POST   /v1/doctors/{id}/availability    set weekly rules
GET    /v1/doctors/{id}/slots?from&to   computed open slots
```

**Emits**
- `doctor.profile_created`
- `doctor.availability_changed`

**Consumes**
- `user.kyc_approved` → flip `is_listable=true` so they appear in search.

**Search**
- Phase 1: SQL filters + PostGIS for geo. Add `pg_trgm` for fuzzy name match.
- Phase 2: pull bios into Qdrant for "find me a kind, English-speaking
  pediatrician" semantic queries.

**Slot computation**
- Inputs: recurring rules, overrides, existing bookings (HTTP call to
  `booking_service` — yes, this is the pragmatic exception to "no joins"; both
  services need the source of truth for booking state).
- Cache slots in Redis for 60s per (doctor, day).

**Tests**
- Slot generation across DST transitions.
- Overlapping availability rules resolve deterministically.
- Listable filter respects KYC state.

---

### 2.3 `booking_service` — port 8005

**Why third:** the product's core verb. Booking links a patient and a doctor
through time, money, and care.

**Owns**
- Bookings (the appointment itself)
- Booking lifecycle: `pending_payment → confirmed → in_progress → completed | cancelled | no_show`
- Reschedule history
- Waitlists (phase 2)

**Data**
- Postgres: `bookings`, `booking_status_history`, `cancellations`
- No Mongo, no Qdrant.

**Endpoints**
```
POST   /v1/bookings                     create (locks slot, status=pending_payment)
GET    /v1/bookings/{id}
GET    /v1/bookings                     list mine (filtered by role)
POST   /v1/bookings/{id}/cancel
POST   /v1/bookings/{id}/reschedule
POST   /v1/bookings/{id}/check-in       called by telemed_service when call starts
POST   /v1/bookings/{id}/complete       called by telemed_service when call ends
```

**State machine** — enforce in code, not just DB constraints:
```
pending_payment ──payment.succeeded──> confirmed
pending_payment ──timeout (10 min)───> cancelled
confirmed       ──booking.checked_in──> in_progress
in_progress     ──booking.completed──> completed
confirmed       ──cancel by either──> cancelled (within policy window)
```

**Emits**
- `booking.created` → payment_service listens
- `booking.confirmed` → notification_service listens
- `booking.cancelled`
- `booking.completed` → ehr_service may create a visit record

**Consumes**
- `payment.succeeded` → flip to `confirmed`
- `payment.failed` → flip to `cancelled`

**Concurrency**
- Slot locking: `SELECT ... FOR UPDATE` on `doctors_slots` projection, or
  Redis lock with 30s TTL. Test for double-booking under load.

**Tests**
- Double-booking the same slot fails the second writer.
- Payment timeout cancels the booking.
- Cancellation policy: > 24h before = full refund event; < 24h = no refund.

---

### 2.4 `payment_service` — port 8006

**Why fourth:** without this, "booking" is theatre. Build Stripe first
(easiest), then M-Pesa, then MTN MoMo, then PayPal.

**Owns**
- Payment intents
- Refunds
- Webhook receivers per provider
- Reconciliation log

**Data**
- Postgres: `payments`, `refunds`, `provider_events` (raw webhook bodies +
  parsed status, for audit)

**Endpoints**
```
POST   /v1/payments/intent              {booking_id, amount, currency, method}
GET    /v1/payments/{id}
POST   /v1/payments/{id}/refund         admin / policy-triggered

POST   /v1/webhooks/stripe              raw body, signature verified
POST   /v1/webhooks/mpesa
POST   /v1/webhooks/momo
```

**Emits**
- `payment.succeeded` — payload: `{payment_id, booking_id, amount, currency, method}`
- `payment.failed`
- `payment.refunded`

**Consumes**
- `booking.created` → create an intent automatically? (debatable — phase 1: no,
  client calls `/payments/intent` explicitly so we don't lock funds the user
  hasn't agreed to release)
- `booking.cancelled` (within refund window) → trigger refund

**Provider notes**
- Stripe: Payment Intents API, store `pi_…` ID, verify webhook signatures
  with the endpoint secret.
- M-Pesa: STK push via Safaricom's Daraja API, async confirmation callback.
- Webhooks must be idempotent — use the provider's event ID as dedup key.

**Security**
- Never log PAN, CVV, M-Pesa PIN.
- Webhook endpoints: signature verify or fail closed.
- Internal `/refund` requires admin role.

**Tests**
- Stripe webhook signature: tamper rejects.
- Double-delivery of the same provider event is idempotent.
- Refund on a non-confirmed payment fails.

---

### 2.5 `notification_service` — port 8008

**Why fifth:** the user needs to *know* their booking succeeded. Without
notifications, the rest is invisible.

**Owns**
- Multi-channel delivery (push, SMS, email, in-app)
- Templates per locale (EN, FR, TWI, SW)
- Delivery log + retry
- User preferences (which channels for which event types)
- Delivery only; persistent conversation state lives in `inbox_service`

**Data**
- Postgres: `delivery_log`, `notification_preferences`
- Mongo: `templates` (Markdown bodies; revising them often)

**Endpoints**
```
POST   /v1/notifications/send           internal (signed via JWT, role=service)
GET    /v1/me/preferences
PUT    /v1/me/preferences
```

**Emits**
- `notification.sent` (for analytics)
- `notification.delivery_failed`

**Consumes** — this is mostly a consumer:
- `booking.confirmed` → push + SMS to patient + doctor
- `booking.cancelled` → push + SMS
- `payment.succeeded` → push
- `appointment.starting_soon` (scheduled job 15min before) → push + SMS
- `lab.result_ready`
- `vitals.anomaly.detected` → push + SMS
- `inbox.message.sent`

**Providers**
- Push: Firebase Cloud Messaging (FCM).
- SMS: Twilio for English markets, Africa's Talking for African markets.
- Email: SendGrid.

**Reliability**
- Provider failure → retry with exponential backoff (3 attempts).
- After final failure: dead-letter to a `notifications.dlq` queue + alert.

**Tests**
- Template renders with all required locales.
- Per-channel opt-out is respected.
- Idempotency: same event ID twice = one delivery.

---

### 2.6 `inbox_service` — port 8013

**Why sixth:** support handoff needs a durable conversation service that is not the same thing as delivery notifications or room chat.

**Owns**
- Persistent threads and participants
- Message history and read state
- Direct user-to-human chat
- Agent handoff threads with summary messages
- Assignment metadata for support queues

**Data**
- Postgres: `threads`, `thread_participants`, `thread_messages`

**Endpoints**
```
POST   /v1/threads                      create a direct support thread
GET    /v1/threads                      list my threads
GET    /v1/threads/{id}                 thread metadata
GET    /v1/threads/{id}/messages        message history
POST   /v1/threads/{id}/messages        append a message
POST   /v1/threads/{id}/read            mark thread read
POST   /v1/threads/handoff              internal agent/service handoff
```

**Consumes**
- `inbox.handoff_requested` or a direct service call from a chat agent when human escalation is needed

**Tests**
- Direct thread creation keeps creator + participants visible.
- Handoff threads are visible to both the patient and the service actor.
- Read state advances when a participant marks the thread read.

---

### 2.7 `telemedicine_service` — port 8007

**Why sixth:** booking + payment are done; now the visit actually happens.

**Owns**
- Video rooms (provisioned via Twilio Video or Daily.co; we don't run STUN/TURN)
- Per-room access tokens
- In-call chat + file share
- Call recordings (optional, opt-in, regulatory-aware)

**Data**
- Postgres: `rooms`, `room_participants`, `call_recordings`
- Mongo: `chat_messages` (per-room, append-only)

**Endpoints**
```
POST   /v1/rooms                        create from a confirmed booking
GET    /v1/rooms/{id}/token             access token (short-lived)
POST   /v1/rooms/{id}/join              mark participant joined
POST   /v1/rooms/{id}/leave
POST   /v1/rooms/{id}/end               doctor ends; triggers booking.completed
GET    /v1/rooms/{id}/messages
POST   /v1/rooms/{id}/messages
```

**Emits**
- `room.created`
- `room.participant_joined`
- `room.ended` → booking_service listens, flips status

**Consumes**
- `booking.confirmed` → pre-provision the room (so it's ready at join time)

**Provider notes**
- Twilio Video: SDK token signed with API key + secret, scoped to room name
  + identity. 1-hour TTL.
- Daily.co alternative: cheaper, easier recordings, but Twilio is more
  battle-tested.

**Recording compliance**
- Recordings store encrypted on GCS.
- Patient + doctor must consent; consent recorded in audit log.
- Auto-delete after 90 days unless flagged for legal hold.

**Tests**
- Join token rejects expired tokens.
- Only booking participants can join the room.
- Ending the call by either party triggers `room.ended`.

---

### 2.8 `ehr_service` — port 8010

**Why seventh:** records need to persist across visits. Also the substrate
the AI agents read from.

**Owns**
- Patient-owned medical records
- Documents (PDFs, images, scans)
- Vitals timeline (BP, HR, weight, glucose, …)
- Medications, allergies, conditions
- Consent ledger (who can read what)

**Data**
- Postgres: `patients`, `vitals`, `medications`, `allergies`, `conditions`,
  `consents`, `access_audit`
- Mongo: `documents` (metadata + extracted text; binaries live in GCS),
  `visit_notes` (free-form notes from telemed sessions)
- Qdrant: `ehr_documents` (embeddings of document text for RAG)
- GCS: actual binaries, encrypted at rest, signed URLs only

**Endpoints**
```
GET    /v1/patients/{id}/records        full bundle (subject to consent)
POST   /v1/patients/{id}/documents      multipart upload
GET    /v1/patients/{id}/documents/{doc_id}/url   signed GCS URL
GET    /v1/patients/{id}/vitals?from&to
POST   /v1/patients/{id}/vitals
GET    /v1/patients/{id}/medications
POST   /v1/patients/{id}/consents       grant read access to a doctor
DELETE /v1/patients/{id}/consents/{id}  revoke
```

**Emits**
- `document.uploaded` → triggers lab_reader_agent
- `vitals.recorded` → vitals_watcher_agent listens
- `vitals.anomaly.detected` (after agent processes them)

**Consumes**
- `booking.completed` → create a visit shell that the doctor fills in
- `lab.result_ready` → attach to patient

**RAG pipeline (Qdrant)**
- On `document.uploaded`: extract text (OCR if image / PDF), chunk, embed,
  upsert to Qdrant with metadata `{patient_id, doc_id, doc_type, date}`.
- Agents query Qdrant filtered by `patient_id` — never cross-patient.

**Audit**
- Every PHI read writes a row to `access_audit` with `{accessor_id,
  patient_id, resource, reason, timestamp}`.
- "Reason" comes from the calling context; agents always pass their goal.

**Tests**
- A doctor without consent gets 403.
- Consent revocation is immediate (no cache TTL exposure).
- Vitals timeline is monotonic.

---

### 2.9 `lab_service` — port 8009

**Owns**
- Lab orders (when a doctor requests a test)
- Patient-uploaded lab results
- Partner lab integrations (Synlab, mPharma — phase 2)
- OCR pipeline for uploaded PDFs / images

**Data**
- Postgres: `lab_orders`, `lab_results`, `partner_labs`
- Mongo: `lab_result_extractions` (OCR text + parsed values)
- Qdrant: `lab_results` (embeddings, namespaced per patient)
- GCS: original files

**Endpoints**
```
POST   /v1/lab/orders                   doctor creates
POST   /v1/lab/results/upload           patient or partner uploads
GET    /v1/lab/results/{id}
GET    /v1/me/lab/results
```

**Emits**
- `lab.order_created`
- `lab.result_ready` → ehr_service + notification_service listen

**Consumes**
- Nothing initially.

**OCR**
- Phase 1: Google Document AI (Healthcare). Phase 2: own model.
- Extract structured values (analyte, value, unit, reference range) into the
  Mongo extraction doc.

---

### 2.10 `hospital_service` — port 8004

**Owns**
- Hospitals + facilities (wards, ORs, ICU beds)
- Hospital staff roster
- Accreditation + certifications
- Hospital-level reviews + KPIs (mortality rate, readmission rate when public)

**Data**
- Postgres only.

**Endpoints**
```
POST   /v1/hospitals
GET    /v1/hospitals/{id}
GET    /v1/hospitals                    search by geo, specialty, insurance
POST   /v1/hospitals/{id}/staff         add doctor/nurse
GET    /v1/hospitals/{id}/reviews
```

**Emits**
- `hospital.created`
- `hospital.accreditation_updated`

**Consumes**
- `doctor.profile_created` if doctor is hospital-affiliated.

---

### 2.11 `nurse_service` — port 8003

**Mirrors doctor_service.** The difference: nurses do home visits, so
availability has a geo radius and travel time.

**Endpoints (delta from doctor)**
```
POST   /v1/nurses/{id}/service_area     polygon or radius around home base
GET    /v1/nurses                       search includes "within X km of {lat,lng}"
POST   /v1/nurses/{id}/home_visit_fee
```

**Bookings** still go through `booking_service` — `booking.kind = home_visit`.

---

### 2.12 `social_service` — port 8011

**Owns**
- Doctor posts / blog
- Patient Q&A (anonymized)
- Comments + reactions
- Moderation queue

**Data**
- Postgres: `posts`, `comments`, `reactions`, `moderation_queue`
- Mongo: `post_bodies` (Markdown, often-edited)

**Endpoints**
```
POST   /v1/social/posts
GET    /v1/social/feed                  personalised feed
POST   /v1/social/posts/{id}/comments
POST   /v1/social/posts/{id}/react
POST   /v1/social/qa                    patient asks (anonymized)
POST   /v1/social/qa/{id}/answer        doctor answers
```

**Emits** — analytics events only.

**Moderation**
- Auto-flag via a content classifier (cheap LLM call).
- Manual queue for hospital_admin / platform_admin.

---

### 2.13 `analytics_service` — port 8012

**Why second-to-last:** you can't analyze what hasn't been emitted yet. Build
once other services are producing events.

**Owns**
- Event ingestion → projections
- Operational dashboards (Grafana data source)
- Product metrics (DAU, booking funnel, retention)
- Doctor / hospital scorecards

**Data**
- Postgres: `event_log` (raw inbound, partitioned by month)
- Postgres materialized views for projections
- Optionally: ClickHouse later if Postgres OLAP can't keep up. Don't pre-optimise.

**Endpoints**
```
GET    /v1/admin/metrics/funnel?from&to
GET    /v1/admin/metrics/retention
GET    /v1/admin/doctors/{id}/scorecard
```

**Consumes** — everything. Subscribes to `medapp.events.#`.

**Emits** — nothing.

**No PHI in any projection.** Hash patient IDs before storing.

---

### 2.14 `api_gateway` — port 8000

**Why last:** it's a thin layer. Building it early means re-doing route
config every time a downstream endpoint changes.

**Owns**
- Routing (path-prefix to service mapping)
- Edge JWT verification (rejects unauthenticated requests before they hit
  services)
- Rate limiting (per-IP + per-user, sliding window in Redis)
- Request/response logging with trace correlation
- CORS
- Health aggregation (`/healthz` reports all backends)

**Data**
- None. (Maybe Redis for rate-limit counters.)

**Routes (declarative, in `app/config.py`)**
```
/v1/auth/*           → user_service:8001
/v1/me/*             → user_service:8001
/v1/doctors/*        → doctor_service:8002
/v1/nurses/*         → nurse_service:8003
/v1/hospitals/*      → hospital_service:8004
/v1/bookings/*       → booking_service:8005
/v1/payments/*       → payment_service:8006
/v1/webhooks/*       → payment_service:8006   # webhook receivers
/v1/rooms/*          → telemedicine_service:8007
/v1/notifications/*  → notification_service:8008
/v1/me/preferences   → notification_service:8008
/v1/me/inbox         → notification_service:8008
/v1/lab/*            → lab_service:8009
/v1/patients/*       → ehr_service:8010
/v1/social/*         → social_service:8011
/v1/admin/*          → analytics_service:8012  # admin-only

/agents/concierge    → concierge_agent:9001
/agents/recommend    → smart_recommend_agent:9002
/agents/chat         → medical_chat_agent:9003
/agents/lab          → lab_reader_agent:9004
/agents/vitals       → vitals_watcher_agent:9005
/agents/booking      → booking_agent:9006
```

**Hardening checklist**
- JWT verify with public key — never call user_service for verification.
- Rate-limit `/auth/*` aggressively (10 req/min/IP).
- Strip internal headers (`X-Internal-*`) from incoming requests.
- Add `X-Request-Id` if missing; propagate downstream.
- Reject requests > 10 MB unless route is whitelisted (uploads to ehr/lab).

---

## §3 Cross-service patterns

### 3.1 The "one booking" trace
A patient books a doctor. Follow the data:

```
mobile app
  └─ POST /v1/bookings                            api_gateway
       └─ booking_service: INSERT bookings (pending_payment)
       └─ emit booking.created
              ├─ payment_service: create intent, return client_secret
              └─ notification_service: queue "complete your payment" reminder

mobile app
  └─ POST /v1/payments/intent                     payment_service
       └─ Stripe Payment Intent created
       └─ client confirms with Stripe SDK
       └─ Stripe webhook → payment_service
            └─ emit payment.succeeded
                  ├─ booking_service: flip to confirmed
                  │     └─ emit booking.confirmed
                  │           └─ notification_service: SMS + push
                  │           └─ telemedicine_service: pre-provision room
                  └─ analytics_service: record funnel step
```

If this end-to-end flow works in dev, you've successfully built the MVP
spine.

### 3.2 Service-to-service auth
- Each service has a private key for signing **service tokens** (short-lived,
  audience = `medapp-internal`).
- When `booking_service` calls `payment_service`, it attaches both:
  - the user's original `Authorization: Bearer <jwt>` (so payment_service knows
    *who* this is for), and
  - `X-Service-Token: <internal jwt>` (proof the call is from a sibling).
- The gateway strips inbound `X-Service-Token` headers. Internal-only.

### 3.3 Idempotency
- Webhook receivers: dedup by provider event ID.
- Event consumers: dedup by CloudEvent `id`. Store the last N IDs per
  consumer in Redis with a 24h TTL.
- POST endpoints that the client may retry (`POST /bookings`): require
  `Idempotency-Key` header.

### 3.4 Migrations
- Each service owns its Alembic. To migrate all: `scripts/migrate-all.sh`.
- Forward-only. No `downgrade()` in production migrations.
- Expand → migrate data → contract over multiple releases. Never break wire
  compat with the previous deployment.

### 3.5 Local dev shortcut
If you only want to iterate on one service:
```bash
# Boot only the infra that service needs
docker compose -f infra/docker/docker-compose.yml up -d postgres redis rabbitmq
# Then run the service locally with hot reload
cd backend/services/<name> && uv sync && uv run uvicorn app.main:app --reload --port 80XX
```

---

## §4 Definition of Done (per service)

A service ships when **all** of these are true:

- [ ] Endpoints documented in OpenAPI (`/docs` renders, schemas have examples)
- [ ] Alembic migrations apply cleanly from empty DB
- [ ] `pytest` passes locally and in CI; coverage ≥ 70 % on `services/`
- [ ] Auth enforced on every non-public endpoint (verified by a test)
- [ ] All emitted events documented in this guide + schema in `backend/shared/events/`
- [ ] All consumed events have an idempotent handler with a dedup test
- [ ] Dockerfile builds; image runs `/healthz` returning 200
- [ ] `make dev` boots the backend stack without manual steps
- [ ] structlog + OTel: a single request shows up in Jaeger with one root span
- [ ] No PHI in logs (grep test in CI)
- [ ] README at the service root explains: what it owns, endpoints, events,
      how to run, how to test

---

## §5 What's *not* in here (deliberately)

- Specific SQL schemas — those belong in models / migrations.
- Wire-level event payloads — those belong in `backend/shared/events/schemas/`.
- The mobile frontend — see [`docs/FRONTEND.md`](../docs/FRONTEND.md).
- The agentic side — see [`agents/README.md`](../agents/README.md).
- Infra — see [`infra/`](../infra/).
- Why we chose microservices / GCP / FastAPI — see [`docs/adr/`](../docs/adr/).
