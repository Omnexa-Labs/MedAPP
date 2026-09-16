# API contract — `hms_service`

**Public prefix:** `/v1/hms/*` (the gateway forwards `/v1/*` upstream).
Hospital approval activation, provisioning, workspace exchange and the HMS browser's
email/password/MFA session flow and authenticated MedApp handoff are implemented.
The deployed browser journey, live-provider/native checks and rendered screen
acceptance remain open.

## Approved hospital activation

The onboarding worker checks that the applicant account is active, then submits its
frozen reviewed command to the hospital directory and HMS. Each receiver exposes
`POST /internal/hospital-activations`, guarded by its own server-only activation
secret. These internal routes are not exposed by the gateway. Hospital IDs are
derived from the application UUID and must agree across both receivers.

The directory creates an active, private profile owned by the applicant. HMS
creates the matching database, confirms its schema version, and commits the ready
registry entry, initial `hospital_admin` membership and activation receipt together.
The worker reports `active` only after both receivers confirm success. The user's
existing MedApp role is preserved; hospital authority comes from a scoped membership.
Submitted team member details do not automatically grant staff access.

Replays preserve later edits and require the same command and current ownership.
Revoked/demoted owners, disabled workspaces, missing records and existing records
without an activation receipt require reconciliation. A failed management commit
can leave an owned physical database; the provisioning recovery rules below apply.
Legacy hospital jobs without a frozen command are not reconstructed automatically.
Pharmacy approval still requires a separate PMS deployment adapter.

Apply the hospital directory migration `20260914_0004` and HMS management migration
`20260914_0002`, together with the existing user/onboarding activation migrations.
The directory migration preserves visibility of existing rows and defaults future
rows to private. Downgrades refuse to discard ownership or activation receipts.
Directory publication and the owner-facing profile editor remain separate work.

## Tenant management

`/v1/tenants` uses a platform access token verified with `HMS_JWT_SECRET`,
`HMS_JWT_ALGORITHM`, `HMS_JWT_AUDIENCE` (default `medapp.platform`) and
`HMS_JWT_ISSUER` (default `medapp`). It requires a UUID subject, an expiry, a role,
and `typ=access`. Refresh tokens and unconfigured authentication are rejected.
The shared dependency's fallback secret is not used for these endpoints.

| Endpoint upstream | Authorization and behavior |
| --- | --- |
| `POST /v1/tenants` | Platform `admin` or `platform_admin`; provisions the database and schema before publishing a ready registry row. |
| `GET /v1/tenants` | Platform administrators see all entries. Other callers see only ready, active hospitals where they currently hold an active `hospital_admin` membership. |
| `GET /v1/tenants/{tenant_id}` | Platform administrator or current administrator of that hospital. |
| `PATCH /v1/tenants/{tenant_id}/config` | Same authorization; merges the supplied top-level configuration keys. |
| `GET /v1/tenants/{tenant_id}/roles` | Same authorization; returns active membership records. |
| `POST /v1/tenants/{tenant_id}/roles` | Same authorization; assigns or updates a hospital membership. |
| `DELETE /v1/tenants/{tenant_id}/roles/{role_id}` | Same authorization; deactivates a membership belonging to that hospital. |

A global `hospital_admin` JWT role alone grants no tenant-management rights.
Membership authorization uses the authenticated subject and requested hospital;
it does not trust a `hospital_id` hint in the token. Missing or inaccessible
hospitals return 404. Removed memberships and disabled/unprovisioned hospitals
stop granting access on the next request.

Membership and configuration writes lock the hospital registry row before
checking current authorization. Removing or demoting the last active hospital
administrator returns 409; assign a replacement first. Missing hospitals cannot
receive orphan memberships. `TenantOut` excludes `database_url` for every caller,
including platform administrators.

## Database provisioning and recovery

HMS has one management database and a separate PostgreSQL database per hospital.
Run the management migrations with `alembic -c alembic_mgmt.ini upgrade head`.
The provisioning API and `python -m app.cli.provision` use the same setup path.

Configure `HMS_ADMIN_DATABASE_URL_SYNC` for a database administrator and
`HMS_TENANT_DATABASE_URL_TEMPLATE` for the application database owner. Both must
identify the same PostgreSQL host and port. The target role must already exist;
the administrator must be able to create a database owned by it. Connection query
parameters cannot redirect setup to another host, port, database, or service.

For newly provisioned hospitals, `{tenant_slug}` is replaced by the immutable
hospital UUID without hyphens. For example, the template database
`hms_{tenant_slug}` becomes `hms_<32 hexadecimal characters>`. The display slug is
still stored separately. This prevents names such as `hospital-a` and
`hospital_a` from resolving to the same database, and avoids the old doubled
`hms_` prefix mismatch between database creation and migration.

Setup serializes competing hospital IDs and slugs in PostgreSQL, creates the
exact configured database, records `medapp-hms:<hospital UUID>` in its database
comment, and runs the tenant Alembic migrations using the configured application
owner. Database setup runs outside the API event loop. Migration execution uses
the service's Python interpreter, an absolute migration location, a bounded
subprocess timeout, and credentials supplied in its environment rather than its
command arguments. Driver errors and migration output are not relayed in API
errors or provisioning logs.

If the management transaction fails after database creation, a retry can resume
that database only when its ownership comment and database owner match. A schema
failure leaves no ready registry row. An existing database without matching
ownership evidence is left untouched and requires operator investigation. A
crash between creation and writing the ownership comment also requires this
investigation; setup never guesses ownership or deletes the database.

Replaying the same hospital ID and slug after successful setup returns its
existing active, ready record and preserves later edits. Conflicting IDs/slugs,
disabled records, or unfinished legacy registry entries require reconciliation.
Existing registered databases are not renamed or automatically migrated by this
change. Activation adds a receipt table to the management database.

## Workspace sessions and operational access

`HMS_JWT_SECRET` must match the MedApp identity key. Configure a separate
`HMS_WORKSPACE_SESSION_SECRET` of at least 32 characters, with the same value in
`GW_HMS_WORKSPACE_SESSION_SECRET`. Both signing keys must be at least 32 characters
and different. Blank configuration or `HMS_DEV_MODE=true` disables production
workspace exchange and hospital activation. Compose wires the receiver secrets
and workspace key from the root environment example; values are blank by default.

| Endpoint upstream | Authorization and behavior |
| --- | --- |
| `GET /v1/auth/workspaces` | Valid platform access token plus a live identity check; lists only active staff memberships in active, provisioned hospitals. No database URLs are returned. |
| `POST /v1/auth/workspace-session` | Same authorization; accepts only `hospital_id`, rechecks access and returns a scoped access token, expiry, user ID and workspace summary. Inaccessible selections return 404. |

The public gateway paths are `/v1/hms/auth/workspaces` and
`/v1/hms/auth/workspace-session`. `HMS_USER_SERVICE_URL` points directly to the
identity service, whose `/me` endpoint confirms the account is active and matches
the token subject. Identity outages fail closed. Responses use `Cache-Control: no-store`.
Platform administrators also need an explicit staff membership to enter clinical
operations; their management rights do not grant workspace sessions.

HMS tokens use HS256, default audience/issuer `medapp.hms`, `typ=access`, role
`hms_staff`, subject and hospital UUIDs. They expire after at most five minutes,
bounded by the parent platform token's expiry, and cannot refresh themselves.
The gateway accepts them only under the exact `/v1/hms` path boundary. Identity,
platform administration, HMS tenant management and repeated session exchange
require a platform token, so an HMS token cannot be used there.

Clinical HMS routes require an HMS session containing `hospital_id`.
The middleware verifies the subject's active staff membership before binding the
tenant context. That lookup also requires an active, provisioned registry entry.
Database pools recheck registry readiness and connection location for each new
session; a warm pool cannot keep serving a disabled hospital, and obsolete pools
are disposed when the database location changes.

Role changes and revoked membership take effect on subsequent operations, including
requests using an already-issued HMS token. Account status is rechecked at exchange;
account-only revocation can leave an existing token usable until its bounded expiry.

The HMS browser uses platform sign-in, workspace exchange and the authenticated
MedApp handoff described below. Provider configuration remains open. PMS is a separate
single-pharmacy deployment with its own staff login.

`HMS_DEV_MODE` retains its existing development-only behavior and is rejected
when `ENV=production`. Development tokens are not a production sign-in path.

## Hospital browser session boundary

`frontend/hms_web` keeps MedApp and hospital tokens in private Redis. The browser
receives an opaque HttpOnly cookie and public account/workspace information. The
portal requires `HMS_WEB_ORIGIN`, `HMS_WEB_API_URL` and `HMS_WEB_REDIS_URL`; see its
[configuration and behavior guide](../../frontend/hms_web/README.md).

| Portal endpoint | Behavior |
| --- | --- |
| `POST /api/session/login` | Same-origin email/password sign-in through the gateway, bound to a generated device ID. An existing active browser session cannot be silently replaced. |
| `POST /api/session/verify` | Authenticator/recovery-code verification bound to a private pending-attempt cookie and public attempt scope. Backend challenges stay in Redis. |
| `GET /api/session` | Renews parent credentials as needed, reloads the live account and available memberships, and returns public identity. Missing/expired sessions return `user: null`. |
| `POST /api/session/workspace` | Requires same origin, the current `X-Session-Scope` and a hospital UUID. Exchanges credentials server-side and changes the browser scope. |
| `DELETE /api/session` | Requires same origin and scope, removes the server record and revokes its device-bound refresh token. Stale scopes return 409. |
| `/api/hms/[...path]` | Finite clinical route/method allowlist. Requires a selected workspace and current scope; writes also require same origin and bounded JSON bodies. Forwards the server-held HMS token. |

The production cookie is `__Host-medapp_hms`, Secure, HttpOnly and SameSite Strict.
Its opaque handle and the server session have an eight-hour maximum lifetime.
Authentication depends on the live Redis record. Sign-out invalidates that record;
the inert cookie expires or is replaced by the next sign-in. Expiry/error/sign-out
responses do not delete cookies because a delayed response could otherwise erase
a newer sign-in. No platform or HMS bearer token is stored in browser storage.

Parent refresh and hospital exchange are serialized with Redis leases and revision
checks. Parent rotation is committed before later upstream work can fail, and a late
save cannot recreate a signed-out session. Hospital selection, membership removal
and role changes change the browser scope, replace query caches and mounted forms,
and reject late responses. Clinical mutations are never automatically replayed.
Focus, visible-page polling and cross-tab notifications reload access. Backend
membership checks remain authoritative on every clinical operation.

The proxy excludes tenant management, authentication and internal activation routes.
It strips browser bearer credentials and hospital query hints. Unsupported older
repository methods remain to be reconciled with the operational API; the allowlist
does not make those methods available. Hospital configuration, profile publication
and role-specific operational screen completion remain open. Staff onboarding uses
the explicit invitation endpoints below.

## MedApp hospital handoff

The mobile Hospital workspaces screen reads `/v1/hms/auth/workspaces` with the
current MedApp session. Settings and professional application status link to it.
It opens the configured hospital portal using a two-minute, single-use proof from
the identity service's `/v1/auth/hospital-handoffs` endpoints. See the
[identity contract](user_service.md#hospital-website-handoff-2026-09-14) for migration
`20260914_0010`, separate server credentials and exact return-address configuration.

The portal removes the proof fragment, previews the account and requires explicit
confirmation. It rejects a conflicting browser account and creates a separate
device-bound session in Redis. The user then selects from current hospital
memberships. A prior MedApp Google/Apple login can supply the source session once
provider configuration exists; HMS does not need a second provider OAuth flow.

Return to MedApp closes the browser session before navigating to the allowlisted
address. The return state and account must match the mobile marker before a refresh;
the marker contains no credentials and grants no authority. Native markers survive
app termination for up to 12 hours and are consumed once. Partner and hospital
proofs/markers are separate. The source MedApp session remains active.

## Staff onboarding and access — 2026-09-15

Apply management migration `20260915_0003_staff_invitations` after `20260914_0002`.
It adds a membership version, hashed invitations and access events. Downgrade is
refused when invitation or event history exists; use a forward migration to retain
that history. Existing tenant staff/department tables need no new migration.

All paths below are HMS upstream paths; the gateway adds `/v1/hms` instead of
`/v1`. Team administration requires a selected hospital session and a current,
active `hospital_admin` membership. A platform administrator has no implicit right.

| Endpoint | Contract |
| --- | --- |
| `POST /v1/team/invitations` | Email, explicit `hms_role`, optional employee ID/title/specialty/qualification/department ID. Returns 201 with one-time code and expiry. No arbitrary account ID, name or platform role is accepted. |
| `GET /v1/team/invitations?offset=0` | Up to 50 items and `has_more`; statuses include pending, accepted, cancelled, expired and unavailable. Codes/hashes are never listed. |
| `DELETE /v1/team/invitations/{id}` | Cancels an unused invitation, returning 204. An accepted invitation requires membership revocation instead. |
| `POST /v1/auth/staff-invitations/inspect` | Platform token plus a fresh identity-service account check; body `{ "code": "..." }`. Requires the invited, verified email and returns the hospital/role preview. |
| `POST /v1/auth/staff-invitations/accept` | Same identity and body; explicit acceptance returns hospital ID, staff ID and `already_joined`. No workspace token is returned. |
| `GET /v1/team/memberships?offset=0` | Paged active/revoked membership IDs, current versions, roles and hospital staff names. |
| `PATCH /v1/team/memberships/{id}` | Exact current `version`, `hms_role` and `is_active`. Stale versions return 409; revocation cannot remove the last administrator. Restoring access requires a fresh invitation. |
| `GET /v1/team/history?offset=0` | Paged invitation and membership events with actor, time, recipient and before/after role information. No invitation credentials. |

Codes contain 32 random bytes encoded as 43 URL-safe characters. Only their SHA-256
hashes are stored; they expire after seven days. Creation is bounded to 100 per
hospital per hour. A new invitation supersedes pending invitations to the same
normalized email. Cancellation, expiry, unavailable hospital or a change to the
creator's membership version/administrator authority prevents acceptance.

Acceptance locks the hospital registry before checking invitation and membership
state. It commits the tenant staff profile before committing management access,
the receipt and event. If the management commit fails, retry reuses the profile
without rewriting later edits. A new profile takes names from the verified account
and gets the invited department; an existing profile and department assignment are
preserved. Inactive employment records, invalid departments and conflicting
employee IDs require administrator correction. No global account role changes.

Concurrent acceptance is serialized and a successful replay returns the saved
staff ID. Old codes never regrant a revoked membership. A pending invitation that
predates a later revocation also cannot restore access. Membership changes lock
the same registry, compare the displayed version and record an event. Previously
issued hospital tokens encounter the updated membership on their next operation.

The portal's `/api/session/invitation/{inspect|accept}` boundary uses its server-held
platform credentials before hospital selection, same-origin/scope checks, bounded
bodies and filtered responses. It never automatically replays acceptance. The
administrator copies the displayed code and shares it privately; no automatic
invitation email is sent. The recipient reviews and accepts from Choose hospital,
then explicitly selects the new workspace.

`GET /v1/staff` supports `search`, department/specialty filters, `limit` (1–100,
default 50) and `offset`, returning `has_more`. Search includes employee ID. The
portal provides a saved-record detail route and sends only form fields that were
edited. Blank names and duplicate employee IDs are rejected. Staff profile edits
do not change portal membership or the person's MedApp account.

## Hospital profile and publication

Active `hospital_admin` members can manage the profile belonging to their selected
hospital. A platform administrator or department head receives no implicit access.
HMS checks live membership and tenant readiness on every request and locks the
tenant registry for writes using the same order as role changes and revocation.
Exactly one hospital approval receipt must identify the expected owner. Missing or
ambiguous receipts require reconciliation.

| Method | HMS route | Request |
| --- | --- | --- |
| GET | `/v1/hospital-profile` | No hospital/owner hints |
| PATCH | `/v1/hospital-profile` | `{ "version": 1, "changes": { "description": "Updated services" } }` |
| POST | `/v1/hospital-profile/publish` | `{ "version": 2 }` |
| POST | `/v1/hospital-profile/withdraw` | `{ "version": 3 }` |
| GET | `/v1/hospital-profile/history` | `offset`, default 0; pages of 20 |

The gateway prefixes these routes with `/v1/hms`; the portal exposes only these
finite method/path combinations through its cookie-based BFF. HMS derives the
actor and owner server-side and calls the directory receiver using a dedicated
secret. It does not forward platform/workspace tokens or follow redirects. The
upstream request has a ten-second timeout; errors are filtered and writes are
never automatically replayed.

Set `HMS_HOSPITAL_SERVICE_URL` to the directory's HTTP(S) origin and configure
`HMS_HOSPITAL_DIRECTORY_SECRET` (at least 32 characters, distinct from identity,
workspace and activation secrets). Compose forwards the latter as
`HOSPITAL_HMS_DIRECTORY_SECRET` to the directory receiver. Blank/reused keys fail
closed. Apply hospital migration `20260915_0005` before enabling the feature.

The portal's Hospital profile page saves partial draft changes, shows the saved
draft beside current public details, reports missing publication fields and
requires confirmation for publication/withdrawal. Approval fields are read-only.
Stale edits and uncertain responses preserve inputs and require an explicit reload;
reloading dirty inputs requires a discard confirmation. Withdrawing preserves
unsaved form inputs. Changing hospital unmounts the editor and cancels its requests.
The public name does not rename the HMS workspace label. Profile history records
actors, actions, revisions and changed details.

See the [directory contract](hospital_service.md) for response schemas, validation,
public visibility and migration rules. Backend coverage is in
`tests/test_hospital_directory.py`; portal behavior and boundary coverage is in
`tests/hospital-profile*.test.ts*`. Actual results are recorded in the completion
baseline separately from rendered/browser acceptance.

For backend HTTP/PostgreSQL validation on Windows, run
`backend/integration_tests/run-hospital-qa.ps1` from PowerShell with Docker Desktop
running. The launcher builds the dedicated Linux QA image, starts a disposable
PostgreSQL container and runs the five HTTP services in the same private network
namespace. It publishes no ports, mounts only the report directory and removes
both containers. The image excludes environment files, virtual environments and
databases. `-SkipBuild` reuses the already-built QA image; rebuild after backend
changes. `-ResultsDirectory` selects where the JUnit report is written. Use
`-Suite tenant` to run the eight dedicated HMS PostgreSQL tenant/database checks
instead of the integration suite.

The internal `MEDAPP_TEST_POSTGRES_URL` fixture option is only for this disposable
runner's loopback PostgreSQL server. Do not point it at a retained database server.
The launcher owns teardown. The normal host test command still creates and removes
its own PostgreSQL container when that option is absent.

## Validation

Tenant-management, provisioning, readiness, and optional PostgreSQL tests live
under `backend/services/hms_service/tests/test_tenant_*.py`. Set
`HMS_TEST_POSTGRES=1` to include disposable PostgreSQL 16 checks. They use a random
loopback port and no host volume, and remove their own test container on teardown.
The completion baseline records the actual runs and remaining acceptance gaps.
`backend/integration_tests/test_hospital_activation.py` exercises real loopback
identity, approval, directory, HMS and gateway services using migrated PostgreSQL
databases. Its seven cases cover workspace operations, concurrent receiver delivery,
approval through handoff/exchange, concurrent single-use redemption, independent
browser sign-out, staff invitation acceptance/access changes and migration
safeguards; private document storage is an in-memory test double. The Windows staff
run failed during migration setup. The later Linux run passes all seven
HTTP/PostgreSQL cases, including staff acceptance/access changes and the expanded
directory publication journey; see the completion baseline for reports and limits.

The staff milestone passes 147 backend cases and 94 distinct portal cases across
the final relevant runs, including 11 invitation/session-boundary cases, ten staff
component cases and four real Redis persistence/locking cases. Exact reports,
deduplication and startup/timing limitations are recorded in the completion baseline.
The portal production build and final staff editor TypeScript check pass.
The later profile milestone passes 280 distinct checks across the relevant suites,
including all eight dedicated PostgreSQL tenant cases and seven real-service
HTTP/PostgreSQL cases using the Linux QA runner. This closes the earlier Windows
setup-related verification gaps; exact reports are in the completion baseline.
The Redis suite uses a disposable container
with a random loopback port and no host volume. Browser/device/reference acceptance
is separate from these checks.

Implementation references: [Psycopg connection and cursor usage](https://www.psycopg.org/psycopg3/docs/basic/usage.html),
[autocommit for database creation](https://www.psycopg.org/psycopg3/docs/basic/transactions.html),
and [programmatic Alembic configuration](https://alembic.sqlalchemy.org/en/latest/api/config.html).
