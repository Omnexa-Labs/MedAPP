# API contract — `user_service`

## Admin Google Workspace SSO — 2026-09-14

Public gateway prefix: `/v1/auth/admin-sso`; direct service prefix:
`/auth/admin-sso`. The existing provider-attempt tables from migration
`20260913_0007` store short-lived, hashed proofs with separate admin stages.
No additional table is introduced by this flow.

| Method and suffix | Request | Result |
| --- | --- | --- |
| `GET /config` | None | `enabled`, dedicated `client_id` or null, and `hosted_domains`. |
| `POST /begin` | Stable `X-Device-Id`, maximum 64 characters | Single-use `challenge_token`, `nonce`, `expires_in: 300`, client ID and domain hints. Limited to ten provider attempts per device in five minutes. |
| `POST /complete` | Same device; `{challenge_token, identity_token}` | A normal token pair, or `mfa_required`, a fresh `challenge_token` and expiry. |
| `POST /verify` | Same device; `{challenge_token, code}` | Normal token pair after the account's enrolled authenticator or recovery-code proof succeeds. |

All responses use `Cache-Control: no-store`. Missing configuration returns 503;
expired, replayed, wrong-device or invalid signed proofs return 401; an unauthorized
Workspace/account returns 403. Two-factor failures retain the existing durable
attempt budget and lockout behavior.

Set `USER_ADMIN_GOOGLE_CLIENT_ID` to a dedicated Google web client and
`USER_ADMIN_WORKSPACE_DOMAINS` to comma-separated exact managed domains. Both
default to blank. Wildcards, URLs and malformed domains leave the flow disabled.
The admin audience is checked separately from `USER_GOOGLE_CLIENT_IDS`.

The server verifies Google's signature, issuer, expiry, audience, authorized party
and nonce, then requires a verified email and an allowed signed `hd` claim. The
email domain must equal that managed domain. Google's stable `sub` must already be
connected to an active MedApp `admin` or `platform_admin`, whose current email must
match. Email matching does not connect, create or elevate accounts. The account
and provider link are checked again after the account lock, including after MFA.
Successful completion records `admin_sso.succeeded` without provider token content.

The admin browser/BFF now keeps token pairs and pending backend challenges in its
own Redis namespace, binds callbacks to a scoped browser attempt, retains the
device ID through MFA/refresh/logout, and checks current administrator role,
Workspace domain and Google connection for each proxied review request. Local
sessions last eight hours. The console README describes cookie and review behavior.
Real Workspace consent and deployed browser/session acceptance remain unverified.

## Approved clinician activation — 2026-09-14

`POST /internal/professional-activations` is a server-only receiver for the
onboarding worker. It requires `X-Activation-Secret`, checked against
`USER_ONBOARDING_ACTIVATION_SECRET` (at least 32 characters; blank disables it).
It is not registered as a public gateway route and accepts only doctor/nurse
activation commands with an application ID, applicant ID, independent reviewer ID,
approval version, professional name/specialty and the provisioned profile ID.
The worker must first obtain that profile from the matching profile service.

The account row is locked using the same lock as session renewal. An inactive
account or a different professional/administrator role returns a conflict without
changing the role. A receipt keyed by application ID and the full command hash
prevents duplicate grants or reuse with different data. The role update, receipt
and `professional.activated` audit entry commit together. Replaying an old receipt
after access was revoked returns a conflict; it cannot restore the former role.
Profile services likewise retain receipts, preserve existing edits and reject
inactive or missing previously provisioned profiles.

Responses contain application/applicant/role/profile identifiers, never tokens.
Existing access tokens retain their issued permissions until normal session
renewal. The mobile return/status refresh already uses that renewal path.
`active` in application-activation history records completion of provisioning;
current authorization still comes from the live account and profile checks.

Deployment requires user migration `20260914_0009`, doctor `20260914_0002`, nurse
`20260914_0002` and onboarding `20260914_0003`. Use separate
`USER_ONBOARDING_ACTIVATION_SECRET`, `DOCTOR_ONBOARDING_ACTIVATION_SECRET` and
`NURSE_ONBOARDING_ACTIVATION_SECRET` values. Compose supplies the matching values to
the onboarding worker. Enable `ONBOARDING_ACTIVATION_ENABLED` after migrations and
receiver configuration. Outside Compose, configure the worker's
`ONBOARDING_ACTIVATION_{USER,DOCTOR,NURSE}_URL` and corresponding `_SECRET` values.
The default internal service ports are 8001, 8002 and 8003 respectively.

Approval and queue insertion share one onboarding transaction. The worker processes
one due job at a time, with PostgreSQL `FOR UPDATE SKIP LOCKED` and bounded HTTP
requests. A process failure rolls back the job; receiver receipts make replay safe.
Transient failures back off, while configuration/account conflicts require review.
Owners and administrators can read `GET /v1/onboarding/applications/{id}/activation`.
Administrators can retry with `POST .../activation/retry` and the current `If-Match`
application version; applicants cannot retry privileged activation themselves.

Hospital activation now uses `GET /internal/professional-activations/subjects/{applicant_id}`
with the same receiver secret to confirm account readiness. Missing/inactive accounts
return 409. This check changes no role and creates no activation receipt: the
applicant's existing MedApp role is retained, while the hospital directory and HMS
record organization ownership and scoped staff membership. The worker reports
`active` after both organization receivers succeed; see [the HMS contract](hms_service.md).
Pharmacy approvals still require their deployment adapter. Legacy approvals without
activation records/frozen commands need reconciliation and are not silently backfilled.
The reviewer console is implemented; production configuration, live-provider and
rendered acceptance remain open. The completion baseline records validation.

**Prefixes:** `/v1/auth`, `/v1/me`, `/profile` · **Source:** `app/schemas/`
· **Client:** `src/features/auth/api.ts`

> Retro-documented 2026-08-07. Written before the documentation rule; the gaps below were not
> previously recorded anywhere.

## Routes

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/v1/auth/signup` | `SignupRequest` | 201 `UserOut` (no tokens; sign in afterward) |
| POST | `/v1/auth/login` | `LoginRequest` | `TokenPair` or `LoginChallenge` for enrolled accounts |
| POST | `/v1/auth/refresh` | `RefreshRequest` | `TokenPair` |
| POST | `/v1/auth/logout` | `LogoutRequest` | — |
| POST | `/v1/auth/otp/signup-start` | `{channel: "email", email}` or `{channel: "sms", phone}` | `{sent: true, expires_in, resend_after_seconds}` |
| POST | `/v1/auth/otp/signup-verify` | Same channel/contact + six-digit `code` | `{verification_token, expires_in}` (signup proof, not a session) |
| POST | `/v1/auth/password/forgot` | `{email}` | 202 `{status: "ok", resend_after_seconds: 30}` |
| POST | `/v1/auth/password/reset` | `{token, new_password}` | 200 `{status: "ok"}` |
| POST | `/v1/auth/password/change` | `{current_password, new_password}` + bearer token | 204 |
| GET / PATCH | `/v1/me` | profile | user |
| GET | `/v1/me/sessions?offset=0&limit=25` | bearer token; limit 1–100 | `SessionPage` |
| DELETE | `/v1/me/sessions/{session_id}` | bearer token | `{current_session_revoked: boolean}` |
| GET | `/v1/me/two-factor` | bearer token | `{enabled, available, recovery_codes_remaining, sign_out_delay_seconds}` |
| POST | `/v1/me/two-factor/setup` | bearer + `{current_password}` | `{setup_id, secret, provisioning_uri, recovery_codes, expires_in: 600}` |
| POST | `/v1/me/two-factor/confirm` | bearer + `{setup_id, code}` | 204; enables and revokes refresh sessions |
| POST | `/v1/me/two-factor/disable` | bearer + `{current_password, code}` | 204; removes enrollment and revokes refresh sessions |
| POST | `/v1/me/two-factor/recovery-codes` | bearer + `{current_password, code}` | `{recovery_codes}`; replaces codes and revokes refresh sessions |
| POST | `/v1/auth/two-factor/verify` | `{challenge_token, code}` + same `X-Device-Id` as login | `TokenPair` after a valid second factor |
| GET | `/v1/auth/providers/config` | none | `{google: boolean, apple: boolean}`; configured audiences only |
| POST | `/v1/auth/providers/begin` | `{provider: "google" \| "apple"}` + `X-Device-Id` | `{challenge_token, nonce, expires_in: 300}` |
| POST | `/v1/auth/providers/complete` | `{challenge_token, identity_token}` + same device | `TokenPair`, `LoginChallenge`, or a signup/link ticket |
| POST | `/v1/auth/providers/link` | `{ticket, current_password, code?}` + same device | `TokenPair` after password and any enrolled second factor |
| GET | `/v1/me/providers` | bearer | `{items: [{provider, connected_at}]}` for this account |
| POST | `/v1/me/providers/{provider}/disconnect` | bearer + `{current_password, code?}` | 204; disconnects and revokes refresh sessions |
| POST / GET | `/v1/auth/kyc`, `/kyc/pending`, `/kyc/{id}/review` | KYC | `KycSubmissionOut` |

## Schemas

**`TokenPair`** — `access_token`, `refresh_token`, `token_type` (`"bearer"`), `expires_in`
(access TTL in **seconds**).

**`SignupRequest`** — `email`, `password` (8–128), `first_name`, `last_name`, `phone?`,
`role` (default `"user"`), `verification_token?`, `provider_ticket?`, `dob?`, `gender?`, `blood_type?`, `primary_goal?`.

**`RefreshRequest`** — `refresh_token`, `biometric` (bool).

**`KycSubmitRequest`** — `target_role` (`doctor | nurse | hospital_admin`), `documents` (≥1
`KycDocument{kind, url, notes?}`).

## Gaps and hazards

### Google and Apple provider identities (2026-09-13)

`src/features/auth/provider-api.ts` owns the mobile contract. Native token acquisition
is in `native-providers.tsx`; unsupported/unconfigured builds retain email sign-in.
See [provider configuration and acceptance steps](../PROVIDER_SIGN_IN_SETUP.md).

The server's public-key URLs are fixed to Google/Apple. Tokens must be RS256 and
match the issuer, configured audience, authorized party when present, expiry,
issued-at time, stable subject and server-issued nonce. Public keys are cached for
five minutes; fetch attempts are at least 30 seconds apart per provider/process.
Failed key retrieval returns 503 and does not accept an unverified token. Provider
tokens never enter the database, logs, route params or persistent mobile storage.

All provider responses use `Cache-Control: no-store`. Begin/complete/link require
the same `X-Device-Id`. Opaque challenge/ticket values are saved only as hashes;
completed proofs cannot be reused. The gateway's auth request limit applies and the
service also caps recent begin attempts at ten per install. Expired attempt rows
are pruned when the flow is used; run equivalent expiry cleanup during operations
if the provider routes are dormant for long periods.

For a new identity, `complete` returns
`{action: "signup_required", ticket, provider, email, display_name, expires_in: 1200}`.
The regular signup body must include both `provider_ticket` and a valid independent
email OTP `verification_token` for that same email. Personal details, password,
email verification and provider association commit together. No role other than
`user` can be claimed. Google is not authoritative for every third-party email,
so the provider's `email_verified` claim does not replace the app's signup OTP.

When the email already exists but the provider subject is not connected, `complete`
returns `{action: "link_required", ticket, provider, email, two_factor_required,
expires_in: 300}`. `link` requires the current MedApp password and, when currently
enabled, a valid authenticator/recovery code. Failures commit the account's existing
attempt budget. A password change invalidates a pending linking ticket. Linking
does not change the role or the existing email-verification flag. An ambiguous
case-insensitive email match is rejected; emails are never automatically linked.

Returning identities resolve by `(provider, subject)`, including when the provider
omits email. Enrolled accounts enter the existing two-factor challenge before any
tokens are issued. Identity lookup/issuance and disconnect serialize on the account
row. A disconnect invalidates pending two-factor challenges and refresh sessions;
it does not revoke already-issued short-lived access tokens, delete records, delete
provider accounts or revoke consent at Google/Apple. All new provider accounts also
have a MedApp password, so disconnect leaves a working password fallback.

Migration `20260913_0007` adds provider identities with unique provider/subject and
account/provider constraints plus indexed, expiring attempts. It does not connect
existing users. Downgrade refuses while connected identities exist. Credentials
and real native builds remain unconfigured; synthetic-signature software tests do
not establish live provider, visual or device acceptance.

### Authenticator two-factor authentication (2026-09-13)

Security & privacy opens `/(app)/two-factor`. Setup requires the current password,
then displays a time-based authenticator key, an `otpauth://` app link and ten
recovery codes. The mobile screen requires acknowledgement that recovery codes
were saved and a valid six-digit authenticator code before activation. Setup
expires after ten minutes; restarting replaces the pending key. Password changes
and resets invalidate pending setup through its password-version binding. Signup
never enrolls automatically.

The server uses PyOTP (SHA-1, six digits, 30 seconds, adjacent step tolerance),
records the last accepted step, and rejects already used steps. A recovery code
has 80 random bits and is stored only as an account-bound SHA-256 hash; each code
works once. Five failed setup/management/code proofs lock the account's factor
checks for 15 minutes. Restarting setup or obtaining a new login challenge does
not reset that budget. Expected proof errors return 400/429 without rolling back
the failure counter. Unknown, expired, consumed or mismatched challenges return
401. Unavailable encryption returns 503; valid recovery codes remain usable.

For an enrolled account, correct email/password returns HTTP 200
`{mfa_required: true, challenge_token, expires_in: 300}` with **no access or refresh
token**. The challenge is opaque, hashed, bound to the password version, enrollment
generation and device header, and cannot authorize API reads. Verification accepts
the authenticator or a saved recovery code. Only the newest challenge per install
is active. The legacy phone OTP login cannot issue tokens for an enrolled account;
it directs the caller to password plus authenticator/recovery sign-in. Password
reset leaves active enrollment in place and invalidates outstanding challenges.

Enable, disable and recovery-code replacement revoke existing refresh sessions;
access JWTs retain their configured expiry. Subsequent password sign-in must follow
the account's new setting. Normal rotation and biometric unlock of a session
established after two-factor verification continue using that session. Biometric
client metadata is not a substitute for a factor proof.

Enrollment and challenge operations serialize with refresh/revocation on the User
row. Migration `20260913_0006` adds `two_factors` and `two_factor_challenges` without
enrolling existing users. Secrets use Fernet authenticated encryption with the
separate `USER_MFA_ENCRYPTION_KEY`; decrypted payloads are bound to account and
generation. Setup and proof/token responses use `Cache-Control: no-store`.
The mobile client keeps setup/challenge material only in component memory, clears
it on account change, and guards sensitive HTTP retries against identity changes.
A lost confirmation response offers a status check before further action.

Deployment requires the migration and a securely generated, backed-up Fernet key
in the user-service secret store. `.env.example` documents generation; Compose
passes the value through, and Helm already reads the per-service Secret via
`envFrom`. Do not substitute a JWT signing key or replace the encryption key
without re-encrypting existing factor records. With an empty key, setup is shown
as unavailable; enrolled accounts still require a factor. No production secret,
migration or deployment was performed for this change. Native authenticator-app
handoff, theme, accessibility and reference acceptance remain pending.

Implementation references: [PyOTP](https://pyauth.github.io/pyotp/) and
[Fernet](https://cryptography.io/en/latest/fernet/).

### Mobile biometric credentials (2026-09-13)

Biometric enrollment is now an explicit post-login action in Security & privacy.
The mobile client encrypts its refresh credential with Expo Crypto AES-GCM and
protects the key with native SecureStore authentication. Enrolled cold starts and
explicit locks require device authentication before `/v1/auth/refresh`; no ordinary
access/refresh token remains stored alongside the enrolled credential. Routine
renewal reseals the successor using the key already unlocked for that app session.
The client persists rotated refresh credentials before requesting `/v1/me`, so
temporary profile-read failures can retry with the current token.

This uses the existing refresh endpoint and adds no backend biometric enrollment
record or migration. `biometric: true` remains client-reported audit metadata; it
is not server-verified biometric proof or two-factor authentication. Enrollment is
local to this device and is removed on sign-out or a new password sign-in. Native
key invalidation, cancellation and network errors have separate recovery paths.
Physical-device enforcement remains unverified; see the mobile auth README for
the implementation and acceptance checklist.

Password change already revokes all outstanding refresh sessions, including the
current one. The security screen now clears the password fields after success and
offers sign-in again, which removes local credentials/enrollment and returns to
login. It no longer promises uninterrupted sign-in after changing the password.
Existing access JWTs still retain their normal expiry.

### Active sessions (2026-09-13)

The Security & privacy screen opens `/(app)/active-sessions`. Its authenticated list
contains only the current account's unexpired, unrevoked refresh sessions. `SessionPage`
returns `items`, nullable `next_offset`, `current_session_known` and
`sign_out_delay_seconds`. Each item contains `id`, `started_at`, `last_refreshed_at`,
`expires_at`, nullable `user_agent`/`ip_address`, and `is_current`. Token values,
hashes and device credentials are never included. User-agent labels describe only
the reported platform; unknown clients remain unidentified.

New sign-ins create a stable session UUID and start time. Refresh rotation keeps
that identity and places it in the signed access token's `sid` claim. Legacy rows
without a family use their existing token-row UUID; their next refresh preserves
that UUID as the family. Legacy access tokens without `sid` return
`current_session_known=false`; current-device identity is never inferred from IP
or user-agent. Pagination orders by session start and UUID, with offsets into the
currently active list. Concurrent sign-ins or removals can change page membership;
Refresh sessions reloads the list and the client deduplicates loaded families.

DELETE returns 404 for a session outside the account or a missing session. For an
owned session it revokes the entire refresh family, including rotated ancestors,
and is idempotent. Logout also closes that family when given an older rotated token.
Refresh and family revocation serialize on the owning account row so a simultaneous
rotation cannot leave a usable successor after revocation. Deliberately revoked
tokens return 401 without ejecting unrelated sessions; the existing whole-account
protection for reuse of a rotated, non-revoked-family token remains in place.

**Existing access JWTs retain their expiry**, normally up to 15 minutes. The API's
delay value reflects the configured access-token TTL, and the mobile confirmation
explains this delay. Revoking the current session also clears local sign-in and
returns to login. This contract does not provide immediate access-JWT revocation.

Apply migration **`20260913_0005`** before deploying this user-service version. It
adds nullable `session_id` and `session_started_at` to `refresh_tokens` plus the
session-ID index. Existing accounts and token rows are retained. Downgrade removes
family metadata, preserving those rows; re-upgrade restores nullable fields and
later refreshes establish legacy identities again. PostgreSQL 16 checks cover
legacy upgrade, downgrade/re-upgrade, competing refreshes and overlapping refresh/
revocation. Live loopback gateway checks also cover rotation and both remote and
current-session revocation. No production migration was performed.

### Signup personal details (2026-09-13)

The multi-step signup adapter includes Step 2 details in the original signup request. The
user service stores them in the same transaction as account creation; no follow-up profile
write is required. Legacy clients may omit them. `/v1/me` returns them after a new login or
refresh, and the mobile profile shows the stored values with an explicit self-reported blood
type label. Missing details display "Not provided".

| Field | Signup / PATCH `/v1/me` | Meaning |
| --- | --- | --- |
| `dob` | ISO calendar date or null; must be at least 13 years before today by birthday | Existing date column; the mobile field is `dateOfBirth`. |
| `gender` | `female`, `male`, `nonbinary`, `other`, or null | The signup form's choices; older stored strings remain readable. |
| `blood_type` | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, or null | Optional, self-reported; not clinical verification. |
| `primary_goal` | `meds`, `vitals`, `tele`, `wellness`, or null | The patient's selected primary health goal. |

Both signup and profile updates validate these values. Invalid input returns 422 before any
account/field changes. PATCH updates only supplied fields and permits explicit null to clear
these optional values. It remains scoped to the signed-in user; role, verification flags and
other privileged fields remain excluded from its allowlist.

The patient profile editor (`/(app)/edit-patient-profile`) reads a fresh `/v1/me`
before editing and PATCHes only changed names/personal details. The mobile adapter
retains `firstName` and `lastName` separately from `displayName`. The confirmed PATCH
response updates the current account and editor cache; failures keep the draft for
retry, and a late response cannot replace a different signed-in account.

PATCH name validation trims surrounding whitespace and limits each name to 255
characters. A supplied `first_name` must be nonempty. `last_name` may be an empty
string for a person with one name. Explicit null is rejected for either name; an
omitted name is unchanged. Existing name aliases use the same validation. These
checks return 422 before any fields are changed and require no additional migration.

Apply user-service migration **`20260913_0004`** with `python -m alembic upgrade head` from
`backend/services/user_service` before deploying the new service code. It adds nullable
`blood_type` and `primary_goal` columns; existing accounts retain their data. Downgrading this
revision removes the two new columns and their values. Forward/reverse/forward migration and
API persistence were tested on a disposable PostgreSQL 16 database, as well as SQLite tests.

Signup's biometric, two-factor and care-team options remain disabled and off. Biometric
and authenticator setup are available in Security & privacy after account creation; signup points there.
Completing or skipping Step 3 does not record research consent, grant
record access, or activate a security feature. The misleading research field name and the
unverified compliance/audit claims were removed from that screen. Provider selection
and scoped EHR consent remain required work.

If account creation succeeds but automatic login or local session storage fails, the final
screen confirms that the account/details were saved and offers sign-in. It does not resubmit
signup. A network failure before creation is confirmed retains the normal retry/error path;
idempotent recovery from an uncertain creation response remains separate work.

### Email signup verification (2026-09-13)

The mobile signup flow uses **email first**, as chosen by the product owner. It sends the address
from Step 1 through the existing SMTP integration. SMS delivery still requires a real provider;
the legacy backend SMS transport logs messages and is not exposed as a delivery option in this screen.

Both signup OTP endpoints are unauthenticated. `signup-start` returns two independent durations
in seconds: code lifetime (`expires_in`, default 300) and resend wait (`resend_after_seconds`,
default 30). The mobile screen shows separate countdowns and rechecks elapsed time on foreground.
Existing contacts return 409, cooldown violations return 429, invalid fields return 422, and
unconfigured or failed email delivery returns 503. A failed send rolls back the undelivered code,
allowing a retry. SMTP acceptance does not guarantee arrival in an external inbox.

`signup-verify` accepts only the latest issued code. Incorrect attempts persist across requests
and are capped at five by default; expired, exhausted, consumed, and superseded codes return 400.
The verification query locks the latest row on PostgreSQL. Local SQLite tests verify sequential
behavior only; concurrent PostgreSQL acceptance is pending. Expected verification rejections return
400 responses without raising through the database dependency, so its transaction saves the
attempt counter. Unexpected failures retain normal rollback behavior.

Successful verification returns a contact-bound proof token valid for 900 seconds. The final
`signup` request includes it as `verification_token`, then signs in separately. Matching email
proof marks `email_verified=true`; it does not mark the phone verified. Legacy requests without
proof still create unverified accounts, and mismatched or invalid proof does not verify them.

### Password recovery (2026-09-12)

The mobile recovery route requests an email, accepts the complete opaque reset code from that
email, and submits a new password (8–128 characters). The code is not a six-digit OTP. It remains
in local form state and is cleared after success. Both recovery calls are unauthenticated;
the gateway removes `/v1` before forwarding them to `/auth/password/...`.

Known, unknown, inactive, and recently requested accounts receive the same 202 body. Known
active accounts receive at most one email per configured cooldown in sequential requests.
The default resend cooldown is 30 seconds. Reset codes expire after 30 minutes by default,
are stored as hashes, and are single-use; successful reset revokes existing refresh tokens.
Existing access tokens retain their normal expiry. Incorrect, expired, used, or inactive-account
codes return 400. Invalid request fields return 422.

Email delivery uses SMTP for both password recovery and email OTP. Set `USER_SMTP_HOST` and
`USER_SMTP_FROM_EMAIL` in the user service environment. Optional settings are
`USER_SMTP_PORT` (587), `USER_SMTP_USERNAME`, `USER_SMTP_PASSWORD`,
`USER_SMTP_SECURITY` (`starttls`, `ssl`, or `none`), and `USER_SMTP_TIMEOUT_SECONDS` (10).
Use `none` only with a local development mail catcher. TLS uses normal certificate validation.
The root `.env.example` documents these names and the Compose user-service mapping forwards them.
Start Compose with that environment file when it is outside the Compose directory.

Missing host/sender produces 503 for every email address, and the mobile form shows recovery
as temporarily unavailable. A recipient-specific transport failure retains the generic 202
response and emits `password_reset.email_delivery_failed` without message content. There is
no durable mail retry queue yet; monitor transport failures and use resend after the cooldown.
A 202 confirms acceptance, not inbox delivery. No external email provider has been configured
or verified as part of local implementation.

### Existing items

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

## Partner website handoff (2026-09-14)

Public gateway prefix: `/v1/auth/partner-handoffs`; direct service prefix:
`/auth/partner-handoffs`. Migration `20260914_0008` adds hashed, single-use proofs.

| Method and suffix | Authorization | Contract |
| --- | --- | --- |
| `POST /` | Current bearer and matching `X-Device-Id` on a live refresh family | Accepts optional `application_id`, exact allowed `return_uri`, and random `return_state` (32–64 URL-safe characters). Returns `handoff_id`, `url`, and `expires_in: 120`. |
| `DELETE /{handoff_id}` | Current bearer, owner only | Invalidates an unused proof; idempotent 204. |
| `POST /inspect` | `X-Partner-Handoff-Secret`, server only | Accepts `{code}` and returns the verified account name/email/id for explicit confirmation. No session tokens. |
| `POST /redeem` | Same server credential | Consumes `{code}` once, rechecks source family/account, and returns a separate token pair, user ID, fixed application destination and validated return URL. |

The URL fragment contains only the short-lived proof. Password changes, source
logout, account deactivation, cancellation, expiry and replay invalidate it.
Ordinary refresh rotation preserves the source family. Issuance is limited to ten
links per owner per five minutes. Tokens use the current account role; neither
`application_id` nor a return callback changes authorization or activates a profile.
The application pointer is not ownership evidence; onboarding still checks ownership.

`USER_PARTNER_WEB_ORIGIN` must match the deployed partner origin and mobile
`PARTNER_ONBOARDING_URL`. HTTPS is required except local development hosts.
`USER_PARTNER_HANDOFF_SECRET` and the website's `PARTNER_HANDOFF_SECRET` must contain
the same dedicated secret of at least 32 characters; missing setup returns 503.
Never put this secret in Expo extras or a `NEXT_PUBLIC_` variable. Both
`USER_PARTNER_RETURN_URIS` and website `PARTNER_RETURN_URIS` explicitly allow return
addresses. The native default is `medapp://onboarding-status`; mobile web deployments
must additionally allow their exact `/onboarding-status` URL. Query strings and
fragments are forbidden in configured base return addresses. The website adds only
the random state, then closes its session before returning to MedApp.

## Hospital website handoff (2026-09-14)

Public gateway prefix: `/v1/auth/hospital-handoffs`; direct service prefix:
`/auth/hospital-handoffs`. Migration `20260914_0010` adds a portal discriminator to
the existing proof table, preserving old proofs as partner proofs. Hospital and
partner endpoints cannot inspect, redeem or cancel each other's proofs. Downgrade
removes ephemeral hospital proofs before dropping the discriminator; it preserves
account and refresh-session data.

| Method and suffix | Authorization | Contract |
| --- | --- | --- |
| `POST /` | Current bearer and matching `X-Device-Id` on a live refresh family | Accepts only exact allowed `return_uri` and random `return_state` (32–64 URL-safe characters). Returns `handoff_id`, fragment URL and `expires_in: 120`. Application, hospital and role overrides are rejected. |
| `DELETE /{handoff_id}` | Current bearer, owner only | Invalidates that owner's hospital proof; idempotent 204. |
| `POST /inspect` | `X-Hms-Handoff-Secret`, server only | Accepts `{code}` and returns the account identity for explicit confirmation, without session tokens. |
| `POST /redeem` | Same server credential plus generated 64-character hexadecimal `X-Device-Id` | Consumes `{code}` once and returns a separate device-bound token pair, current user ID, fixed `/workspaces` destination and allowed return URL. |

The same source-account/family, expiry, password-change, cancellation and replay
checks apply as for partner handoff. Rate limits count both portals together.
MFA enrollment and recovery revoke source families; handoff requires an already
authenticated active session and cannot assert a factor from callback data.
The new browser session preserves the current MedApp role and grants no hospital
membership. Signing it out leaves the original source session active.

Configure `USER_HMS_WEB_ORIGIN` to match the mobile app's `HMS_WEB_URL` and the
portal origin. `USER_HMS_HANDOFF_SECRET` must match `HMS_WEB_HANDOFF_SECRET`, have
at least 32 characters and differ from the partner handoff credential. Both
`USER_HMS_RETURN_URIS` and `HMS_WEB_RETURN_URIS` must allow the return address.
The native default is `medapp://hospital-workspaces`; web deployments additionally
allow their exact `/hospital-workspaces` URL. These are base addresses without
query strings or fragments; the server adds only `handoff_state`. HTTPS is required
outside configured local development hosts. Missing configuration returns 503.

The hospital portal stores the resulting credentials and return URL only on the
server. It rejects a different existing browser account, requires confirmation,
and takes the user to live workspace selection. Return to MedApp closes that
browser session first; the mobile callback only refreshes memberships. See the
[HMS contract](hms_service.md) for workspace authorization and browser sessions.

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
