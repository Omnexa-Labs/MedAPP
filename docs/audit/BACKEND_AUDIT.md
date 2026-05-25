# Backend Audit

> Scope: `backend/services/*` (18 services) and `backend/shared/`.

## 1. Strengths

- **Service shape is sound.** One Postgres DB per service, async
  SQLAlchemy 2.x with `asyncpg`, per-service Alembic migrations,
  outbox-style event publication, and httpx-based sync clients in
  `backend/shared/clients/`.
- **`user_service` is a credible reference.** Refresh-token rotation
  with chain revocation on reuse
  (`backend/services/user_service/app/services/auth_service.py:203-229`),
  single-use time-limited password reset tokens (l. 297-313), and
  bcrypt-style password hashing.
- **EHR audit scaffolding exists.** PHI access is logged
  (`backend/services/ehr_service/app/services/record_service.py:74-75`)
  — the structure is right, even though the policy still has the admin
  bypass described in `CRITICAL_FINDINGS.md` (C-5).
- **PMS integration uses HMAC-SHA256** correctly
  (`backend/services/pms_service/app/services/medapp_integration.py:29`)
  — only the secret default is weak.
- **SQLAlchemy ORM is used consistently.** Hand-rolled SQL is rare and
  almost always parameterised; the HMS DDL path (C-3) is the notable
  exception.

## 2. Cross-cutting flaws and security issues

### 2.1 Authentication and identity

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-1 | Critical | Shared `"change-me"` HS256 secret default | Every service `config.py`; see C-2 |
| B-2 | High | No `aud` claim on JWTs — token confusion across services | `backend/shared/shared/auth/jwt.py:7-18` |
| B-3 | High | `algorithms=...` not pinned at every `decode` call | `backend/shared/shared/auth/principal.py:25` |
| B-4 | High | `dev_auth` router can mint admin tokens | `backend/services/hms_service/app/routers/dev_auth.py` |
| B-5 | Medium | No JWT key rotation story (no `kid` header) | shared `jwt.py` |
| B-6 | Medium | OTP attempt counter present (5) but no per-IP throttle on the request endpoint | `user_service/app/config.py:20-23` |

### 2.2 Authorisation and data access

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-7 | Critical | Admin role skips clinician + consent gates | `ehr_service/app/services/record_service.py:38-41` (C-5) |
| B-8 | Critical | Profile PATCH allows arbitrary field write incl. `role` | `user_service/app/routers/profiles.py:25-26` (C-9) |
| B-9 | High | Tenant context middleware trusts `X-Tenant` header without verification | `hms_service/app/main.py:51` |
| B-10 | Medium | No row-level access predicates on EHR queries beyond consent check | `ehr_service` repositories |

### 2.3 Input handling, injection, and validation

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-11 | Critical | SQL injection in tenant DB creation | `hms_service/app/services/tenant_service.py:60` (C-3) |
| B-12 | High | PII/PHI stored as free-form JSON in `users.medical_history` / `users.allergies` | `user_service/app/models/user.py:25-26` |
| B-13 | Medium | Error responses interpolate exception detail (`f"invalid payload: {exc}"`) — leaks implementation info | e.g. `pms_service/app/routers/integrations.py:36-37` |
| B-14 | Medium | No per-endpoint request size limits (gateway has a global cap only) | All services |

### 2.4 Payments

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-15 | Critical | Stripe webhook verifies against hardcoded `"change-me"` | `payment_service/app/routers/webhooks.py:29` (C-8) |
| B-16 | Critical | M-Pesa webhook has no signature verification | `payment_service/app/routers/webhooks.py:42-44` |
| B-17 | High | Refund handling lacks idempotency key — duplicate webhook = duplicate refund | `payment_service/app/services/payment_service.py:94-125` |
| B-18 | Medium | No reconciliation job documented between Stripe/M-Pesa and local `payment_intents` | Service-wide |

### 2.5 Eventing and reliability

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-19 | High | Event handler has no retry / DLQ — failed handlers drop events silently | `backend/shared/shared/events/bus.py:35-47` |
| B-20 | Medium | No outbox publisher exists yet despite ADR describing one | `backend/shared/shared/events/` |
| B-21 | Medium | Default `pool_size=10` with no overflow configuration; connection exhaustion under load | `backend/shared/shared/db/session.py:7-8` |

### 2.6 Booking and rate limits

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-22 | High | No per-user rate limit on booking creation; can saturate a doctor's schedule | `booking_service/app/services/booking_service.py:53-83` |
| B-23 | Medium | Gateway rate limiting is in-process; will not survive scale-out | `api_gateway/app/main.py` |

### 2.7 Dockerfiles and runtime hygiene

| ID | Severity | Finding | Location |
|---|---|---|---|
| B-24 | Medium | Service Dockerfiles do not declare a `USER` (run as root) | All `backend/services/*/Dockerfile` |
| B-25 | Low | No pinned base image digests | Same |
| B-26 | Low | No multi-stage minimisation for some services (image bloat) | Same |

## 3. Service-by-service notes

| Service | State | Notable issues beyond the cross-cutting list |
|---|---|---|
| `api_gateway` | scaffold | `allow_origins=["*"]` (C-6); in-process rate limit only |
| `user_service` | wired | Strong auth flows; profile PATCH (C-9), JSON PHI columns (B-12) |
| `doctor_service` | scaffold | OK shell; no logic to audit yet |
| `nurse_service` | scaffold | Same |
| `hospital_service` | scaffold | Same |
| `booking_service` | scaffold | No rate limit (B-22); booking lifecycle not yet idempotent |
| `payment_service` | scaffold | Webhook signing broken (B-15, B-16, B-17) |
| `telemedicine_service` | scaffold | No content yet to audit beyond config |
| `notification_service` | scaffold | Provider integration absent |
| `inbox_service` | scaffold | OK shell |
| `lab_service` | scaffold | OK shell; signed URL TTL story still to be defined |
| `ehr_service` | scaffold + audit shell | Admin bypass (C-5); needs row-level predicates |
| `wearable_sync_service` | scaffold | OK shell |
| `social_service` | scaffold | OK shell |
| `analytics_service` | scaffold | OK shell |
| `onboarding_service` | scaffold | OK shell |
| `pms_service` | partially wired | HMAC correct; secret default weak (C-8) |
| `hms_service` | partially wired | SQLi in tenant create (C-3); `dev_auth` router (B-4); CORS hardcoded (B-9) |

## 4. Improvement opportunities

1. **Replace every `change-me` default with `os.environ[...]` and a
   startup assertion** — no fallback values for security-critical
   config.
2. **Add a `verify_jwt` dependency** in `backend/shared/shared/auth/`
   that enforces algorithm, audience, expiry, and clock skew in one
   place.
3. **Introduce a thin authorisation policy module** so that EHR, lab,
   and ehr-adjacent services share a consistent consent + role +
   purpose model rather than open-coding each check.
4. **Implement the outbox publisher** and retry/DLQ on the consumer
   side; today the event bus loses messages on the first exception.
5. **Add an explicit `ALLOWED_PROFILE_FIELDS` allowlist** (C-9) and a
   regression test.
6. **Standardise Dockerfiles** with a non-root `appuser`, pinned base
   image digest, and a `HEALTHCHECK` line.
7. **Per-service test floor.** Require at least: auth happy path, auth
   failure, one IDOR test, one schema migration round-trip. Today the
   floor is `healthz`.
8. **Field-level encryption for PHI columns** (allergies, medical
   history, lab metadata) using a KMS-backed key — Postgres TDE alone
   does not satisfy HIPAA at-rest expectations for narrative PHI.
