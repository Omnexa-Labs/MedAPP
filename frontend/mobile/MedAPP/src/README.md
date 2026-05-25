# MedApp Mobile — `src/` Structure

This is the structure map. When deciding where a file goes, find the matching question below and follow the rule.

## Tree

```
src/
  app/             # Expo Router routes — files are screens, _layout.tsx defines stacks/tabs
  features/        # Vertical slices: UI + hooks + api + store + types per product area
  components/      # Cross-feature reusable UI (ui/, layout/, feedback/, gating/)
  hooks/           # Cross-cutting hooks (use-theme, use-color-scheme, use-current-user, use-role)
  lib/             # Framework-agnostic helpers (api/, storage/, validation/, format/, partner/)
  store/           # Global zustand stores only (auth, welcome, app)
  constants/       # theme.ts, config.ts, capabilities.ts — values that don't change at runtime
  types/           # Global TS types (User, Role, PartnerStatus, ApiError, Paginated<T>)
```

Note: `global.css` lives at the project root (not inside `src/`) so NativeWind's Metro plugin can pick it up. It's imported once from `src/app/_layout.tsx`.


## Where does this file go? — decision rules

### "Is this a screen the user can navigate to?"
→ **Yes:** `src/app/` (Expo Router, file-based). Keep it thin — parse params, call feature hooks, compose components.
→ **No:** Never put non-route files in `src/app/`. Helpers and sub-components live in `features/` or `components/`.

### "Is this UI used by 2+ features?"
→ **Yes:** `components/` (in `ui/`, `layout/`, `feedback/`, or `gating/`).
→ **No, one feature only:** `features/<name>/components/`. Promote when a second consumer appears.

### "Is this hook used across features?"
→ **Yes:** `hooks/` (e.g. `use-theme`, `use-current-user`, `use-role`).
→ **No, feature-specific:** `features/<name>/hooks/` (e.g. `useChatMessages`, `useSignIn`).

### "Does this code use React (`useState`, JSX, etc.)?"
→ **No:** `lib/` (api client, storage wrapper, formatters, zod schemas).
→ **Yes:** `hooks/`, `components/`, or `features/` depending on reuse.

### "Is this state read/written by 2+ features?"
→ **Yes:** `store/` (global zustand).
→ **No:** `features/<name>/store.ts` (feature-local zustand) or local component state.

### "Is this state client-only (UI flag, auth token) or server data?"
→ **Client-only:** zustand store.
→ **Server data:** React Query — **not** a store. Cache, refetch, and invalidation are React Query's job.

### "Is this a domain type used by 2+ features?"
→ **Yes:** `types/` (`User`, `ApiError`, `Paginated<T>`).
→ **No:** `features/<name>/types.ts`.

### "Does this value ever change at runtime?"
→ **No:** `constants/` (theme tokens, route names, role capability map, animation durations).
→ **Yes:** it's state, not a constant — pick a store or React Query.

## Hard rules (the ones the structure breaks without)

1. **`app/` contains only routes.** Anything else there confuses Expo Router. Helpers live elsewhere.
2. **Features do not import from other features.** If feature A needs something from feature B, promote it to `components/`, `hooks/`, or `lib/`. This is what makes the structure modular.
3. **Network plumbing lives in `lib/api/`.** Features call `client.get/post(...)` — not raw `fetch` / `axios`. Auth interceptor, error mapping, and logging stay consistent because of this.
4. **Storage libs are imported only by `lib/storage/` and stores.** Features never import `expo-secure-store` or `@react-native-async-storage/async-storage` directly.
5. **Roles and partner status flow through `hooks/use-role.ts` + `components/gating/`.** No `if (user.role === "practitioner")` scattered through screens.
6. **The partner onboarding flow is web, not mobile.** `features/partner/` only contains the launcher / status display. The actual KYC + verification flow opens via `lib/partner/open-onboarding.ts`.

## Naming conventions

- Folders: kebab-case (`features/welcome/`, `components/gating/`).
- Files: kebab-case for non-component files (`use-role.ts`, `auth-store.ts`); PascalCase for component files (`Button.tsx`, `RoleGate.tsx`).
- Hooks: `use-<thing>.ts`, exported as `useThing`.
- Zustand stores: `<name>-store.ts`, exported as `use<Name>Store`.
- Route files: kebab-case to match Expo Router's URL conventions (`sign-in.tsx`, not `SignIn.tsx`).

## Per-area details

Each subtree has its own `README.md` with the local rules:

- [`app/`](./app/) — routing (existing, no README yet)
- [`features/`](./features/README.md)
- [`components/`](./components/README.md)
- [`hooks/`](./hooks/) — cross-cutting hooks (existing)
- [`lib/`](./lib/README.md)
- [`store/`](./store/README.md)
- [`constants/`](./constants/) — theme / config / capabilities (existing)
- [`types/`](./types/README.md)
