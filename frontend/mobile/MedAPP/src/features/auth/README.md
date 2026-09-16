# features/auth/

Sign-in, signup, password recovery and session restoration. Network contracts live
in `api.ts`; `store/auth-store.ts` owns the current session, and `lib/storage/`
owns credentials. The screen references remain subject to the completion guide.

## Biometric sign-in

Enrollment is an explicit action in **Security & privacy**, after password sign-in.
Hardware capability and enrollment are separate facts. Capability checks read only
metadata and supported sensor types; they never read credentials or open a prompt.

`secure-storage.ts` generates an AES-256 key and stores it under a unique native
SecureStore key/service with `requireAuthentication` and
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Enrollment reads the key back through the protected
API before success, including on iOS where creation alone does not prompt. The
refresh token is encrypted with Expo Crypto AES-GCM, using a fresh nonce and
account/key context as authenticated data. Ordinary access/refresh entries are
removed before enrollment is committed. No biometric image or template is stored
or transmitted by MedApp.

After a process restart, an enrolled account reaches sign-in without loading its
profile. A biometric action unlocks the key, decrypts the credential and exchanges
it at `/v1/auth/refresh`. The returned owner must match the enrolled account.
Authenticated access stays in memory. Refresh rotation reseals the new credential
using the already-unlocked key; routine renewal does not open another device prompt.
The rotated credential is persisted **before** requesting `/v1/me`, so a failed
profile request does not leave a consumed refresh token as the next retry.

**Lock MedApp** immediately hides the account and clears query data. An in-flight
refresh is allowed to persist its successor before the in-memory key is dropped;
new unlock attempts wait for that operation to settle. There is no automatic
background/inactivity lock in this implementation. It protects process restarts
and explicit locks, not an app session that the user leaves open.

Turning the setting off requires confirmation and a fresh protected-key read, then
restores normal saved-session behavior. Explicit sign-out removes tokens and this
device's enrollment, retains its install ID and attempts server revocation. A new
password sign-in also removes the previous enrollment; the user can enable it again
in settings. Enrollment is not silently transferred between accounts.

Cancellation leaves enrollment unchanged. Missing/invalidated keys offer password
recovery and setup again. A network failure preserves the encrypted credential for
retry; a server 401 removes rejected credentials. Session revisions, serialized
storage mutations and a shared biometric attempt prevent stale responses or
repeated confirmations from installing a different session.

`biometric: true` is a client-reported audit hint. It is not server attestation,
WebAuthn, a passkey, or a second authentication factor. Refresh tokens remain bound
to `X-Device-Id`, and active session families follow the user-service contract.

## Native verification

Expo SDK 55 `expo-secure-store` and `expo-crypto` are used directly. The SecureStore
and LocalAuthentication config plugins supply the Face ID permission string. A
fresh native build and physical device are required to verify protected key access;
Expo Go/browser tests cannot accept this feature. See the versioned
[SecureStore documentation](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)
and [Crypto documentation](https://docs.expo.dev/versions/v55.0.0/sdk/crypto/).

Device acceptance must cover setup/cancel, process restart, unlock, token renewal,
explicit lock during renewal, disabling, sign-out, password fallback, changed
biometric enrollment, unavailable hardware and account switching. Test both themes
and navigation after each outcome. Component and storage tests cannot prove native
keychain enforcement.

## Signup and recovery

The patient flow currently verifies **email** before collecting personal details and
creating the account. The final signup request includes the contact-bound proof and
personal details in one account-creation transaction. Email proof does not verify a
phone number. SMS delivery remains a separate provider integration.

Signup does not enable biometrics, two-factor authentication or care-team sharing.
Its security step points to biometric and authenticator setup in settings after account creation.
Scoped clinical consent remains open work. An account-created
but failed sign-in outcome offers login without submitting the account again.

Password recovery uses the opaque email reset token, not the six-digit signup code.
SMTP delivery and backend behavior are documented in `docs/api/user_service.md`.

## Authenticator sign-in

Security & privacy opens the two-factor settings route. Setup rechecks the current
password, displays a selectable key and authenticator app link, and asks the user
to save ten single-use recovery codes. A six-digit authenticator proof activates
the setting; signup never activates it. Enable/disable/recovery-code replacement
ends refresh sessions and requires sign-in again. Existing access JWTs keep their
expiry, which the screen explains.

`authApi.login` throws `TwoFactorRequired` when the server returns a password-verified
challenge without tokens. `SignInScreen` clears its password and renders
`TwoFactorSignIn`; only a successful verification and profile lookup install an
authenticated session. Codes cannot be reused. Lost responses or expired challenges
offer a new password sign-in; recovery codes support a lost authenticator. A late
challenge or proof response cannot overwrite another account. Setup and challenge
secrets are not persisted or placed in a profile query cache.

Backend migration, encryption-key configuration, rate limits and contracts are in
`docs/api/user_service.md`. Test coverage establishes software behavior, not rendered
or device acceptance. Verify an installed authenticator's app link/manual key entry,
both themes, keyboard and screen-reader behavior on target devices before release.
# Provider sign-in

Google/Apple entries open `ProviderSignInScreen`. It checks server configuration
and native availability, then requests a one-time nonce and exchanges the native
identity proof. Existing account linking requires the MedApp password and any
enrolled second factor. New users continue through the existing email verification
and personal-details wizard; proof tickets stay in the in-memory signup draft.
Changing the signup email clears the provider association. Expired/failed provider
signup offers a restart action. Security & privacy links to Connected accounts for
listing and disconnecting providers.

The owner has not configured provider credentials. See
[the setup guide](../../../../../../docs/PROVIDER_SIGN_IN_SETUP.md) for required
public IDs, native builds and acceptance checks. Google is implemented for native
Android/iOS; Apple is implemented for native iOS. Web/Expo Go use email fallback.
