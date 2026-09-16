# Portal handoffs

`browser-handoff.ts` owns the shared browser, cancellation and return-marker logic.
`open-onboarding.ts` and `open-hospital.ts` configure separate endpoints, origins,
return routes and storage keys. An onboarding proof or return cannot open a hospital
session, and a hospital handoff cannot select an application or grant a staff role.

`open-onboarding.ts` prepares an authenticated, single-use link through user_service.
Only the configured `config.partnerOnboardingUrl` origin and `/handoff` path may open.
The proof travels in a URL fragment, expires after two minutes, and is exchanged by
the partner web server for its own session. Mobile access/refresh tokens stay in MedApp.

Native uses Expo SDK 55 `openAuthSessionAsync` with `medapp://onboarding-status` and a
random return state. Browser dismissal, account changes and unmounts invalidate unused
proofs when the source session is still available. Web uses same-tab navigation and
sessionStorage for the non-secret return state/account ID; its exact return URI must
be allowed by both servers. Invalid return data grants no access or role.

Native also saves a non-secret account/state marker in AsyncStorage for up to 12 hours.
It survives screen unmount or app termination so a matching cold return can request
fresh server state. A wrong account, nonce or expired marker is rejected; successful
consumption is single-use. The marker contains no tokens and grants no permissions.

The status screen reloads saved applications and `/me` on return. A validated warm
or cold return forces shared token renewal even when startup hydration already loaded
the new role, so JWT permissions also refresh. Foreground role changes use the same
renewal process. Manual status refresh recovers from an unmatched return and clears
the return parameter after successful account renewal. Professional
activation runs separately from the recorded approval: configured onboarding workers
now provision doctor/nurse profiles and account roles with retry-safe receipts.
Hospital approval now provisions a private hospital profile and initial owner
membership. The pharmacy workspace adapter remains pending.

`open-hospital.ts` opens the configured `config.hospitalPortalUrl` using
`/v1/auth/hospital-handoffs` and returns to `medapp://hospital-workspaces`. The
hospital screen reloads current memberships after a valid return. The portal
confirms the account, creates its own device-bound session, and asks the user to
select a workspace. Returning closes that browser session, preserving the source
MedApp session. Mobile web needs its exact return URL allowed by both servers.
`HMS_WEB_URL` is public configuration; the handoff secret stays on the servers.
Native browser/deep-link and deployed mobile-web acceptance still require QA.
