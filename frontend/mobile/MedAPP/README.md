# MedApp mobile

Patient and specialist application built with Expo SDK 55, React Native, Expo Router,
NativeWind, TanStack Query, and Zustand. Routes live in `src/app`; features live in `src/features`.

See the [completion guide](../../../docs/COMPLETION_GUIDE.md) and
[screen inventory](../../../docs/SCREEN_INVENTORY.md) for implementation and acceptance status.

For Google and Apple sign-in, follow the [provider setup guide](../../../docs/PROVIDER_SIGN_IN_SETUP.md).
It lists the required accounts, public client IDs, backend settings, native builds and live checks.
Providers stay unavailable until configured; email authentication remains available.

## Install

Run commands from this directory. Use a Node version supported by
[Expo SDK 55](https://docs.expo.dev/versions/v55.0.0/); Node 24 is used locally.

```powershell
npm.cmd ci --include=dev
npx.cmd expo install --check
```

Expo CLI is included in the dependencies. The lockfile contains React Native, platform packages
and test tools. Run install scripts normally; `--ignore-scripts` is not the complete setup.

Keep `react-test-renderer` pinned to the exact React version. React Native Testing Library v13
requires that match; leaving its broad peer range unpinned can select an incompatible renderer
during a fresh install.

When Expo reports incompatible versions, use `npx.cmd expo install --fix` and review
`package.json` and `package-lock.json` together. Keep upgrades within the chosen SDK until
a deliberate SDK migration is planned.

## Run

Start the API gateway and services required by the flow under test. The normal local gateway
is port 8000. For a browser session:

```powershell
$env:API_BASE_URL = 'http://localhost:8000'
npm.cmd run web -- --port 8082 --localhost
```

For the native development server, use `npm.cmd start`. `npm.cmd run android` requires Java,
Android SDK tooling and a device or emulator. An iOS build requires macOS and Xcode. For a
physical device, set `API_BASE_URL` to a host it can reach; the Android emulator default is
`http://10.0.2.2:8000`.

`app.config.ts` reads the API URL when Expo starts; restart Expo after changing it. The gateway's
CORS allow-list must include the exact browser origin, for example `http://localhost:8082`.

Password recovery also requires the user service's SMTP configuration. See the
[user-service contract](../../../docs/api/user_service.md). The temporary recovery QA harness
uses a local test inbox and isolated database; it does not validate deployed email delivery
or other service-backed journeys.

## Check

```powershell
npx.cmd expo install --check
npx.cmd expo-doctor
npx.cmd tsc --noEmit --incremental false
npm.cmd test -- --runInBand
```

The completion baseline records results, environment limits, and test-runner timing/shutdown
issues. Unit tests and a successful bundle do not replace browser or native-device checks.

## Windows / OneDrive

Dependency operations in a OneDrive-synced checkout can be slow. Recovery QA also uses a
disposable source mirror at `%LOCALAPPDATA%\MedApp\recovery-runtime\mobile`. Copy current source
and both package files into the mirror before testing, and run `npm.cmd ci` when its lockfile
changes. The repository remains the source of truth; results apply only to the copied source
and dependency versions actually tested.
