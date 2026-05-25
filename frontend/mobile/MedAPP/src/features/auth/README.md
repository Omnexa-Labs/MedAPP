# features/auth/

Sign-in, sign-up, password reset, session bootstrap.

Owns:
- Login / signup / forgot-password forms (zod-validated).
- `api.ts` — the only place auth endpoints are called.
- Token persistence is delegated to `lib/storage/` (SecureStore).
- The global `auth-store` lives in `store/auth-store.ts`, not here — auth state is read across the whole app.
