# Google and Apple sign-in setup

The owner confirmed on 2026-09-13 that provider accounts are **not configured yet**.
The integration stays unavailable until both the backend and the native app are
configured. Email verification and password sign-in remain available independently.

## Start here

Use the **dev** environment for the first setup. Complete these items before the
live sign-in checks at the end of this guide:

- [ ] Create the Google Cloud project, consent configuration and Web/iOS/Android clients.
- [ ] Enable Sign in with Apple for `com.amalitech.medapp.dev` in the Apple Developer account.
- [ ] Register the email sender with Apple's private relay and verify SMTP delivery.
- [ ] Add the public mobile values and backend audience values below.
- [ ] Apply the user-service migration, reload its configuration and check availability.
- [ ] Configure and install signed native development builds, then run the acceptance matrix.

Each provider can be enabled independently once its own configuration is ready.
The owner supplies the provider accounts, signing access and public client IDs;
implementation and testing can then use those configured environments. Keep client
secrets, signing keys and SMTP passwords in the appropriate local/build/server
secret storage rather than sharing them in chat.

| Value to collect | Where it belongs |
| --- | --- |
| Google Web OAuth client ID | Mobile `GOOGLE_WEB_CLIENT_ID`; also in server `USER_GOOGLE_CLIENT_IDS`. |
| Google iOS OAuth client ID | Mobile `GOOGLE_IOS_CLIENT_ID`; also in server `USER_GOOGLE_CLIENT_IDS`. |
| Google Android OAuth client ID(s) | Server `USER_GOOGLE_CLIENT_IDS`; each is registered against the installed build's package and signing SHA-1. |
| Apple bundle identifier, e.g. `com.amalitech.medapp.dev` | Server `USER_APPLE_CLIENT_IDS`; must match the mobile `APP_ENV`. Do not add the Apple Team ID prefix. |
| Apple capability enabled | Mobile `APPLE_SIGN_IN_ENABLED=true`, with matching signing/provisioning. |
| Gateway address reachable from the test device | Mobile `API_BASE_URL`; a phone's `localhost` points to the phone. |
| SMTP host, sender, port, security mode and optional login | User-service `USER_SMTP_*` settings; see the root `.env.example`. |

## What is implemented

- Google native sign-in on Android/iOS using `react-native-nitro-google-signin` 2.2.0
  and `react-native-nitro-modules` 0.37.1; Apple native sign-in on iOS using
  `expo-apple-authentication` 55.0.17. Provider buttons use the native components.
- A five-minute server challenge with a random nonce and an install-bound, hashed
  token. The server validates provider signatures, issuer, configured audience,
  expiry, subject and nonce. Identity tokens are not saved or logged.
- New accounts continue through the existing password, terms, **email OTP** and
  personal-details wizard. A provider proof alone cannot create a verified account.
- Connecting a provider to an existing account requires the account's password
  and, when enrolled, an authenticator or recovery code. Matching email addresses
  never connect accounts automatically. Linking leaves the existing account's
  email verification status unchanged.
- Returning users are found by provider and subject, including Apple users whose
  email is omitted on subsequent sign-ins. Enrolled MedApp two-factor authentication
  still applies. No professional role is granted through provider signup.
- Security & privacy → Connected accounts lists and disconnects login methods.
  Disconnection requires password/code proof, removes pending two-factor challenges
  and revokes refresh sessions. Existing access tokens expire within their configured
  lifetime (15 minutes by default). Disconnecting does not delete either account or
  revoke the user's authorization at Google/Apple.

This implementation does not provide Google sign-in on web or Apple sign-in on
Android/web. Those require a separate browser authorization/callback integration
if those release targets are selected. Live provider and device acceptance is pending.

## Use the matching application identifier

| APP_ENV | iOS bundle ID / Android package |
| --- | --- |
| `dev` | `com.amalitech.medapp.dev` |
| `preview` | `com.amalitech.medapp.preview` |
| `prod` | `com.amalitech.medapp` |

Configure separate credentials for each environment. Do not put development
audiences in a production backend allowlist. The values below are placeholders,
not working credentials.

## Google configuration

1. Create or choose the Google Cloud project for the relevant MedApp environment.
   Configure its OAuth consent screen, app name, support email, authorized audience
   and test users. Request only basic identity information; this flow does not ask
   for Drive, Gmail, calendar access, offline access or a server authorization code.
2. Create a **Web application** OAuth client. Its client ID is the server audience
   used by the native library. This is not the Android client ID. No Web client
   secret belongs in the app or this ID-token verification flow.
3. Create an **Android** OAuth client with the exact package above and the SHA-1
   certificate fingerprint for each build signing key you will test/release.
   Debug, EAS and Google Play signing certificates can differ. Register the actual
   signing certificates for the installed build.
4. Create an **iOS** OAuth client for the matching bundle ID. Set the two public IDs
   in the mobile environment:

   ```dotenv
   GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT.apps.googleusercontent.com
   GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT.apps.googleusercontent.com
   ```

5. Set the backend audiences, separated by commas:

   ```dotenv
   USER_GOOGLE_CLIENT_IDS=YOUR_WEB_CLIENT.apps.googleusercontent.com,YOUR_IOS_CLIENT.apps.googleusercontent.com,YOUR_ANDROID_CLIENT.apps.googleusercontent.com
   ```

   Include every native client ID for this environment's signed builds, including
   additional Android signing-key clients, for authorized-party (`azp`) validation. The app
   config derives the reversed iOS URL scheme from the iOS client ID. This explicit
   ID setup does not need Firebase config files. Both public mobile IDs are required
   by the current app configuration, including when initially testing Android.

Follow the [Expo Google authentication guide](https://docs.expo.dev/guides/google-authentication/),
the installed library's [Expo configuration instructions](https://github.com/react-native-nitro-google-sign-in/google-signin)
and [Google's server token-verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Apple configuration

1. In the Apple Developer account, register/select the explicit App ID for the
   chosen iOS bundle identifier. Enable **Sign in with Apple** and use a matching
   development/distribution provisioning profile.
2. Set the mobile build flag and the server audience for that environment:

   ```dotenv
   APPLE_SIGN_IN_ENABLED=true
   USER_APPLE_CLIENT_IDS=com.amalitech.medapp.dev
   ```

   `APPLE_SIGN_IN_ENABLED` belongs to the mobile build. `USER_APPLE_CLIENT_IDS`
   belongs to the user service. Change the bundle ID for preview/production.
3. Test on a supported physical iOS device signed in to Apple. A Hide My Email
   address is a valid account address; keep it rather than silently replacing it.
   Register the actual outbound email sources for Apple's private email relay so
   the app's verification/recovery messages reach relay users.

In Certificates, Identifiers & Profiles, open **Services → Sign in with Apple for
Email Communication → Configure** to register those sources. Check SPF/DKIM with
the SMTP provider; a provider-managed return-path can require DKIM aligned with
the registered From domain. Test both signup OTP and password recovery using a
Hide My Email account. See [Apple's private relay setup](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/).

Native iOS ID-token verification does not require an Apple Services ID, private
`.p8` key or client secret. A future Android/web Apple flow and provider token
revocation would need additional server-side setup. See the versioned
[Expo Apple authentication documentation](https://docs.expo.dev/versions/v55.0.0/sdk/apple-authentication/)
and [Apple's user-verification documentation](https://developer.apple.com/documentation/signinwithapple/verifying-a-user).

## Apply application and server configuration

Mobile values are read by `frontend/mobile/MedAPP/app.config.ts` and embedded as
public build configuration. Keep actual local values in that project's ignored
`.env` or your build environment. Backend values go in the user-service deployment
environment; `infra/docker/docker-compose.yml` forwards the two audience variables.
Commit only placeholder examples. Mobile configuration contains public values;
keep server passwords and signing keys out of it.

Apply the user-service Alembic migration `20260913_0007` using the deployment's
usual migration command before enabling the provider endpoints. The migration adds
identity and expiring-attempt tables; it does not link any existing account. A
downgrade refuses to discard existing provider identities until they have been
explicitly disconnected. Back up the database before deployment.

For an already prepared **local Compose development stack**, these are the
commands to run from the repository root after putting the backend values in the
ignored root `.env`. They build the current user-service code, apply its migrations
and recreate only that service to load the changed environment:

```powershell
docker compose --env-file .env -f infra/docker/docker-compose.yml build user_service
docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm --no-deps user_service alembic upgrade head
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --no-deps --force-recreate user_service
```

PostgreSQL, RabbitMQ and the gateway must already be running; stop at any failed
step. `upgrade head` also applies earlier pending user-service migrations. This
Compose file is a local development configuration, not a production deployment
template. For a separately hosted user service, apply its deployment environment
and migration process instead. Changing a `.env` file alone does not update an
already running service.

Rebuild the native development client after setting provider IDs/capabilities;
a JavaScript reload cannot add native modules or entitlements. The app now includes
Expo SDK 55's `expo-dev-client`. The Google integration does not run in Expo Go.
Web and Expo Go keep the email fallback. No native build or Expo startup was run as
part of this setup: automatic approval review previously rejected Expo startup as
“blocked by policy” without a specific reason.

After the user service is running, `GET /v1/auth/providers/config` through the
gateway reports only the two availability flags. It does not prove that the IDs,
signing certificates, SMTP relay or native binaries have been configured correctly.

For example, this read-only PowerShell check uses the normal Compose gateway;
change the URL for a different running gateway:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/v1/auth/providers/config'
```

With both backend audience settings empty, the response is
`{"google":false,"apple":false}`. A provider becomes `true` when its audience list
is nonempty. Placeholder IDs also produce `true`, so this check is only a
configuration check. The mobile build must independently have the corresponding
values, native modules and supported platform.

## Prepare native builds

The provider dependencies are already in the lockfile. Use the mobile README's
installation instructions for a fresh checkout. Google is implemented on native
Android/iOS; Apple is implemented on native iOS. This app keeps both providers
unavailable on web and in Expo Go.

There is currently no `frontend/mobile/MedAPP/eas.json` or EAS project ID in the
app config. If using EAS Build, first associate the app with the owner's Expo
project, then configure a development profile with `developmentClient: true` and
internal distribution. Preserve the assigned EAS project ID in `app.config.ts`'s
`extra` object alongside the existing entries; that object is explicitly created
by the current config. See [Expo's EAS configuration guide](https://docs.expo.dev/build/eas-json/).

Set `APP_ENV=dev`, `API_BASE_URL`, `GOOGLE_WEB_CLIENT_ID`,
`GOOGLE_IOS_CLIENT_ID` and `APPLE_SIGN_IN_ENABLED` in the selected build environment
as appropriate. EAS environment names such as `development` are separate from
this app's `APP_ENV` values (`dev`, `preview`, `prod`); do not set `APP_ENV=development`.
A local ignored `.env` must not be assumed to supply values to a cloud build.

Local Android builds need Java, the Android SDK and an emulator or connected
device. Local iOS builds need macOS and Xcode; from Windows, use an EAS cloud build
for iOS. A physical iOS development build also needs device registration and a
matching provisioning profile. Follow [Expo's development build instructions](https://docs.expo.dev/develop/development-builds/introduction/).

Use the same environment when running the development server as when building
the installed binary. Rebuild after changing provider native configuration, and
record the installed build's package/bundle identifier and Android signing SHA-1
with the acceptance results.

## Troubleshooting the first sign-in

| Symptom | Check |
| --- | --- |
| Provider is unavailable in the app | Gateway flags, public mobile values, installed native modules and platform support; Google currently requires both mobile client IDs even on Android. |
| Google cannot complete native sign-in | Installed package, actual signing SHA-1, matching iOS bundle/client and reversed URL scheme; all clients should belong to the intended Google project. |
| Server rejects a provider proof | Environment-specific audience/authorized-party lists and device clock; start a fresh flow for a new nonce instead of retrying an old proof. |
| Apple consent works but signup cannot finish | SMTP delivery, sender registration and private relay authentication; signup still requires email OTP. |
| Gateway check works on the computer but the phone cannot connect | Device-reachable `API_BASE_URL` and network access to that gateway; `10.0.2.2` is for the Android emulator. |
| Changed settings have no effect | Recreate/redeploy the user service for backend settings; rebuild native configuration and run the matching mobile environment. |

## Required acceptance after credentials are supplied

### Internal reviewer console

The admin console has a separate Google Workspace SSO contract. Its backend,
browser session and application review screens are implemented; real-provider
and rendered acceptance remain pending.
Prepare a dedicated **Web application** OAuth client for the eventual admin
origin in the organization's Google project. Register that exact origin under
authorized JavaScript origins when the admin deployment address is known. Keep
this client separate from the mobile clients described above.

Configure the user service with:

```dotenv
USER_ADMIN_GOOGLE_CLIENT_ID=YOUR_ADMIN_WEB_CLIENT.apps.googleusercontent.com
USER_ADMIN_WORKSPACE_DOMAINS=YOUR_MANAGED_WORKSPACE_DOMAIN
```

Use exact managed domains, separated by commas if necessary. These values are
public configuration, not client secrets. Leave them blank until the corresponding
Google setup exists. Redeploy/recreate the user service to load changed values;
the existing Compose definition forwards both settings. The read-only endpoint
`GET /v1/auth/admin-sso/config` reports configuration availability, not a successful
Google sign-in test.

An administrator must already have an active MedApp account with role `admin` or
`platform_admin` and their Google identity connected through the existing explicit
provider-linking flow. Their current MedApp email must match Google's verified
Workspace email and its domain must match the signed hosted-domain claim. An
authorized operator must provision the administrator role through the established
administration process. Adding a domain or matching an email never grants a role.

The browser integration uses the server's nonce with Google's identity button
and submit the returned credential to its own server. It must not expose MedApp
refresh tokens or persist Google credentials in browser storage. The same device
ID must be retained through the enrolled MFA step and session renewal. Google's
`hd` parameter is a chooser hint; authorization depends on the signed claim checked
by the backend. See [Google's server verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
and [JavaScript identity API reference](https://developers.google.com/identity/gsi/web/reference/js-reference).

With the deployment configured, verify allowed-admin login, ordinary-user
denial, wrong Workspace, unlinked identity, cancelled/expired consent, enrolled
MFA, sign-out, account demotion and provider unlink. Current local backend tests
use synthetic signed Google tokens; real Workspace consent has not been tested.

### Patient and specialist native sign-in

| Journey | Expected result |
| --- | --- |
| New Google/Apple user | Native consent → email/password/terms → email OTP → personal details → account; provider is connected exactly once. |
| Existing verified email | Explicit linking confirmation; wrong password/code rejects; valid proof connects the existing account. |
| Existing unverified email | Password/code proof still required; linking does not silently mark the email verified. |
| Returning connected user | Same account and role; MedApp two-factor challenge when enrolled. |
| Apple Hide My Email | Verification and recovery email arrive; subsequent login works when native email/name are absent. |
| Cancel, offline, expired proof | No session or connection is falsely reported; retry/email fallback works. |
| Account changes while request waits | Old response cannot replace the new account. |
| Disconnect | Provider link removed; refresh sessions revoked; password login remains usable. |
| Wrong app audience, nonce or reused proof | Server rejects it without issuing a MedApp session. |

Run this matrix on the actual signed Android/iOS builds, then verify small screens,
large text, both themes and screen-reader labels. Record results against B01 in the
completion baseline. Software tests with synthetic signatures do not replace these
provider/device checks.
