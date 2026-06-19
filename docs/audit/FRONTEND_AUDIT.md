# Frontend Audit

> Scope: `frontend/mobile` (React Native + Expo),
> `frontend/admin_web`, `frontend/pms_web`, `frontend/hms_web` (all
> Next.js 14).

## 1. Stack confirmation

The commit `15d5501` ("…refactor mobile app to React Native") completed
cleanly: there are no remaining legacy mobile assets in `frontend/mobile`.
The mobile app is React Native 0.74 with Expo ~51 and TypeScript. The
three web apps are all Next.js 14 with React 18, TanStack Query,
Tailwind, Zustand, and React Hook Form + Zod.

## 2. Strengths

- **Mobile uses `expo-secure-store`** for token persistence
  (`frontend/mobile/src/core/storage/secureStorage.ts:1-25`) — the
  correct primitive on iOS/Android.
- **Axios is wrapped with an interceptor** that injects the bearer
  token consistently (mobile + both web apps).
- **Zustand hydration on app launch** prevents flashing an
  authenticated UI without a token
  (`frontend/mobile/src/core/auth/authStore.ts:21-34`).
- **Forms use Zod schemas** — the validation contract is shared
  between input parsing and TypeScript types.
- **Component organisation** in `hms_web` and `pms_web` follows a
  reasonable layered structure: `lib/api`, `lib/stores`,
  `lib/repositories`, `components/ui`, `components/shared`.

## 3. Critical and high-severity findings

| ID | Severity | Finding | Location |
|---|---|---|---|
| F-1 | Critical | Web auth tokens in `localStorage` (XSS = takeover) | `frontend/hms_web/src/lib/stores/auth.store.ts:32`, `frontend/pms_web/src/lib/api/client.ts:11` (C-7) |
| F-2 | High | No `middleware.ts` route protection in any web app; auth is enforced client-side only | All three Next.js apps |
| F-3 | High | `admin_web` is a placeholder (`src/app/page.tsx` is a one-line scaffold) but ships in the monorepo as if deployable | `frontend/admin_web/src/app/` |
| F-4 | High | No CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS in any `next.config.mjs` | `frontend/*/next.config.mjs` |
| F-5 | High | Client-side role checks (`permissions.ts:19-23`) treated as enforcement — must be advisory | `frontend/hms_web/src/lib/utils/permissions.ts` |
| F-6 | Medium | No refresh-token flow on web; expiry silently logs the user out mid-task | `pms_web` / `hms_web` axios interceptors |
| F-7 | Medium | Interceptor handles only 401 — no 403, 5xx, timeout, or offline strategy | All apps |
| F-8 | Medium | API base URL fallback to `localhost`/`10.0.2.2` baked in for mobile if env unset | `frontend/mobile/src/core/env.ts:16` |
| F-9 | Medium | Dependency drift across the monorepo (see §5) | `package.json` files |
| F-10 | Low | No unit tests anywhere in `frontend/` | All apps |
| F-11 | Low | No shared design system / component library — `ui/` is duplicated across `hms_web` and `pms_web` | `frontend/{hms_web,pms_web}/src/components/ui/` |

## 4. PHI presentation

The PMS and HMS apps render patient names, prescriptions, dispense
records, and appointment data through standard table/form components.
The audit did not find:

- **A confirmation gate** before showing PHI for the first time in a
  session (HIPAA "minimum necessary" expectation).
- **Field-level redaction** in non-clinical screens (lists, dashboards
  often surface full names where initials would do).
- **Audit calls** from the frontend that flag a view of a record (the
  backend logs access, but only when the API is hit; client-side
  caching can re-display PHI without a new request).

These are not "fix today" items, but they belong on the compliance
backlog.

## 5. Dependency drift

| Dependency | Mobile | hms_web | pms_web | admin_web |
|---|---|---|---|---|
| React | 18.2.0 | ^18.3.1 | ^18 | ^18.3.1 |
| Next.js | — | 14.2.35 | 14.2.35 | ^14.2.5 |
| TypeScript | ~5.3.3 | ^5.5.0 | ^5 | ^5.5.0 |
| axios | ^1.7.7 | 1.16.1 | 1.16.1 | — |
| @tanstack/react-query | ^5.59.0 | ^5.100.11 | ^5.100.11 | — |

No known CVE was identified in the pinned versions, but the drift
signals weak monorepo governance. A single shared `package.json`
"engines" + dependency hoisting strategy would resolve it.

## 6. Recommendations

1. **Move web auth to httpOnly cookies set by a Next.js route handler**
   that proxies the gateway login. Delete the localStorage path.
2. **Add `middleware.ts` in each web app** to redirect unauthenticated
   requests to `/login` and to forbid role mismatches before the
   page renders.
3. **Ship CSP** (start in `Report-Only`), `X-Frame-Options: DENY`,
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-
   when-cross-origin`, and `Strict-Transport-Security` via
   `next.config.mjs` headers.
4. **Finish or remove `admin_web`** before any deployment touches it.
5. **Add a refresh-token flow** in the web axios interceptor: on 401,
   call `/auth/refresh`, retry once, then log out cleanly.
6. **Consolidate dependencies** using a workspace tool (pnpm
   workspaces or Turborepo) and a single root `package.json`.
7. **Extract a shared UI package** (`packages/ui-web`) and a shared
   API client package to stop duplicating between `hms_web` and
   `pms_web`.
8. **Add a minimum test suite** for auth store, API client, and
   permissions in each app. Vitest is the lightest add.
