# features/profile/

Own-profile view and edit: name, avatar, health basics, notification prefs, sign-out.

Hosts the "Become a Partner" CTA — the entry point that calls `lib/partner/open-onboarding.ts` to launch the web onboarding flow. The CTA itself is a small component here; the launcher logic is in `lib/`.
