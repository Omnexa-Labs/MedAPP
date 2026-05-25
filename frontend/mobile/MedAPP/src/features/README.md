# features/

Vertical slices. Each folder owns the UI, hooks, API calls, store slice, and types for one product area.

**Rule:** A feature may import from `components/`, `hooks/`, `lib/`, `store/`, `constants/`, `types/`. A feature may NOT import from another feature. If two features need the same thing, promote it upward.

Inside a feature, the conventional layout is:

```
features/<name>/
  components/      # UI used only by this feature
  hooks/           # hooks used only by this feature
  api.ts           # network calls — the only place fetch/axios runs for this feature
  store.ts         # local zustand slice (optional — most features won't need one)
  types.ts         # feature-local types
  schema.ts        # zod schemas for forms / API payloads (optional)
```

Screens live in `src/app/` (Expo Router) and import from here.
