# ADR 0008 — Agent JWT auth + IDOR guard

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

The original audit
([`docs/audit/EXECUTIVE_SUMMARY.md`](../audit/EXECUTIVE_SUMMARY.md))
flagged two critical issues affecting the agent layer:

> **#2: Identical `change-me` JWT secret default across every service** —
> any service forgetting to override it accepts forged tokens for every
> other service.
>
> **#4: Unauthenticated agent `/chat` endpoints** — `X-Patient-Id` is
> taken from request body with no JWT check, then forwarded to downstream
> services as the access-control signal. Trivial IDOR against EHR.

Before this slice, an attacker could:

1. POST `{"patient_id": "<anyone's UUID>", "message": "..."}` to any
   agent's `/chat`.
2. The agent dutifully forwarded that ID as `X-Patient-Id` to EHR.
3. EHR returned the targeted patient's clinical record.

No authentication required at any step.

## Decision

### 1. JWT verification on every entry point

`make_app` adds `Depends(require_principal)` to `/chat` and exposes the
dependency at `app.state.require_principal` so service-specific routes
(`smart_recommend`'s `/analyze`, `lab_reader`'s `/scan`) can reuse the
same verification. `/healthz` stays unauthenticated for k8s probes.

The verifier reads `Authorization: Bearer <jwt>`, decodes with the
agent's configured `jwt_secret`/`jwt_algorithm` (HS256 today), and
returns a `Principal` (`subject`, `role`, raw claims). Token expiry,
missing `sub`, bad signature → 401 with an opaque error string. Missing
`jwt_secret` configuration → 503 (defensive — never silently authenticate).

### 2. IDOR guard via `enforce_patient_scope`

The patient_id used for any downstream call comes from the verified
`Principal.subject` — **never** from the request body for non-admin
tokens. Concretely:

- Body `patient_id` field becomes `Optional`.
- For patient-role tokens: body `patient_id` must match `principal.subject`
  exactly, or the request fails with **403 Forbidden**.
- For admin-role tokens: body `patient_id` may name any patient (legit
  operator workflows).
- For missing body `patient_id`: derived from the JWT subject.

`enforce_patient_scope` is exported from `agents/shared/base_agent.py`
and used both by `make_app` (on `/chat`) and by service-specific routes
(`/analyze`, `/scan`).

### 3. Production safety: fail-fast on weak secrets

`validate_jwt_secret()` is called at `make_app` construction time. If
`ENV=production` and the configured secret is empty or in
`WEAK_JWT_SECRETS` (`change-me`, `change-me-change-me-...`,
`dev-secret-key-not-for-production`, etc.), the agent **refuses to boot**.
Outside production we log a warning and return 503 on `/chat` until
configured — better than silently accepting forged tokens.

### 4. Symmetric secret today; RS256 later

Agents and `user_service` share the same `jwt_secret` (HS256). This is a
known weakness — any service compromised reveals the secret used by all
agents. The cleaner long-term shape is RS256 with agents fetching
`user_service`'s public key. That's a follow-up ADR; the current
`make_require_principal(secret, algorithm)` abstraction already supports
either.

## Consequences

- **Audit finding #4 closed for the agent layer.** Anonymous /chat → 401;
  cross-patient body attempt → 403, handler never runs. Verified by
  `agents/tests/test_make_app_auth.py` and per-service IDOR tests.
- **Audit finding #2 closed for the agent layer.** All agent configs
  default `jwt_secret = ""`; production refuses to boot if unset or weak.
  Backend services still ship `change-me` defaults — they're outside
  this slice but the same pattern applies.
- **Cost.** Tests must mint JWTs. We added `issue_test_token()` in
  `agents/shared/auth.py` so each per-service `conftest.py` exports a
  one-line `auth_header()` helper.
- **Cost.** Empty default `jwt_secret` produces a 503 with a clear log
  line until the env is set. That's friendlier than a 401 ("missing
  Authorization") that confuses an ops engineer who's correctly
  presenting a token. It's still strictly less permissive than the old
  behaviour, which let any token through.
- **Cost (deferred).** The agent's outbound `service_token` to backend
  services is still a static string with an empty default. The cleaner
  approach (mint short-lived JWTs per call, like
  `wearable_sync_service._ehr_token`) is a follow-up.

## Where this lives in code

- `agents/shared/auth.py` — `Principal`, `decode_token`,
  `make_require_principal`, `validate_jwt_secret`, `issue_test_token`,
  `WEAK_JWT_SECRETS` frozen set.
- `agents/shared/base_agent.py` — `enforce_patient_scope`, `make_app`
  wiring, `BaseAgent.jwt_secret` attribute.
- `agents/tests/test_auth.py` (16 unit cases) +
  `agents/tests/test_make_app_auth.py` (10 HTTP cases) + per-service
  auth + IDOR tests.
