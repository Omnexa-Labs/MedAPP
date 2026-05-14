# MedApp Mobile (Flutter)

Cross-platform mobile app for patients, nurses, doctors, and hospital admins.

## Clone & run (frontend engineer's quick start)

```bash
git clone https://github.com/Omnexa-Labs/MedAPP.git
cd MedAPP/frontend/mobile
flutter pub get
flutter run                                # uses mock API, no backend needed
```

That's it. The app boots into the login screen. Use the pre-filled credentials
(`demo@medapp.test` / `demo1234`) — anything with a valid email and 4+ char
password is accepted in mock mode.

### Run against a live backend

```bash
# Android emulator → host machine
flutter run \
  --dart-define=USE_MOCK_API=false \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000

# iOS simulator
flutter run \
  --dart-define=USE_MOCK_API=false \
  --dart-define=API_BASE_URL=http://localhost:8000

# Physical device on the same LAN
flutter run \
  --dart-define=USE_MOCK_API=false \
  --dart-define=API_BASE_URL=http://<your-laptop-ip>:8000
```

Boot the backend stack from the repo root: `make dev`.

## Architecture

Feature-first. Each feature owns its own `data/`, `domain/`, `presentation/`.

```
lib/
  main.dart                       entry point
  app.dart                        MaterialApp.router root
  core/
    config/env.dart               build-time config (--dart-define)
    network/api_client.dart       Dio + auth interceptor
    router/app_router.dart        go_router + auth-aware redirects
    storage/token_storage.dart    secure (mobile) / prefs (web) token store
    theme/app_theme.dart          Material 3 theme
  features/
    auth/                         signup, login, splash, auth state
    home/                         dashboard
    providers/                    doctor/nurse/hospital listings
    chat/                         concierge agent UI
    profile/                      view/edit, logout
```

**State management**: Riverpod 2.x (`flutter_riverpod`). Auth state is an
`AsyncNotifier<AuthState>` (`Authenticated | Unauthenticated | AuthLoading`).
The router watches it and redirects accordingly — there's no manual nav from
auth callbacks.

**Networking**: Dio with a single interceptor that attaches `Bearer <token>`
from `TokenStorage`. Repositories pick between `_HttpAuthRepository` and
`_MockAuthRepository` based on `Env.useMockApi`.

**Mock mode**: `USE_MOCK_API=true` (the default) replaces repositories with
in-memory canned-data versions. This lets the frontend team build UI without
ever booting the backend or signing up for any third-party service.

## Tests

```bash
flutter test
```

Two tests ship:
- `widget_test.dart` — app boots without throwing
- `features/login_test.dart` — login form validation

## Adding a screen

1. Create `lib/features/<feature>/presentation/<screen>.dart`
2. Register a route in `lib/core/router/app_router.dart`
3. If it needs data: add `data/<feature>_repository.dart` (provide HTTP + mock impls behind a `Provider`)

## Flavors

Set with `--dart-define=ENV=<name>`:

- `dev` — local docker-compose backend (mock by default)
- `staging` — staging cluster
- `prod` — production

## Known gaps

- No code generation (`build_runner`) is wired up yet. When we add typed
  network models, add `freezed` + `json_serializable` and a `dart run build_runner watch` step.
- Push notifications, deep linking, and biometric auth are not wired.
- Real telemedicine call screen is a placeholder — `flutter_webrtc` integration
  is intentionally deferred until backend signaling is ready.
