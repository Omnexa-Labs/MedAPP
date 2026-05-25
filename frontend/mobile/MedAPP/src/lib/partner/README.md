# lib/partner/

The mobile side of the partner-onboarding handoff.

- `open-onboarding.ts` — launches the partner onboarding website (via `expo-web-browser`) with the right return URL, signed user context, and deep-link callback. The URL comes from `constants/config.ts` so it varies per environment.
- Eventually: deep-link parsers for the `medapp://partner/...` callbacks and a small helper to refresh the user's role from the backend once the web flow completes.

This module exists so that the rest of the app does NOT need to know how partner onboarding is hosted. If onboarding ever moves back in-app, only this folder changes.
