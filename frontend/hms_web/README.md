# MedApp hospital portal

The portal signs staff in with their MedApp account, supports authenticator and
recovery-code verification, and lets them choose an active hospital membership.
It uses the same Next.js and React versions as the partner and administrator portals.

## Configuration

Copy `.env.example` to a local environment file and configure:

| Variable            | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `HMS_WEB_ORIGIN`    | Exact public portal origin. Production requires HTTPS.          |
| `HMS_WEB_API_URL`   | MedApp gateway origin, without a path.                          |
| `HMS_WEB_REDIS_URL` | Private Redis connection for sessions and pending MFA attempts. |
| `HMS_WEB_HANDOFF_SECRET` | Dedicated server credential matching `USER_HMS_HANDOFF_SECRET`; at least 32 characters, different from the partner portal's credential. |
| `HMS_WEB_RETURN_URIS` | Comma-separated exact return addresses, matching `USER_HMS_RETURN_URIS`. Native default: `medapp://hospital-workspaces`. |

The gateway, identity service and HMS must be reachable, with production HMS
workspace exchange enabled. Apply their migrations and configure the separate
backend HMS signing key as described in [the HMS contract](../../docs/api/hms_service.md).
Missing configuration fails closed. The portal does not use HMS development login.

To open this portal from MedApp, also set the identity service's `USER_HMS_WEB_ORIGIN`
and the mobile app's public `HMS_WEB_URL` to this portal origin. Apply user-service
migration `20260914_0010`. Mobile web deployments must explicitly allow their exact
`/hospital-workspaces` return URL on both servers. Return addresses have no query or
fragment in configuration; the handoff adds a random state. No server credential
belongs in the mobile configuration.

Install the locked dependencies with `npm ci`. The development script listens on
`http://127.0.0.1:3001`; `npm run build` creates the production build. Production
cookies require HTTPS. Keep environment files and Redis access private. No access
tokens, refresh tokens or signing keys belong in `NEXT_PUBLIC_*` variables.

## Session and workspace behavior

- MedApp's Hospital workspaces screen loads live memberships and opens `/handoff`
  with a two-minute, single-use proof in the URL fragment. The browser removes the
  fragment, shows the account and requires confirmation. Another signed-in account
  cannot be silently replaced. The portal exchanges the proof on the server for
  its own device-bound session, then requires explicit hospital selection.
- A handoff uses the existing authenticated MedApp session, including one created
  by configured Google/Apple sign-in. It does not ask the hospital portal to perform
  a second provider login. Provider credentials and native acceptance remain pending.
- Return to MedApp signs out the hospital browser session before following the
  allowed return address. A fallback link survives the session-state reset. The
  original MedApp session remains signed in; the return callback only reloads
  memberships and grants no access. Direct password sessions have no return link.
- `/login` accepts MedApp email/password and, when enabled for that account,
  authenticator or recovery-code verification. Pending MFA challenges remain on
  the server, bound to an opaque cookie, browser scope and generated device ID.
- `/workspaces` lists active staff memberships and requires explicit selection.
  Having a platform administrator role alone does not grant clinical access.
  A signed-in user without a membership gets an explanation and a refresh action.
- A production `__Host-medapp_hms` cookie is HttpOnly, Secure and SameSite Strict.
  It contains a random session ID. MedApp and HMS tokens remain in Redis. Browser
  sessions expire after eight hours; hospital tokens last at most five minutes.
- Sign-out invalidates the server record and revokes its parent refresh token.
  The unusable cookie handle expires naturally or is replaced at the next sign-in.
  Delayed sign-out, expiry and error responses do not delete cookies, so they cannot
  erase a newer sign-in from another tab. A failed network request is shown as a
  sign-out failure rather than reported as success.
- Parent-token rotation is serialized. Redis commits require the current revision
  and lock owner, so a delayed renewal cannot restore a signed-out session or
  overwrite a changed workspace. An uncertain rotation requires sign-in again.
- Selecting a hospital changes the browser scope. Clinical requests carry that
  scope; both server and browser reject late results from an earlier scope.
  Query caches and mounted forms are replaced when the scope changes.
- Account and membership details refresh on focus, visible-page polling and
  cross-tab session notifications. Revoked access returns the user to selection or
  sign-in. Backend membership checks remain authoritative for every operation.
- The browser API client sends requests only to the portal's own BFF. Its finite
  route/method allowlist exposes clinical HMS endpoints, excluding authentication,
  tenant administration and internal activation. Browser credentials, hospital
  hints and internal headers are not forwarded.
- Same-origin and scope checks protect mutations. Requests have bounded bodies,
  private responses use no-store, and clinical writes are not automatically replayed.
- Old `hms_token`, `hms_user` and tenant configuration local-storage entries are
  removed. The portal neither trusts nor creates them.

## Staff onboarding and access

Apply HMS management migration `20260915_0003` before using staff invitations.
An active hospital administrator opens Staff → Invite staff, chooses a hospital
role and enters the recipient's MedApp email. Optional employment details and an
active department seed a new staff record. The portal displays a seven-day code
once; the administrator shares it privately. This flow does not send email.

The recipient signs in with that verified email, opens Choose hospital → Join a
hospital, reviews the invitation and explicitly accepts it. The hospital then
appears in the workspace list for selection. Acceptance preserves the account's
platform role and any existing staff profile. Submitted application team details
alone do not grant access.

Staff → Access and invitations lists active/revoked roles, invitation status and
access history. Role changes use the displayed membership version; stale changes
require refresh. Revocation preserves employment details, prevents later hospital
requests and requires a new invitation to restore access. The last administrator
cannot be removed. Invitations become unavailable if their creator's authority
changes; replacing or cancelling an invitation invalidates its previous code.

Staff records support paging, name/employee-ID search and detail editing. Saving
sends only fields changed in the form, preserving unrelated concurrent edits.
Department heads can view and edit staff records but cannot administer invitations
or hospital roles. These controls do not complete the remaining operational screens.

## Hospital profile and publication

Hospital administrators can open Hospital profile after selecting an approved
workspace. Apply hospital migration `20260915_0005` and configure the dedicated
HMS-to-directory service secret described in the
[HMS API contract](../../docs/api/hms_service.md#hospital-profile-and-publication).
No directory secret belongs in this frontend's environment or browser bundle.

Save draft preserves the current public listing. The saved preview and publication
checklist update after saving; Review and publish requires a separate confirmation.
Withdraw listing removes the public listing and keeps the saved draft. Profile
history shows who changed each revision and its before/after details. Approval and
accreditation fields are read-only; the public name does not rename the workspace.

Conflicts and interrupted writes require reloading the saved profile before another
write. Unsaved inputs remain until explicit discard/reload; withdrawing also keeps
them. Switching hospital cancels in-flight editor requests and clears mounted
forms. Legacy workspaces without consistent approval records need reconciliation.

## Validation

`npm test` exercises the session engine, HTTP boundary, MFA, browser state,
workspace controls, staff invitations/access, hospital profile publication and query isolation. `npm run typecheck` and
`npm run build` check the complete portal. Set `HMS_WEB_TEST_REDIS=1` when running
tests to include real Redis lock/revision/expiry checks in a disposable Docker
container using a random loopback port and no host volume.

Actual results and environment limitations are recorded in
[the completion baseline](../../docs/COMPLETION_BASELINE.md). Unit and build
checks alone do not accept the rendered specialist references.

## Remaining work

- Verify the rendered login, verification, selection, renewal and sign-out journey
  through a deployed gateway and real identity/HMS/Redis services.
- Verify handoff and return on native devices and deployed mobile web, including
  accounts created through configured Google/Apple sign-in.
- Verify the staff invitation, acceptance, role change and revocation journey
  through a deployed portal with real services.
- Verify profile editing/publication through the deployed portal and finish hospital configuration and the
  remaining operational screens. Existing queue, invoice-item/payment, drug/batch,
  schedule and tenant repository methods include mismatches with backend contracts;
  the BFF does not turn those unsupported methods into working features.
- Reconcile role-specific navigation, reference fidelity, accessibility and narrow
  layouts before accepting any additional specialist screens.
