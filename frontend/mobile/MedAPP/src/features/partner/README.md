# Partner application status

`OnboardingStatusScreen` is reached from Patient Profile → Professional
applications and access. It loads the current account's saved applications with
loading, empty, review, rejection, approval and error/retry states. Account changes
cancel/re-scope queries; role and profile activation remain independent of
application approval.

The website owns credential submission. Start/continue/correct actions now use
`lib/partner/open-onboarding.ts` to open a short-lived authenticated handoff. Return
and foreground events reload persisted status and the current identity; callbacks
never grant professional roles. The website closes its session before returning.
An account-bound, expiring native return marker survives app termination. A matching
return forces JWT renewal even if startup hydration already read the current role.
Unmatched returns show a recoverable error; manual refresh reloads server state and
renews permissions. Focus work cannot publish results after an account change.
Doctor/nurse activation now runs through the backend's durable approval queue. The
mobile workspace still checks the account role and self profile independently.
The partner website now shows activation progress, and the administrator website
supports review and retry. Pharmacy activation and final native/reference acceptance
remain in B03.

`HospitalWorkspacesScreen` is available from application status and Settings →
Hospital workspaces. It reads the current account's live HMS memberships, with
loading, empty, failure/retry and manual refresh states. An active membership enables
the hospital-portal handoff; workspace selection happens in that portal. Account
changes cancel old queries and browser work. A validated warm/cold return refreshes
memberships; callbacks do not grant access or change the platform account role.
Staff onboarding and hospital profile publication remain separate work.
