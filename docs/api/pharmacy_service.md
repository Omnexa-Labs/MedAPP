# Pharmacy directory and PMS activation

The pharmacy directory runs on port 8015. Each pharmacy's operational PMS runs
as a separate deployment/database, normally on port 8030. Approval creates a
private directory identity and reserves the owner's access in the assigned PMS.
It does not change the applicant's global MedApp role or publish the pharmacy.

The service also stores patient-owned pharmacy dispensing reports. Apply migration
`20260916_0005` for the signed `/v1/pharmacy-sync/events` receiver and authenticated
`/v1/me/pharmacy-prescriptions` list/detail. See [pharmacy synchronization](../PHARMACY_SYNC.md)
for the shared snapshot contract, deployment keys, patient linkage and worker rollout.

The private `POST /internal/clinical-prescriptions` relay accepts EHR's durable
send/withdrawal commands using `X-Clinical-Handoff-Secret`. Configure
`PHARMACY_CLINICAL_HANDOFF_SECRET` with the same distinct, 32-character minimum
secret as EHR. This route is not exposed by the gateway. It selects the active
pharmacy's confirmed, configured PMS deployment, signs the upstream request and
requires a matching acknowledgement. See [clinical prescribing](../PRESCRIBING.md)
for the contract, migration dependencies and separate EHR delivery worker.

## Activation and deployment configuration

Apply directory migrations through `20260915_0004` and PMS migration
`0002_medapp_workspace` before enabling pharmacy activation. Existing approved
applications without a frozen activation command and existing standalone PMS
data require explicit reconciliation; neither is adopted automatically.

Configure these server-side values:

| Setting | Purpose |
| --- | --- |
| `PHARMACY_ONBOARDING_ACTIVATION_SECRET` | Directory receiver credential, at least 32 characters. Compose passes it to `ONBOARDING_ACTIVATION_PHARMACY_SECRET`. |
| `ONBOARDING_ACTIVATION_PHARMACY_URL` | Directory origin; defaults to `http://pharmacy_service:8015`. |
| `PHARMACY_PMS_DEPLOYMENTS` | JSON map of operator-configured PMS deployments. Defaults to `{}`. |
| `PMS_MEDAPP_DEPLOYMENT_KEY` | Exact key assigned to this PMS; never reuse it for another pharmacy. |
| `PMS_ONBOARDING_ACTIVATION_SECRET` | This deployment's activation credential. |
| `PMS_MEDAPP_WEBHOOK_SECRET` | This deployment's stock/prescription integration credential. |
| `PMS_JWT_SECRET` | Independent PMS session signing key, at least 32 characters. |
| `PMS_MEDAPP_JWT_SECRET` | Current platform verification key; distinct from PMS session and activation keys. |
| `PMS_USER_SERVICE_URL` | Trusted user-service origin used to confirm `/me`. |
| `PMS_DATABASE_URL`, `PMS_DATABASE_URL_SYNC` | Async runtime and synchronous migration URLs for the same pharmacy database. |
| `PMS_DEV_MODE` | Must be `false` for MedApp workspace activation. |

The deployment map has this shape. Replace credential placeholders with separate
values from the deployment secret store; do not put real credentials in source
control, client bundles, application forms or operator API requests.

```json
{
  "accra": {
    "label": "Accra pharmacy PMS",
    "api_url": "http://pms_service:8030",
    "web_origin": "https://pharmacy.example.com",
    "activation_secret": "<unique deployment activation credential, 32+ characters>",
    "stock_secret": "<unique deployment stock credential, 32+ characters>"
  }
}
```

Origins cannot include credentials, path prefixes, query strings or fragments.
Remote web origins require HTTPS. Keys, origins and credentials must be unique
across entries. The two deployment credentials must be distinct. The PMS receiver
also rejects an activation credential reused as a session or stock key. Keep the
directory receiver credential separate from these keys as well. A configuration
entry's key must continue to identify the same pharmacy database throughout its
lifetime; restoring/moving that database requires an explicit operator migration.

For directory migrations, run `python -m alembic upgrade head` from
`backend/services/pharmacy_service` with `PHARMACY_DATABASE_URL` set. Run the same
command from `backend/services/pms_service` with `PMS_DATABASE_URL_SYNC` set. PMS
also retains `-x db_url=...` for an explicitly selected migration database.
Downgrades refuse to discard recorded activations, assignments, SSO identities or
business fields that cannot fit the old schema.

## Operator assignment

These gateway routes require a MedApp administrator session. Responses contain
no service origins, credentials or secret references and use `Cache-Control: no-store`.

| Method and route | Behavior |
| --- | --- |
| `GET /v1/pharmacy-workspaces/deployments` | Configured keys/labels and whether each is assigned. |
| `GET /v1/pharmacy-workspaces/{pharmacy_id}/deployment` | Current assignment, version and activation timestamp. An unassigned approved pharmacy has version `0`. |
| `PUT /v1/pharmacy-workspaces/{pharmacy_id}/deployment` | Body `{"deployment_key":"accra"}` and `If-Match: <version>`. Requires an administrator other than the applicant. |

An assignment is permanent even before activation is confirmed: an uncertain
remote response may already have created its workspace. It cannot be reassigned
or shared with another pharmacy through this API. Missing `If-Match` returns 428;
a stale version returns 412; a conflicting assignment returns 409. Assignment and
activation events record the actor, key and version in the directory database.

The approval worker first checks the applicant's current account, then calls
`POST /internal/pharmacy-activations` to create the private directory identity.
It next calls `POST /internal/pharmacy-workspace-activations`. Both require the
directory activation credential in `X-Activation-Secret` and the frozen approval
snapshot. These internal routes are not gateway routes.

If assignment is missing, applicant activation status becomes `attention_required`
with reason `workspace_setup_required`. After assignment, an independent reviewer
uses the existing onboarding activation retry action with the current application
version. The worker sends the same frozen command. The directory calls the selected
PMS's internal receiver with its dedicated credential and validates the returned
application, applicant, pharmacy and deployment IDs. Only confirmed PMS access
makes the job `active`. Transient or unconfirmed responses retain retry state;
conflicts require reconciliation. Approval evidence remains intact.

The admin application detail implements this sequence. Its same-origin proxy uses
`GET /api/pharmacy-workspaces/deployments` and
`GET|PUT /api/pharmacy-workspaces/applications/{application_id}`. It checks current
administrator scope and approval, derives the pharmacy ID from activation status,
and rejects owner self-assignment. The operator reviews the label and pharmacy
before confirming. A conflict or uncertain response disables another assignment
until the saved data is reloaded. The next action opens the existing activation
retry confirmation; assignment alone does not claim successful workspace setup.

## PMS owner access

PMS bootstrap requires an empty operational database. PostgreSQL serializes first
delivery, and a singleton constraint prevents a second MedApp pharmacy workspace.
It creates the pharmacy profile, immutable receipt and reserved owner membership.
It creates no password, fabricated personal email or staff invitation. Replaying
an approval cannot overwrite later profile edits or restore changed/revoked access.

`POST /v1/auth/medapp-session` on the assigned PMS exchanges a MedApp access token
from the `Authorization` header. The PMS verifies the platform issuer/audience and
token type, confirms the active account and verified email through user-service
`/me`, and checks the live reserved owner membership. First exchange creates an
SSO-only staff record using the confirmed name and email. Existing local staff
with the same email require reconciliation; email alone never links an account.

The response is the existing PMS login shape: `access_token`, `token_type`, and
`user` containing staff ID, name, email and role. The PMS token has its own issuer,
audience, `pms_access` type, pharmacy and deployment scope. It expires within five
minutes and no later than the source MedApp token. Every PMS request reads current
staff/workspace/membership access; revocation, ownership changes and role changes
cannot retain access through stale JWT role claims. Platform account/session
validity is rechecked at each exchange; a previously issued PMS token can last
until its bounded expiry after platform-only revocation.

Standalone local password login remains available. MedApp-linked staff cannot
use it, even if a local password is later set. Old PMS tokens without the new
issuer/audience/type and pharmacy scope require a fresh login.

`GET /v1/auth/context` requires a PMS credential and returns only `user` (the
existing staff projection), `pharmacy` (`id`, `name`, `deployment_key`) and
`expires_at` (the verified credential expiry). Its response is private/no-store.
The same current-access checks as operational requests apply. An unbound local
PMS can return a null pharmacy ID and its configured name.

## Pharmacy portal sessions

The Next.js portal now implements MedApp password/MFA sign-in and explicit local
staff sign-in. See [portal setup](../../frontend/pms_web/README.md) for its five
server-only environment values and runtime requirements. Set its deployment key
to the directory assignment and its PMS origin to that deployment. Redis is
required. Production requires HTTPS; the browser receives only an opaque,
HttpOnly, Strict same-site cookie, with Secure and `__Host-` in production.

Same-origin `/api/session/login`, `/api/session/verify`, and `GET|DELETE /api/session`
keep MedApp token pairs, device identity, the PMS credential and MFA challenges on
the server. Every proxied operation confirms current platform identity and the PMS
context. The short PMS credential renews as needed; parent-token rotation uses a
Redis lease and revision check, persisting new credentials before later calls.
Logout cannot be undone by a delayed refresh. Local sessions are bounded by their
PMS credential expiry; all portal sessions have an eight-hour maximum.

Only listed operational paths under `/api/pms/*` are forwarded. Mutations require
the exact portal origin and current session scope. Browser-supplied Authorization,
activation headers and arbitrary service paths are not forwarded. Operational
mutations are never retried automatically after an uncertain response. Scope
changes clear query caches and remount forms; late responses cannot restore a
previous account's data. Pharmacy handoff and profile/publication are described below.

## Owner profile drafts and publication

The PMS **Pharmacy profile** page manages the patient directory separately from
the operational workspace. It supports saved drafts, current-public and draft
previews, explicit publication/withdrawal and paginated change history. The
portal derives the pharmacy ID from its checked session; the browser cannot
select another pharmacy or send an owner identity. Local staff sessions cannot
use this workflow.

Directory endpoints require a MedApp bearer token. They independently verify
the approved owner, active directory record and confirmed configured deployment,
then use that PMS's existing MedApp exchange/context endpoints to confirm current
verified-account and pharmacy-admin access. No new shared credential is needed.
Remote checks happen before acquiring the database write lock.

| Gateway route | Body / result |
| --- | --- |
| `GET /v1/pharmacy-workspaces/{id}/profile` | Returns pharmacy_id, version, draft, published (or null), is_listed, has_unpublished_changes, last_published_at, publication_issues and read-only licensing details. |
| `PATCH /v1/pharmacy-workspaces/{id}/profile` | `{version, changes}`; saves only editable draft fields. |
| `POST /v1/pharmacy-workspaces/{id}/profile/publish` | `{version}`; validates the saved draft and makes it patient-visible atomically. |
| `POST /v1/pharmacy-workspaces/{id}/profile/withdraw` | `{version}`; removes the public listing and keeps the draft. |
| `GET /v1/pharmacy-workspaces/{id}/profile/history?offset=0` | Twenty changes per page, plus has_more; offset is bounded to 100000. Events include actor, time, version, action and changed-field before/after values. |

The portal uses finite same-origin `/api/pms/pharmacy-profile` routes. Its
session manager forwards the server-held MedApp token to the gateway after
checking the current portal account, pharmacy and session scope. These profile
requests are separate from operational calls authenticated with PMS tokens.

Editable fields are name, description, street/city/country, paired map coordinates,
phone, email, website, insurance accepted, services offered, weekly operating
hours, photo URL and head-pharmacist name/biography. Licensing, slug, ownership,
activation and routing fields cannot be edited here. Services and pharmacist
biography are pharmacy-provided information; publication does not create a
verified practitioner profile, a bookable clinician or a service-order endpoint.

Each weekly entry uses a lowercase weekday and `HH:MM-HH:MM`, `closed`, or
`24 hours`. An earlier end time means the following day; equal times must use
`24 hours`. The editor uses weekday selectors and time inputs. Publication
requires all seven days, street/city/country, and phone or email. Hours are local
weekly schedule information, not a calculated "open now" claim. Services are
limited to 30 distinct names; insurance entries to 50. Websites reject embedded
credentials. Existing hosted photo URLs require HTTPS without credentials.
The portal now chooses and uploads photos directly using the managed workflow below.

Writes compare the saved version and increment it with an event in the same
transaction. A stale/concurrent write returns 409 without overwriting newer
changes. Draft saves do not change public fields or their update timestamp.
Failed or uncertain portal mutations require an explicit reload instead of an
automatic retry. No-op requests do not manufacture extra history events.
Responses use private, no-store caching.

Migration `20260915_0003` adds draft/version/publication metadata, services and
head-pharmacist fields, and unique pharmacy/version event history. Existing
directory rows remain unchanged. Downgrade refuses to discard recorded drafts,
publications, history or new profile data; use a forward migration once in use.
The patient pharmacy screen now shows published services and head-pharmacist
details, and marks overnight hours as ending the next day.

## Managed pharmacy photos

Apply pharmacy migration `20260915_0004` and install the updated pharmacy
dependencies before using uploads. Set `PHARMACY_PUBLIC_API_ORIGIN` to the public
gateway origin reachable by patient devices (for example `https://api.example.com`).
The local default is `http://localhost:8000`; HTTP is accepted only on loopback.
The value is server configuration, never a forwarded request host. No additional
storage credential or public bucket is required.

| Route | Contract |
| --- | --- |
| `POST /v1/pharmacy-workspaces/{pharmacy_id}/profile/photo` | Current approved owner and live PMS access. Raw JPEG/PNG/WebP body, matching Content-Type and bare positive decimal `If-Match` profile version. Saves a photo to the draft and returns DirectoryView. |
| `GET /v1/pharmacy-workspaces/{pharmacy_id}/profile/photos/{photo_id}` | Same owner/access checks; returns a retained draft or published photo as JPEG. |
| `GET /v1/pharmacies/{pharmacy_id}/photos/{photo_id}` | Anonymous GET through the gateway. Returns JPEG only while this exact photo is the active, listed pharmacy's published image; otherwise 404. Adjacent routes and other methods remain authenticated. |

Uploads are limited to 8 MiB and 20 million decoded pixels. The service checks
actual content and rejects corrupt, mismatched, animated and unsupported images.
It applies EXIF orientation, resizes to fit 1600 by 1600 pixels, flattens transparency
onto white and re-encodes a JPEG no larger than 1 MiB, without source metadata.
The decoder runs outside the event loop with two worker slots. Pillow is locked
with the service dependencies; see its [image API documentation](https://pillow.readthedocs.io/en/stable/reference/Image.html).

Normalized bytes live in `pharmacy_photos` in the pharmacy PostgreSQL database.
The new asset, versioned draft, history event and removal of unreferenced assets
share one transaction. Concurrent uploads cannot overwrite a newer version or
leave an extra committed asset. Only the current published and saved-draft photo
are retained, at most two photos per managed profile (2 MiB of image payload).
Include this table in the normal database backup/restore process. This deliberately
bounded profile-photo store is not a general media library; higher-volume media
should use a separate storage contract.

Private snapshots retain a service-generated relative `photo_url`; clients cannot
attach such a reference through PATCH. Public pharmacy responses expand it using
`PHARMACY_PUBLIC_API_ORIGIN`, preserving the existing patient `photo_url` contract.
The portal loads preview bytes through its scoped session proxy and releases
temporary browser object URLs on replacement/unmount. Original files, names and
metadata are not persisted. Photo content and missing-photo responses use
`private, no-store`; image responses also use `nosniff`.

Uploading does not publish. Save other text edits first, upload the selected image,
review the saved preview, then confirm publication. Removing a draft photo saves
`photo_url: null`; the previous published photo remains available until publication
of the removal or withdrawal. Withdrawal makes new public photo requests return
404 while retaining the draft for later republication. Replaced unreferenced bytes
are deleted; history retains only revision metadata, not old photo content.
Stale or uncertain outcomes require explicit reload, with no automatic write replay.

## MedApp workspace selection and portal handoff

Apply user-service migration `20260915_0011` before enabling this flow.
`GET /v1/pharmacy-workspaces` returns the signed-in owner's active, approved
pharmacies with confirmed deployment activation, including private/unlisted
pharmacies. Each row contains only `pharmacy_id`, `pharmacy_name`,
`deployment_key` and the configured public `web_origin`. The matching
`GET /v1/pharmacy-workspaces/{pharmacy_id}/access` returns one row or 404.
Both use `private, no-store`. These routes do not grant PMS staff access;
the portal's session exchange checks current access when opening.

Configure `USER_PHARMACY_SERVICE_URL` to the trusted directory origin and
`USER_PMS_HANDOFF_DEPLOYMENTS` on user_service:

```json
{
  "accra": {
    "web_origin": "https://pharmacy.example.com",
    "handoff_secret": "<unique pharmacy handoff credential, 32+ characters>"
  }
}
```

The key and canonical web origin must exactly match the directory's
`PHARMACY_PMS_DEPLOYMENTS` entry. Origins and handoff credentials are unique
across entries; use credentials separate from signing, onboarding, hospital,
activation and stock credentials. On that portal set
`PMS_WEB_DEPLOYMENT_KEY=accra`, its matching `PMS_WEB_HANDOFF_SECRET` and
`PMS_WEB_ORIGIN`. Do not put these credentials in Expo/public variables.

Set `USER_PMS_RETURN_URIS` and `PMS_WEB_RETURN_URIS` to matching exact
comma-separated return routes. Both default to `medapp://pharmacy-workspaces`.
For web MedApp add its actual HTTPS `/pharmacy-workspaces` URL to both.
Local development HTTP is restricted to loopback/emulator hosts; paths with
queries/fragments, extra parameters and arbitrary redirects are not accepted.

| Gateway route | Contract |
| --- | --- |
| `POST /v1/auth/pharmacy-handoffs` | Active, email-verified MedApp session and its current device ID; body has pharmacy_id, return_uri and a random 32–64 character return_state. Resolves ownership and deployment server-side. Returns handoff_id, URL with a fragment proof and expires_in. |
| `DELETE /v1/auth/pharmacy-handoffs/{id}` | Owning MedApp account cancels an unused pharmacy proof. |
| `POST /v1/auth/pharmacy-handoffs/inspect` | PMS server only: X-Pms-Deployment-Key and X-Pms-Handoff-Secret plus a code body. Checks current source identity/session and proof destination. |
| `POST /v1/auth/pharmacy-handoffs/redeem` | Same server credentials plus a fresh 64-hex X-Device-Id. Atomically consumes the proof and issues a separate MedApp browser session; returns its pharmacy/deployment target and allowlisted return URL. Replay/expired/cancelled links cannot create a session. |

The portal strips the fragment, previews the account and requires account
confirmation. A different signed-in account/pharmacy is a conflict before proof
redemption. An existing matching account requires the current browser scope.
The new session's platform account and verified PMS pharmacy must match the
proof. Credentials and the return URL stay in Redis; the browser receives only
public identity, a return-available flag and an opaque HttpOnly cookie.

Return to MedApp requires the current browser scope, closes that browser session,
then exposes the saved return URL. The source mobile session is independent.
Mobile stores a separate pharmacy return marker, checks the owner/state on warm
or cold return and reloads server access. Hospital and onboarding markers remain
separate. Return markers are navigation state, never authorization.

## Patient directory and stock

`GET /v1/pharmacies`, `GET /v1/pharmacies/{id}` and its `/stock` route expose only
active, listed pharmacies. The old `only_listable=false` parameter cannot reveal
private records. Direct service reads are anonymous; gateway reads require a
MedApp session. Public output excludes the owner's user ID, PMS URL and secret
reference. Legacy POST/PATCH inputs reject integration-routing fields.

Legacy profile CRUD remains restricted to the owning `pharmacy` role or an
administrator. Profiles created by approval cannot be changed, published or deleted
through that legacy route. Their workspace profile/publication workflow above
owns those changes; approval and assignment leave them private.

Stock uses only confirmed assignments and that deployment's configured origin
and stock credential. Legacy `pms_base_url`/`pms_partner_secret_id` columns remain
for reconciliation but no longer select outbound requests. The directory signs
the canonical `METHOD\npath?query\nbody` HMAC; PMS verifies it and returns its pharmacy ID. The
directory verifies that ID and exact drug name; unrelated search results cannot
be substituted. Network/JSON/identity errors and ambiguous matches return
`source: "unknown"`. Valid zero prices are preserved. A missing confirmed
deployment returns 404. PMS stock authentication fails closed without a credential
of at least 32 characters.

## Validation

Unit suites cover directory privacy, immutable assignment, receiver receipts,
retry handling, real identity response validation, passwordless owner linking,
session scope, revocation and stock response handling. The PostgreSQL/HTTP suite
also exercises concurrent first assignment/bootstrap and real service exchange.

From the repository root:

```powershell
backend/integration_tests/run-hospital-qa.ps1 -Suite pharmacy
```

The runner builds the backend QA image and uses a disposable PostgreSQL container,
synthetic accounts/documents and loopback services. It publishes no ports and
mounts only its result directory. See [completion baseline](../COMPLETION_BASELINE.md)
for actual run results and remaining acceptance work.
