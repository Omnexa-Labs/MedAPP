# features/welcome/

First-launch experience: splash screen, intro/value-prop, permissions priming, "Get Started" CTA.

This is NOT MedApp "onboarding" — that term is reserved for partner intake, which lives on the web. See `features/partner/`.

Owns:
- The first-launch splash with brand + "Get Started".
- Whatever short intro/permissions priming we decide to add later.
- The `hasSeenWelcome` flag (via `store/welcome-store.ts`) that tells `app/_layout.tsx` whether to show this tree.
