# features/auth/

Sign-in, sign-up, password reset, session bootstrap.

Owns:

- Login / signup / forgot-password forms (zod-validated).
- `api.ts` — the only place auth endpoints are called.
- Token persistence is delegated to `lib/storage/` (SecureStore).
- The global `auth-store` lives in `store/auth-store.ts`, not here — auth state is read across the whole app.

## Biometric sign-in

Pattern: biometric unlocks the locally-stored refresh token, then we
swap it for a fresh access/refresh pair via `/v1/auth/refresh`. The
backend does not need to know that the user used a fingerprint — it
only sees a refresh-token call. Same model banking apps use; the
secret never leaves the device.

Files:

- `hooks/use-biometric-login.ts`
  - `useBiometricCapability()` — probes `hasHardwareAsync` +
    `isEnrolledAsync` + `supportedAuthenticationTypesAsync` AND checks
    that a refresh token is stored. Drives whether the FaceID /
    Fingerprint buttons render.
  - `useBiometricLogin()` — mutation that runs
    `LocalAuthentication.authenticateAsync` → `authApi.refresh` →
    `useAuthStore.signIn`. Throws `BiometricLoginAbort` with a
    discriminated `kind` for the caller to map to UX copy.
- `SignInScreen.tsx` — calls both hooks and renders the buttons
  conditionally. `user_cancel` is silent (the user changed their
  mind), `refresh_failed` clears the stale refresh token so the
  buttons stop appearing.

When the buttons appear:

| State                                          | Buttons rendered? |
|------------------------------------------------|-------------------|
| First install, no prior sign-in                | No (no refresh token) |
| Signed out                                     | No (refresh token cleared) |
| Signed in once, signed out, signed in again    | Yes (refresh token stored on the last successful login) |
| Device has no biometric hardware               | No                |
| Device has hardware but user hasn't enrolled   | No                |
| Refresh token revoked server-side              | First tap clears the stale token; next render hides the buttons |

Native config in `app.config.ts` ships the FaceID prompt string via
the `expo-local-authentication` config plugin so it ends up in
`NSFaceIDUsageDescription` at build time. Android needs no extra
config.

### Step 2 (landed): device-bound refresh + biometric audit

- **Per-install device id**: `lib/device/device-id.ts` generates a v4
  UUID on first launch and persists it in SecureStore. The api client
  attaches it as `X-Device-Id` on every request via a registered
  provider (same pattern as the auth-token provider).
- **Backend binding**: the user_service stores `device_id` on each
  `refresh_tokens` row. A refresh from a different install returns 401
  and revokes the whole chain. Legacy rows without a `device_id` are
  grandfathered for one rotation so old mobile builds keep working
  during rollout — the next rotation stamps the new id.
- **Biometric audit**: the biometric hook passes `biometric: true` on
  refresh. The backend writes a `user.biometric_login` row to
  `audit_log` and emits the same-named domain event so analytics /
  SIEM can spot anomalies (e.g. biometric login from a new install).

## Signup OTP (phone or email)

Signup is a 4-step wizard:

```
Step 1 (account)  →  Verify (OTP)  →  Step 2 (about you)  →  Step 3 (security)
```

The verify step sits between Step 1 and Step 2:

- Step 1 collects email + password. Email is the cheap contact to
  verify — pre-filled into the verify screen.
- If the user picks **SMS**, they enter a phone (E.164) on the verify
  screen itself (Step 1 doesn't collect it).
- The matching channel sends a 6-digit code; the user types it back.
- On success, the backend returns a short-lived JWT pinned to
  `(channel, recipient)`. We stash it in the draft store and proceed.
- The final submit at Step 3 forwards the JWT to `/v1/auth/signup`;
  the backend marks `email_verified=true` or `phone_verified=true`
  at creation time.

If the contact already belongs to an existing user, the start call
returns 409 → we show "Looks like you already have an account" with a
sign-in CTA.

Files:

- `SignUpVerifyScreen.tsx` — two-state UI (picker → code entry).
- `hooks/use-signup-otp.ts` — `useSignupOtpStart` + `useSignupOtpVerify`.
- `hooks/use-signup-draft.ts` — adds `verification` to the in-memory
  draft.
- `app/(public)/sign-up-verify.tsx` — route between Step 1 and Step 2.

### What this slice does NOT do

- No biometric for first-time sign-up. By design — biometric is an
  unlock for an already-issued refresh token, not an alternative to
  password sign-in.
- No WebAuthn / passkey. That's a bigger lift — server-stored public
  keys, challenge-response signing. The current pattern (biometric
  unlocks a stored refresh token, server doesn't see biometric data)
  is the right MVP and matches what banking apps ship.
