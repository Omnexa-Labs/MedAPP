# MedAPP — Backend Services Audit

**Date:** 2026-05-20
**Scope:** `backend/services/*`, `backend/shared/`, `backend/proto/`
**Stack:** Python (FastAPI), SQLAlchemy + Alembic, Postgres + MongoDB + Qdrant, RabbitMQ event bus, gRPC contracts.

---

## API Gateway

### Strengths
- Request-ID injection and propagation.
- Rate limiting on `/v1/auth` (10 req / 60 s) blocks credential brute-force.
- Internal-header sanitisation removes `x-internal-*` and `x-service-token` (`main.py:83-86`).
- Clean public/protected route separation; JWT claims extracted at the edge (`main.py:72-74`).

### Flaws / Quality
- Rate-limit store is an **in-memory deque with a threading lock** — does not survive
  horizontal scale-out.
- Rate limiting only applied to auth routes; `/v1/payments` and other sensitive endpoints
  unprotected.
- Bare `except Exception` (`main.py:123`) masks JWT library errors.

### Security
- **CRITICAL** — `allow_origins=["*"]` paired with `allow_credentials=True`
  (`main.py:149-155`). Any origin can make authenticated requests on a victim's behalf.
- **HIGH** — JWT validation falls back to a shared placeholder secret in
  `config.py:8` (`change-me-change-me-change-me-change-me`).

### Improvements
- Replace `*` CORS with an explicit allowlist; drop `allow_credentials` unless paired with
  an allowlist.
- Move rate-limit storage to Redis (token-bucket).
- Extend rate limits to payments, OTP, password-reset, and refund endpoints.
- Fail startup when `jwt_secret` equals the placeholder.

---

## User Service

### Strengths
- Argon2 password hashing (`auth_service.py:24`).
- Opaque refresh tokens via `secrets.token_urlsafe(32)`; only SHA-256 hashes persisted.
- Refresh-token rotation policy in place.
- Audit logging captures IP + user-agent.
- Sensible access/refresh TTLs (15 min / 30 days).

### Flaws / Quality
- Default JWT secret string (`config.py:14`) — relies on env override.
- OTP resend cooldown only 30 s; allows spam.
- Email/phone uniqueness enforced in service code, not via DB unique constraints —
  race condition on concurrent signups.

### Security
- **HIGH** — Placeholder JWT secret in code (`config.py:14`).
- **MEDIUM** — `get_client_ip` (`deps.py:30`) trusts the first segment of
  `X-Forwarded-For`; spoofable unless a trusted reverse proxy is enforced.
- **MEDIUM** — OTP allows 5 attempts inside the 30 s window with no exponential backoff.

### Improvements
- Add DB unique constraints on `email` and `phone`.
- Exponential backoff + lockout on OTP failures.
- Validate email domains (disallow disposable providers in prod).
- Refuse to boot if `jwt_secret` is the placeholder.

---

## Payment Service

### Strengths
- Stripe webhook signature verification uses HMAC-SHA256 with constant-time comparison
  (`webhooks.py:17-19`).
- Idempotency-key support on payment creation (`payment_service.py:37-42`).
- Authorisation enforced on payment lookup (owner-or-admin) (`payment_service.py:66`).

### Flaws / Quality
- Webhook secret hardcoded as `change-me` (`webhooks.py:29`).
- Webhook event parsing lenient — `payload.get("id", "")`; no schema validation; bad
  payloads silently default to empty strings.
- Refund endpoint has no idempotency key.

### Security
- **CRITICAL** — Hardcoded Stripe webhook secret (`webhooks.py:29`). An attacker who
  reads the repo can forge `payment_intent.succeeded` events.
- **HIGH** — No schema validation on webhook payloads; malformed events may transition
  payment state.
- **HIGH** — Duplicate refund requests create duplicate refunds (no idempotency).
- **MEDIUM** — Refund endpoint has no per-user rate limiting.

### Improvements
- Read webhook secret from env, validated at boot.
- Validate every webhook payload against a Pydantic schema before mutating state.
- Add `idempotency_key` to refunds.
- Per-user refund rate limit + alerting on threshold breach.
- Emit immutable audit events for every payment state transition.

---

## EHR Service

### Strengths
- Access audit logging on patient-record reads (`record_service.py:74-76`).
- Authorisation matrix: patient self-access, clinician requires active consent, admin
  bypass (`record_service.py:35-42`).
- Consent model with `scope`, `revoked_at`, granular tracking.

### Flaws / Quality
- Consent revocation check only `revoked_at.is_(None)` — no `expires_at` enforcement.
- No rate limiting on vitals / records queries — bulk export possible.
- No documented data-retention or purge policy.

### Security
- **HIGH** — `scope` field is stored but **not checked** at read time
  (`record_service.py:35-68`). A consent granting `scope=notes` is currently
  indistinguishable from `scope=full`.
- **MEDIUM** — Audit logs themselves contain `resource` and `reason` strings that may
  leak medical context; audit-log access not restricted.
- **MEDIUM** — No field-level encryption for the most sensitive columns.
- **LOW** — No anomaly detection (bulk reads, after-hours access).

### Improvements
- Add `requested_scope ∈ consent.scopes` check in every authorised read.
- Restrict audit-log access to compliance admins; redact PII from audit fields.
- Rate-limit per-clinician reads; alert on bulk export.
- Define and enforce a data-retention policy (with auto-purge job).
- Consider field-level encryption (e.g., pgcrypto) for diagnoses, medications, notes.

---

## Telemedicine Service

### Strengths
- Room JWTs include `"typ": "room"` to prevent token confusion (`room_service.py:50`).
- Room-token validation verifies the `room_id` claim (`room_service.py:62`).
- 60-minute room-token TTL.

### Flaws / Quality
- Principal handling accepts both dict and object (`room_service.py:23-34`) — suggests
  inconsistent upstream callers.
- No participant pre-registration before token issue.

### Security
- **HIGH** — Room token is bound only to `room_id`, not to the participant identity.
  Anyone holding a token can join.
- **MEDIUM** — No end-to-end encryption for room messages (relies on TLS hop-by-hop).
- **MEDIUM** — `recording_enabled` is settable by the creator; no per-participant
  consent.

### Improvements
- Pre-register participants; embed `sub` (participant id) in the room token and check
  on join.
- Per-participant message ACLs.
- Recording requires explicit, logged consent from every participant.
- Consider E2EE for clinical chat.

---

## PMS Service (Pharmacy)

### Strengths
- HMAC-SHA256 webhook signature verification (`medapp_integration.py:22-32`).
- CORS origins configurable per environment.
- Dev-only flag for auto-schema bootstrap.

### Flaws / Quality
- Webhook secret defaults to `set-a-real-secret-in-production` (`config.py:28`).
- CORS allows `*` methods and `*` headers.
- `seed.py:33` ships a default admin password (`ChangeMe!123`).

### Security
- **CRITICAL** — Hardcoded webhook-secret default (`config.py:28`). The name is a hint,
  not a control.
- **CRITICAL** — `seed.py:33` writes a default admin into the DB; if the seed runs in
  prod, the admin password is known to anyone with repo access.
- **MEDIUM** — Open CORS surface enables broader CSRF / request smuggling.
- **MEDIUM** — DB DSN in `config.py:9-10` hardcoded; depends on env override.

### Improvements
- Move webhook secrets to a secrets manager; refuse to boot on the placeholder.
- Remove seed-with-credentials from any image / production pipeline; seed must require
  an explicit `--admin-email` and `--admin-password` argument.
- Restrict CORS to standard methods and headers.
- Implement webhook-secret rotation.

---

## HMS Service (Hospital, multi-tenant)

### Strengths
- Per-tenant DB connection pools (`config.py:21-23`).
- Tenant-context middleware for request-scoped tenant routing.
- Dev-only schema bootstrap.

### Flaws / Quality
- Default JWT secret string (`config.py:14`).
- Dev CORS hardcoded to `localhost:3001`; no parameterisation.
- No documented tenant migration strategy.

### Security
- **HIGH** — Multi-tenant JWT secret default (`config.py:14`); a compromise affects every
  tenant.
- **MEDIUM** — Tenant slug interpolated into DB URL (`config.py:10`). Risky unless slug
  is validated to a strict character set.
- **MEDIUM** — No defence-in-depth check that a query touches only the active tenant.

### Improvements
- Boot-time check rejects placeholder JWT secret.
- Per-tenant secrets if tenants are mutually distrustful.
- Add a query-level tenant-id guard (e.g., row-level security in Postgres).
- Audit log every tenant data access.

---

## Shared utilities (`backend/shared/`)

### Strengths
- Async session manager with auto-commit/rollback (`db/session.py:13-21`).
- Structured JSON logging with contextvars for request tracing.
- Base model with standard timestamps.

### Flaws / Security
- **HIGH** — `shared/auth/principal.py:25` hardcodes a `"change-me"` fallback. Each
  service is expected to override; the fallback is a footgun if a service forgets.
- **MEDIUM** — No PII redaction layer in the logging stack — `structlog` serialises
  whatever it is given.

### Improvements
- Remove the fallback secret entirely from shared code; require explicit injection or
  fail at import time.
- Build a redaction processor (sensitive-key list + value-pattern matchers) and add it
  to the structlog chain.
- Provide a `field_level_encrypt` helper for columns containing PII.

---

## Other services (analytics, booking, doctor, hospital, inbox, lab, notification, nurse, onboarding, social, wearable_sync)

These were sampled at a lower depth. Common observations apply:

- Same placeholder-JWT-secret pattern repeats across services.
- CORS configurations vary; standardise via a shared helper.
- Few services have automated tests beyond a smoke test.
- `notification_service` will need careful handling for SMS/email provider keys — verify
  these are env-injected only.
- `wearable_sync_service` will ingest sensitive biometric data — confirm transport
  encryption + per-provider OAuth scope minimisation in a dedicated review.
- `analytics_service` — confirm PHI is de-identified before any aggregate query;
  document the de-identification function.

---

## Cross-cutting backend recommendations

1. **Boot-time secret validation** — add a single shared helper:
   `assert_production_secret(name, value, placeholders=[...])` that crashes the process
   in non-dev mode when the value matches a known placeholder.
2. **Single CORS policy** — load allowed origins from env, applied uniformly via a
   shared FastAPI middleware factory.
3. **Webhook framework** — single shared helper for signature verification + schema
   validation + idempotency. Currently re-implemented per service.
4. **Audit log specification** — schema, retention, redaction rules, access control.
   Implement as a shared module emitted to an append-only store.
5. **Test coverage gate** — set a minimum coverage threshold per service in CI; today
   coverage looks incidental.
6. **gRPC contracts** — confirm `backend/proto/` is the single source of truth and that
   generated stubs are checked or regenerated in CI.
7. **PII redaction in logs** — required before any production deployment.

---

## Severity tally — backend

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH     | 8 |
| MEDIUM   | 11 |
| LOW      | 1 |
