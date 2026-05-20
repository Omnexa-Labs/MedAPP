# MedApp Mobile (React Native + Expo)

The MedApp mobile client. Built with Expo (managed workflow), React Navigation, TanStack Query, Zustand, and NativeWind. Builds are distributed via EAS.

## Stack

- **Runtime:** Expo SDK 51, React Native 0.74, TypeScript
- **Navigation:** `@react-navigation/native` (native stack + bottom tabs)
- **Server state:** `@tanstack/react-query` + `axios`
- **Client state:** `zustand`
- **Storage:** `expo-secure-store` (tokens) + `@react-native-async-storage/async-storage` (prefs)
- **Styling:** NativeWind (Tailwind for RN)
- **Build/distribution:** EAS Build + EAS Submit

## Project layout

```
mobile/
├── App.tsx                # providers (query, navigation, gesture handler, safe area)
├── index.ts               # entrypoint (registerRootComponent)
├── app.config.ts          # Expo config (reads APP_ENV, USE_MOCK_API, API_BASE_URL)
├── eas.json               # EAS build profiles
├── babel.config.js        # nativewind + reanimated + module-resolver
├── metro.config.js        # nativewind metro integration
├── tailwind.config.js
├── global.css             # tailwind directives
├── tsconfig.json          # path alias @ -> src
└── src/
    ├── core/
    │   ├── config/env.ts          # reads expoConfig.extra
    │   ├── network/apiClient.ts   # axios instance + auth interceptor
    │   ├── network/queryClient.ts # TanStack Query client
    │   ├── storage/secureStorage.ts # token storage (expo-secure-store)
    │   ├── storage/prefs.ts         # non-sensitive prefs (AsyncStorage)
    │   └── theme/colors.ts
    ├── store/
    │   └── authStore.ts           # zustand auth slice + hydration
    ├── navigation/
    │   ├── RootNavigator.tsx      # switches Auth vs App based on auth state
    │   ├── AuthNavigator.tsx
    │   ├── AppTabs.tsx
    │   └── types.ts
    └── features/
        ├── auth/{SignInScreen,SignUpScreen}.tsx
        ├── home/HomeScreen.tsx
        ├── chat/ChatScreen.tsx
        └── profile/ProfileScreen.tsx
```

## Getting started

```bash
cd frontend/mobile
npm install
npx expo start
```

Press `a` for Android emulator, `i` for iOS simulator, or scan the QR with Expo Go.

> First-time only: install the Expo and EAS CLIs globally if you don't have them.
> `npm i -g expo eas-cli`

## Configuration

App config lives in `app.config.ts` and reads three env vars:

| Env var         | Values                          | Default in dev                       |
| --------------- | ------------------------------- | ------------------------------------ |
| `APP_ENV`       | `dev` \| `preview` \| `prod`    | `dev`                                |
| `USE_MOCK_API`  | `true` \| `false`               | `true` when `APP_ENV=dev`            |
| `API_BASE_URL`  | URL                             | `localhost:8000` (iOS/web), `10.0.2.2:8000` (Android emu) |

Each EAS build profile in `eas.json` sets these. For a physical device on your LAN,
start with `API_BASE_URL=http://192.168.x.x:8000 npx expo start` (Windows PowerShell:
`$env:API_BASE_URL = "http://192.168.x.x:8000"; npx expo start`).

Bundle IDs and app name are also env-suffixed (`com.amalitech.medapp.dev`,
`com.amalitech.medapp.preview`, `com.amalitech.medapp`) so all three builds can
sit on one device.

## EAS

1. Authenticate: `eas login`
2. Link the project: `eas init` (or set `EAS_PROJECT_ID` env var).
3. Build:
   - Development client: `npm run build:dev`
   - Internal preview: `npm run build:preview`
   - Production: `npm run build:prod`
4. Submit: `npm run submit:android` / `npm run submit:ios`

## Conventions

- All screens use `SafeAreaView` from `react-native-safe-area-context`.
- Auth tokens live in `expo-secure-store` only; never in AsyncStorage.
- HTTP goes through `apiClient` so the auth interceptor and base URL are consistent.
- Server state belongs in TanStack Query; only ephemeral UI / auth state goes in Zustand.
- Use `@/` for src-relative imports.
