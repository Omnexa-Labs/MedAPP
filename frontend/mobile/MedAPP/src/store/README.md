# store/

**Global** Zustand stores only — state read or written by 2+ features.

Planned stores:
- `auth-store.ts` — token, current user, isAuthenticated, hydrate, signOut.
- `welcome-store.ts` — `hasSeenWelcome` flag, persisted via `lib/storage/`. Drives whether the first-launch tree shows.
- `app-store.ts` — theme override, locale, feature flags fetched at startup.

Decision rule: if exactly one feature reads/writes a piece of state, it belongs in `features/<name>/store.ts`, not here. Don't pre-globalize.

Stores hold **client state only** — auth token, UI flags, prefs. Server data (chat messages, channel lists, profile data) belongs in React Query, not in a store.
