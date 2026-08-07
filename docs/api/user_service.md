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

---

## `GET /users/{user_id}` - service-to-service identity lookup (added 2026-08-07)

**Internal path:** `http://user_service:8001/users/{user_id}` | **Public path:** none, deliberately.

Other services store only a user id (`author_user_id`, `sender_user_id`) and had no way to resolve
a name - `GET /me` answers for yourself only. That blocked social_service from denormalising
`author_name` onto a post and inbox_service from naming a thread counterparty.

Per the CTO rule, this endpoint genuinely did not exist. It is the minimum that unblocks identity
resolution and nothing more.

### NOT in the gateway ROUTES, on purpose
A public "look up any user by id" is a **patient enumeration surface**: with leaked or guessable ids
it becomes a directory of everyone on the platform. Service-to-service callers are already inside
the trust boundary and are the only consumers that need it. Exposing it to the app is a separate
decision needing rate limiting and a threat model, not an extra line in ROUTES.

### Returns
`user_id`, `display_name`, `role`. **That is all.**

NOT email, phone, dob, gender, kyc_status, medical_history, allergies or consents. `UserOut` carries
several of those and is the self-view; this answers "whose name goes on this post".

**No avatar - the `User` model has no avatar column.** Clinician photos live on
`doctor_service.photo_url`. A consumer needing one must resolve it from the role-specific service.
Returning a null `avatar_url` here would imply the concept exists and is merely unset.

### Verified live
| Case | Result |
| --- | --- |
| service-to-service, authenticated | `{"user_id": "...", "display_name": "Ama Mensah", "role": "user"}` |
| same call with no token | **401** |
| via the public gateway | **404 unknown route** - not exposed |

Inactive users return **404, not 403**: a deactivated account must not be distinguishable from one
that never existed, because the difference is itself information about a real person.

### Consequence for step 2 of the Community plan
`author_name` is now resolvable. `author_avatar_url` is **still not** - there is no avatar anywhere
in user_service. Options: resolve clinician photos from `doctor_service`, add an avatar column to
`User`, or ship the feed with initials. That is a product call, not a wiring one.
