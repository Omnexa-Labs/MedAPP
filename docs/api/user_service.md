# API contract — `user_service`

**Prefixes:** `/v1/auth`, `/v1/me`, `/profile` · **Source:** `app/schemas/`
· **Client:** `src/features/auth/api.ts`

> Retro-documented 2026-08-07. Written before the documentation rule; the gaps below were not
> previously recorded anywhere.

## Routes

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/v1/auth/signup` | `SignupRequest` | `TokenPair` |
| POST | `/v1/auth/login` | `LoginRequest` | `TokenPair` |
| POST | `/v1/auth/refresh` | `RefreshRequest` | `TokenPair` |
| POST | `/v1/auth/logout` | `LogoutRequest` | — |
| POST | `/v1/auth/otp/signup-start`, `/signup-verify` | OTP | — / `TokenPair` |
| POST | `/v1/auth/forgot`, `/reset`, `/change` | password flows | — |
| GET / PATCH | `/v1/me` | profile | user |
| POST / GET | `/v1/auth/kyc`, `/kyc/pending`, `/kyc/{id}/review` | KYC | `KycSubmissionOut` |

## Schemas

**`TokenPair`** — `access_token`, `refresh_token`, `token_type` (`"bearer"`), `expires_in`
(access TTL in **seconds**).

**`SignupRequest`** — `email`, `password` (8–128), `first_name`, `last_name`, `phone?`,
`role` (default `"user"`), `verification_token?`.

**`RefreshRequest`** — `refresh_token`, `biometric` (bool).

**`KycSubmitRequest`** — `target_role` (`doctor | nurse | hospital_admin`), `documents` (≥1
`KycDocument{kind, url, notes?}`).

## Gaps and hazards

- **`role` on signup is capped to `"user"`** — elevated roles are rejected with 422. A deliberate
  security fix: signup previously let a caller self-assign `doctor`. Elevation goes through KYC
  review, and the dev seeder provisions roles out of band for exactly this reason. Do not "restore"
  the old behaviour.
- **`hospital_admin` remains self-assignable via KYC `target_role`, and is global rather than
  per-tenant.** Open security item.
- **`expires_in` is SECONDS.** A refresh timer treating it as milliseconds expires ~1000× early.
- **Empty JWT secrets are now refused.** PyJWT would otherwise verify against an empty HMAC secret
  with only a warning, accepting any forged token. All 20 services currently share one compose
  secret; splitting them is an open item.
- **The gateway rewrites `/v1/…` for this service only** (`_rewrite_path`), so its upstream paths do
  not match the public ones. Do not infer the internal path from the public route.
