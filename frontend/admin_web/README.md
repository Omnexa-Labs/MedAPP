# MedApp Admin Console (Next.js)

Internal MedApp reviewer console. Google Workspace sign-in, enrolled MFA, the
professional application queue, managed credential previews, versioned review
decisions, application history and activation status/retry are implemented.

The current release work covers professional application review. The broader
dispute, moderation and analytics modules still require implementation and acceptance.

```bash
npm ci
npm run dev
```

The development address is `http://127.0.0.1:3004`. Copy `.env.example` to the
deployment's ignored local environment file and set the gateway, exact browser
origin and Redis URL. Production requires HTTPS. Set the two admin Google settings
on the **user service**, as described in
[the provider setup guide](../../docs/PROVIDER_SIGN_IN_SETUP.md#internal-reviewer-console).
Register the exact admin origin with the dedicated Google web client. Do not reuse
the partner website cookie or expose backend token pairs with `NEXT_PUBLIC_` values.

Authentication behavior:

- Only the Workspace SSO exchange can establish a browser session. Backend
  challenges and token pairs stay in Redis; the browser gets an HTTP-only, strict
  same-site opaque cookie. The production cookie uses `__Host-` and Secure.
- The server retains the same random device ID through Google, MFA, refresh and
  logout. Local admin sessions expire after eight hours. Refresh is serialized;
  an uncertain rotation requires sign-in again.
- Every review proxy request checks the current user role, configured Workspace
  domain and live Google connection. Role removal, email changes and provider
  disconnection end administrator access. An API timeout blocks the request.
- Queries and writes carry an account scope. Authentication changes cancel the
  previous account's queries, review actions and document previews. Sign-in
  callbacks have a separate scope and a serialized server-held attempt.
- Logout deletes the server session before revoking its refresh token. An expired
  opaque cookie can remain until the next login or browser expiry; late error and
  logout responses deliberately do not overwrite a newer login's cookie.

Review behavior:

- The queue reads saved applications and filters by status, partner type and search.
- Approval requires the current applicant attestation, required fields/team data,
  and explicit verification of required managed credentials after opening them.
  The final confirmation preserves the selected version, document IDs and feedback.
- All review and activation-retry writes carry `If-Match`. A conflict or uncertain
  response requires reloading saved data before another action. The server also
  forbids self-review and self-activation.
- Activation retry is available for delayed/attention states. An approved pharmacy
  with a saved directory identity shows its configured PMS deployment choices.
  An independent administrator reviews and confirms the permanent assignment,
  then continues account setup using the existing versioned activation retry.
  Conflicts or uncertain saves require reloading the saved assignment first.
  The server derives the pharmacy ID from the live application and activation
  status. Browser requests cannot supply service origins or activation secrets.
  Legacy approvals without a saved activation identity require reconciliation.

`npm test`, `npm run typecheck` and `npm run build` provide the software checks.
Unit tests substitute Google/network/storage boundaries; they do not certify real
Workspace consent, deployed Redis/gateway behavior, document viewer fidelity, or
browser/device acceptance. The current completion record and preview restrictions
are in [COMPLETION_BASELINE.md](../../docs/COMPLETION_BASELINE.md).

The visual implementation follows the current task's queue and review concepts:
mint background, teal actions, Inter/Manrope, a table queue and a two-column desktop
review. Additional saved fields, the approval-requirements hint, confirmation
dialog, history, unavailable states and dark/mobile styles support the actual
service contract. Rendered comparison remains a separate acceptance gate.
