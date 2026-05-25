# Critical Findings

> Issues that present a direct path to data loss, account takeover, PHI
> exfiltration, or platform-wide compromise. Each must be resolved before
> any environment is exposed beyond the development laptop.

Each finding lists: location, what is wrong, the realistic attack, and the
fix.

---

## C-1 — Live provider API key on disk

**Location:** `agents/.env:1`
**Secret:** `GROQ_API_KEY=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`

The key is gitignored (good) but exists as plaintext on at least one
developer machine and is therefore present in any unencrypted backup,
sync, or system image. No code currently references it, so it is also
effectively orphaned.

**Fix**

1. Revoke the key in the Groq console immediately.
2. Remove the file or replace the value with an empty string.
3. Move any future provider keys into GCP Secret Manager and inject at
   runtime; never write them next to the source tree.

---

## C-2 — Shared `"change-me"` JWT secret across every service

**Locations**
- `backend/services/api_gateway/app/config.py:8`
- `backend/shared/shared/auth/principal.py:25`
- Each service config (`hms_service`, `pms_service`, `user_service`, …)
- `infra/docker/docker-compose.yml:164, 174`

Every service falls back to the same `"change-me-change-me-…"` HS256
secret. Any environment that forgets to override the variable accepts
tokens forged by any other service that did the same. There is also no
JWT `aud` claim, so a token minted by `user_service` validates against
`payment_service` even when secrets *are* set.

**Attack**

A single misconfigured service in any environment yields universal token
forgery for the entire platform.

**Fix**

1. Remove the default value entirely — fail closed at startup if
   `JWT_SECRET` is unset or shorter than 32 bytes.
2. Issue per-environment 32-byte random secrets via Secret Manager.
3. Add an `aud` claim per service and verify it in
   `backend/shared/shared/auth/`.
4. Pin `algorithms=["HS256"]` explicitly to block the `alg=none` family.

---

## C-3 — SQL injection in HMS tenant provisioning

**Location:** `backend/services/hms_service/app/services/tenant_service.py:60`

```python
conn.execute(text(f'CREATE DATABASE "{db_name}"'))
```

`db_name` is derived from the tenant slug via `f"hms_{body.slug.replace('-', '_')}"`
(line 29). The slug is user-controlled and not validated against a
`[a-z0-9_]+` whitelist.

**Attack**

A slug like `x"; DROP DATABASE admin_db; --` provisions the tenant *and*
drops an arbitrary database.

**Fix**

1. Validate the slug with a strict allowlist regex before any SQL.
2. Use `psycopg2.sql.Identifier()` (or `asyncpg`'s `format` helpers) to
   quote identifiers safely instead of `f"…"` interpolation.

---

## C-4 — Unauthenticated `/chat` on every agent

**Location:** `agents/services/*/app/base_agent.py:53-55` (the shared
agent FastAPI surface)

The endpoint accepts `patient_id` from the request body, then propagates
it as `X-Patient-Id` to backend services (e.g.
`concierge_agent/app/tools.py:28-29`). There is no JWT middleware, no
identity check, and no rate limit.

**Attack**

Any client POSTs `/chat` with the victim's `patient_id` and harvests
their EHR, vitals, bookings, and notifications via the agent's tools.

**Fix**

1. Require a JWT on every agent endpoint.
2. Derive `patient_id` from the token's `sub` claim — never accept it
   from the body or headers.
3. Add per-user rate limiting in front of `/chat`.
4. Sign agent → backend service calls (HMAC or mTLS) so backends can
   distinguish a real agent request from a spoofed `X-Patient-Id`.

---

## C-5 — Admin role bypasses EHR consent checks

**Location:** `backend/services/ehr_service/app/services/record_service.py:38-41`

```python
if principal.role != "admin" and not _is_clinician(principal):
    ...
if principal.role != "admin" and not await _has_active_consent(...):
    ...
```

Both gates skip when the role is `admin`. PHI is readable with no
consent and, in current code, no dedicated audit reason. HIPAA's minimum
necessary rule and most regional equivalents prohibit this.

**Fix**

1. Remove the admin shortcut — `admin` must still pass the consent
   check, or take an explicit `break-glass` path that writes a high-
   severity audit record and notifies a security mailbox.
2. Require a documented `access_reason` field on every privileged
   access path.

---

## C-6 — Open CORS on the API gateway

**Location:** `backend/services/api_gateway/app/main.py:150`

```python
allow_origins=["*"]
```

Combined with the cookie/JWT auth used elsewhere, this lets any site in
a logged-in user's browser issue authenticated requests against MedApp.

**Fix**

1. Read an explicit allowlist from environment (`CORS_ALLOWED_ORIGINS`).
2. Reject `*` with credentials at startup.
3. Default to an empty list in non-dev environments.

---

## C-7 — Web auth tokens in `localStorage`

**Locations**
- `frontend/hms_web/src/lib/stores/auth.store.ts:32`
- `frontend/pms_web/src/lib/api/client.ts:11`
- `frontend/admin_web` (intended pattern, app is mostly skeleton)

Any XSS, supply-chain compromise, or browser extension exfiltrates the
token and yields full session takeover. Mobile correctly uses
`expo-secure-store`; the web apps do not.

**Fix**

1. Move auth to httpOnly, `SameSite=Lax`, `Secure` cookies set by a
   Next.js route handler that proxies the backend login.
2. Drop the client-side token store entirely; the cookie is enough.
3. Add `middleware.ts` route guards in each web app.

---

## C-8 — Webhook signature handling is broken or missing

**Locations**
- `backend/services/payment_service/app/routers/webhooks.py:29` — Stripe
  signature verified against the hardcoded `"change-me"` secret.
- `backend/services/payment_service/app/routers/webhooks.py:42-44` —
  M-Pesa endpoint accepts raw payload with no signature check.
- `backend/services/pms_service/app/config.py:28` — PMS webhook secret
  default is `"set-a-real-secret-in-production"`.

**Attack**

Any party can forge a payment confirmation, refund, or dispense event,
corrupting payment ledgers and dispense audit trails.

**Fix**

1. Replace defaults with `os.environ[...]` (no fallback) and fail
   closed.
2. Add HMAC-SHA256 verification for M-Pesa using the IPN
   passkey/timestamp pattern.
3. Capture the raw request body before any JSON parsing (Stripe
   requires this).

---

## C-9 — Profile PATCH allows privilege escalation

**Location:** `backend/services/user_service/app/routers/profiles.py:25-26`

```python
for field, value in payload.items():
    setattr(user, field, value)
```

There is no field allowlist. A user can PATCH `role`, `kyc_status`, or
`is_active` and immediately become an admin.

**Fix**

1. Define an explicit `ALLOWED_PROFILE_FIELDS = {…}` set.
2. Reject any payload key not in the set with a 400.
3. Add a regression test that asserts `role` cannot be PATCHed by a
   normal user.

---

## C-10 — Kubernetes pods run as root with writable root FS

**Location:** every manifest under `infra/k8s/base/`

No `securityContext`, no `runAsNonRoot`, no `readOnlyRootFilesystem`, no
`allowPrivilegeEscalation: false`, no `NetworkPolicy`. The dev overlay
uses the `latest` tag (`infra/k8s/overlays/dev/kustomization.yaml:9`)
which is mutable.

**Fix (minimum)**

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

Add default-deny `NetworkPolicy` per namespace and pin every image to a
SHA in overlays.

---

## C-11 — Docker Compose hardcoded credentials

**Location:** `infra/docker/docker-compose.yml`
- Postgres `medapp/medapp` (l. 12-13)
- MongoDB `medapp/medapp` (l. 30-31)
- RabbitMQ `medapp/medapp` (l. 52-54)
- `HMS_JWT_SECRET=change-me-in-production` (l. 164)
- `PMS_JWT_SECRET=change-me-in-production` (l. 174)
- `PMS_MEDAPP_WEBHOOK_SECRET=change-me-in-production` (l. 175)

Local-only is fine in spirit, but the same image is what teams docker-
compose-up in shared dev VMs. Treat compose as configuration, not
secret distribution.

**Fix**

Move every credential into an `.env` referenced by compose; ship only
`.env.example` with placeholder text and a `make secrets` target that
generates random values.
