# Mobile build setup and Android reminder acceptance

Prepared 2026-09-17. The product owner selected **Android** for the first live
reminder test. Build configuration is prepared; no APK, cloud build, native launch
or real push has been verified. See [reminder behavior and rollout](MEDICATION_REMINDERS.md)
and [the completion baseline](COMPLETION_BASELINE.md) for the separate database checks.

## Build variants

Run commands from `frontend/mobile/MedAPP`. The checked-in `eas.json` defines:

| Profile | EAS environment | APP_ENV | Android application ID | Output |
| --- | --- | --- | --- | --- |
| `development` | `development` | `dev` | `com.amalitech.medapp.dev` | Internal APK with the development client |
| `preview` | `preview` | `preview` | `com.amalitech.medapp.preview` | Internal APK with bundled JavaScript |
| `production` | `production` | `prod` | `com.amalitech.medapp` | Store AAB; remote version increment |

The iOS bundle IDs follow the same variants, but iOS acceptance is a separate task.
Android and iOS directories are generated and ignored; app.config.ts and config
plugins remain the source of truth. No store submission is configured. These
profiles follow [Expo's EAS build configuration](https://docs.expo.dev/build/eas-json/).

## Configure the intended project

1. Use the organization's intended Expo account/project. The app currently has
   slug `MedAPP`; confirm its slug and owner agree with that project before
   building. Supply its public UUID as `EAS_PROJECT_ID` locally and in the matching
   EAS environment. Project existence and ownership require authenticated EAS
   verification; a correctly shaped UUID alone is insufficient.
2. Set `API_BASE_URL` explicitly to the intended gateway that the phone can reach.
   Preview and production require HTTPS. Development may use a trusted LAN HTTP
   address with synthetic accounts. `localhost`, `10.0.2.2` and `10.0.3.2` do not
   identify the Windows host from a physical phone. Also configure reachable
   `PARTNER_ONBOARDING_URL` and `HMS_WEB_URL` before testing professional portal
   journeys; the reminder check does not certify those separate flows.
3. Register the exact Android application ID from the table in Firebase. Download
   its **Android client** `google-services.json`. Store a local copy outside the
   checkout or in ignored `credentials/`. Set `ANDROID_GOOGLE_SERVICES_FILE` to
   its path. Each variant needs a matching client entry. Do not use a private
   service account JSON as this file.
4. For cloud builds, upload that client file as an EAS **file** environment
   variable named `ANDROID_GOOGLE_SERVICES_FILE` in the selected environment.
   EAS supplies its path on the build worker. Use plain text or sensitive visibility
   for public `EAS_PROJECT_ID` and `API_BASE_URL`, which must be available while
   EAS CLI resolves configuration. Local ignored `.env` files do not provision
   cloud environment variables. See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
   and [their build-time availability](https://docs.expo.dev/eas/environment-variables/usage/).
5. Configure the Firebase project's **FCM v1 service account key** in EAS push
   credentials for this application ID. Keep that private key out of the app,
   repository and conversation. Check client API restrictions/signing fingerprints
   when using restricted Firebase keys. Follow [Expo's FCM v1 setup](https://docs.expo.dev/push-notifications/fcm-credentials/).

The Expo project ID and Firebase client configuration become part of the app.
Private FCM/APNs keys and `EHR_EXPO_ACCESS_TOKEN` never belong in app config or
`EXPO_PUBLIC_*` variables. The latter is a server-only setting when enhanced Expo
push security is enabled.

## Run configuration checks

Install the lockfile, then populate the ignored local `.env` using `.env.example`.
The repository does not contain a real project ID, Firebase file or reachable
device gateway configuration.

```powershell
npm.cmd ci --include=dev
npm.cmd run check:native-build -- --profile development --platform android
npm.cmd run test:native-build
```

The configuration check loads Expo's environment/configuration without starting
Metro, generating native directories, contacting a provider or requesting push
permission. It reports all missing requirements together and exits nonzero on
failure. `--json` produces a report without printing configured values, private
paths or raw errors. Local checks apply the selected profile's `APP_ENV`, just as
EAS does; EAS workers must already supply the correct profile environment.

It checks the project UUID, resolved app variant, explicit phone API URL,
notifications plugin and matching Firebase client fields. A pass is **local
configuration evidence only**: it does not authenticate the Expo project, check
FCM credentials, prove gateway reachability or assert push delivery. The same
check runs in `eas-build-post-install` before compilation; per [Expo's hook order](https://docs.expo.dev/build-reference/npm-hooks/),
this is after dependency installation and any native prebuild (and CocoaPods on
iOS), so run the local check before requesting a cloud build.

Once account/project access and the selected environment are configured, the
build commands are:

```powershell
npx.cmd eas-cli@latest whoami
npx.cmd eas-cli@latest project:info
npx.cmd eas-cli@latest build --platform android --profile development
```

Cloud builds use the organization's Expo account and build allowance. Install the
resulting APK from its EAS build page. A development build requires the configured
Metro server; a preview build bundles JavaScript for later standalone acceptance.
The existing automatic approval block on preview startup remains unresolved;
these commands are a setup handoff, not evidence of an executed build or launch.
Rebuild after changing native plugins or Firebase/app identifiers. The MedApp
reminder adapter requires a physical device and a native build; it declines Expo
Go and emulator registration.

## Android acceptance record

Use synthetic patients and medicine entries. Record the Git revision or patch
identity, EAS build ID/profile, APK version, Android version, gateway environment,
EHR migration and worker version. Never put auth tokens, push tokens, private
credentials or patient information in the evidence.

| Check | Expected evidence |
| --- | --- |
| Database gate | Current isolated PostgreSQL suite passes migration, round-trip guards and two-worker contention before deployment; EHR is at `20260917_0007`. |
| API and worker | Same EHR database; both use `EHR_MEDICATION_PUSH_ENABLED=true`; worker is running. A capability flag alone is not proof of worker health. |
| First opt-in | Signed-in patient enables a course and explicitly enables this device; Android permission and device registration succeed. |
| Foreground / background | A future saved slot produces the generic MedApp alert in both states. Compare actual arrival with attempt history; an accepted Expo ticket alone does not pass. |
| Tap | Opens the signed-in patient's tracker and leaves the dose unreported until the patient acts. |
| Suppression | Test opt-out, permission denial, pause, completion, withdrawn prescription and a dose already reported before sending. No new eligible send should be created. An already submitted push cannot be recalled. |
| Future schedule | The new plan starts on its effective date in the saved timezone; prior dose history stays unchanged. Check timezone and daylight-saving cases separately. |
| Identity and restart | App restart renews an existing opt-in; account switch cannot display another account's course. Online logout/lock disables its binding. Record the documented offline revocation gap and seven-day lease. |
| Concurrency and token change | One attempt per device/slot, no replay of an ambiguous send, renewed/replaced tokens retain correct ownership. Backend concurrency results and a device token-change check are distinct evidence. |

Current status: Android was selected; the local ADB inventory showed **zero
connected devices**. Docker's Linux engine is unavailable. Automatic approval
review previously rejected Docker restart/socket cleanup and preview startup as
blocked by policy. No blocked operation was retried in this setup pass. Database,
provider and phone acceptance remain open; **0 of 108 reference screens accepted**.
