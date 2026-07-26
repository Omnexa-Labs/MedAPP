# MedApp Frontend Handbook

For the frontend engineer joining the project. Read this once, then use it as
a reference.

If you only have 30 seconds:

```bash
cd frontend/mobile/MedAPP
npm install
npm run start
```

## 1. What You're Building

MedApp is a mobile-first healthcare platform for booking care, joining
telemedicine sessions, managing health records, uploading lab results, and
using the AI concierge. The mobile surface is a React Native app built with
Expo. It targets iOS, Android, and web from the same TypeScript codebase.

The app is role-aware. The same binary adapts for users, doctors, nurses,
hospital partners, pharmacy partners, and platform flows as those features
come online.

The product is described in detail in [PROJECT.md](PROJECT.md).

## 2. Current Stack

| Layer | Choice |
|---|---|
| Runtime | React Native 0.83 |
| App platform | Expo SDK 55 |
| Language | TypeScript |
| Routing | Expo Router |
| Server state | TanStack Query |
| Local state | Zustand |
| Forms | React Hook Form + Zod |
| Secure storage | expo-secure-store |
| Styling | NativeWind + Tailwind tokens |
| Tests | Jest + jest-expo + React Native Testing Library |
| Formatting | Prettier + prettier-plugin-tailwindcss |

## 3. Get Started

Prerequisites:

- Node 20+
- npm, or pnpm if you prefer it locally
- Android Studio and Android SDK for Android builds
- Xcode on macOS for iOS builds
- Expo/EAS tooling as needed for device builds

Run the app:

```bash
cd frontend/mobile/MedAPP
npm install
npm run start
```

Useful targets:

```bash
npm run android       # Expo Android build/run
npm run ios           # Expo iOS build/run, macOS only
npm run web           # Expo web
npm test              # Jest
npm run lint          # Expo lint
npm run format        # Prettier write
npm run format:check  # Prettier check
```

To connect to a local backend, set the API base URL before starting Expo:

```bash
# Android emulator -> host machine
EXPO_PUBLIC_APP_ENV=dev EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000 npm run android

# iOS simulator or web
EXPO_PUBLIC_APP_ENV=dev EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 npm run ios
```

On a physical device, use your laptop's LAN IP instead of `localhost`.

## 4. Project Structure

```text
frontend/mobile/MedAPP/
├── src/
│   ├── app/                 Expo Router routes and layouts only
│   ├── components/          Shared UI components
│   ├── features/            Feature modules
│   ├── lib/                 API, config, storage, utilities
│   ├── store/               Zustand stores
│   └── types/               Shared TypeScript types
├── assets/                  Images, fonts, Expo assets
├── app.config.ts            Expo config
├── babel.config.js          Expo + NativeWind Babel config
├── metro.config.js          Metro + NativeWind config
├── jest.config.js           Jest Expo config
└── package.json             Scripts and dependencies
```

Keep `src/app/` thin. Route files should parse route params, call hooks, and
compose feature components. Business logic belongs in `features/`, `lib/`, or
stores.

## 5. Conventions

- Use TypeScript for app code.
- Route files use Expo Router's URL-friendly naming, for example
  `sign-in.tsx`.
- Hooks are named `use-thing.ts` and exported as `useThing`.
- Zustand stores are named `thing-store.ts` and exported as `useThingStore`.
- Storage-specific imports stay behind `src/lib/storage/` or store modules.
- Do not log PHI. Redact identifiers, lab values, and clinical details before
  any development logging.
- Do not commit secrets. Mobile environment values are not a secure place for
  private keys.

## 6. Common Workflows

Add a screen:

1. Create the route under `src/app/`.
2. Put reusable UI and logic under the matching feature folder.
3. Keep route files focused on routing and composition.

Add a backend call:

1. Check the matching backend service and OpenAPI docs.
2. Add or update the API wrapper in `src/lib/` or the feature data module.
3. Use TanStack Query for server state.
4. Keep local UI/session state in Zustand only when it is not server-owned.

Add a dependency:

```bash
npm install <package>
```

Prefer Expo-compatible packages and check native build implications before
adding libraries that require config plugins or custom native setup.

## 7. Privacy And Safety

The app handles protected health information. Treat logs, analytics, crash
reports, screenshots, and local caches as sensitive surfaces.

- Store tokens only in secure storage.
- Do not persist PHI in AsyncStorage unless the data has been explicitly
  classified as safe for that store.
- Scrub breadcrumbs and metadata before adding crash reporting.
- Prefer backend-mediated workflows for anything involving identity,
  permissions, payments, or clinical data.

## 8. Where To Look

| Question | Where |
|---|---|
| Product scope | [PROJECT.md](PROJECT.md) |
| Backend architecture | [architecture/overview.md](architecture/overview.md) |
| Local backend setup | [runbooks/local-dev.md](runbooks/local-dev.md) |
| Mobile source guide | `frontend/mobile/MedAPP/src/README.md` |
| Expo project notes | `frontend/mobile/MedAPP/AGENTS.md` |
| Agent services | `agents/README.md` |
