# features/partner/

The thin mobile-side surface of the partner experience. **The partner onboarding flow itself lives on the web** — this folder does NOT contain KYC, license upload, or verification screens.

Owns:
- "Become a Partner" CTA + value-prop screen.
- Partner-status display (pending / approved / rejected) once the user has applied.
- The deep-link handler that catches the return from the web onboarding site (`medapp://partner/...`) and refreshes the user's role from the backend.

The actual launcher is `lib/partner/open-onboarding.ts`.
