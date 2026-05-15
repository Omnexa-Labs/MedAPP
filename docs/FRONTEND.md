# MedApp — Frontend Handbook

For the frontend engineer joining the project. Read this top-to-bottom on
day one, then use it as a reference.

If you only have 5 minutes: jump to [§2 Get started](#2-get-started). If you
only have 30 seconds: clone the repo, `cd frontend/mobile`, `flutter pub get`,
`flutter run`. Done.

---

## 1. What you're building

**MedApp** is a mobile-first healthcare platform — patients booking doctors,
joining telemedicine sessions, uploading lab results; and talking to an AI
concierge. Your surface is the Flutter mobile app (iOS + Android, with web as
a stretch target).

The product is described in detail in [`docs/PROJECT.md`](PROJECT.md). The
short version: you are building the entire role-based user experience, plus the
in-app surfaces for doctors, nurses, and hospital admins (same binary, role-
adaptive UI).

### What's already done
- Project scaffold, navigation shell, splash + login + 4 tabs (Home, Find
  care, Chat, Profile).
- Riverpod auth state, secure token storage, Dio HTTP client with auth
  interceptor.
- Mock mode (`USE_MOCK_API=true`) so you can build UI without any backend.
- 2 passing tests, `flutter analyze` clean.
- `android/`, `ios/`, `web/` platform folders generated and committed.

### What's NOT done — your job
- Real screens for everything: signup, KYC, provider search/filters, provider
  detail, booking flow (slot picker → confirmation → payment), telemedicine
  call screen, EHR / documents viewer, vitals timeline, lab upload, settings.
- Localization (target languages: EN, FR, Twi, Swahili).
- Push notifications (FCM).
- Deep linking (handle `medapp://booking/{id}`).
- Biometric unlock (face/touch ID) for sensitive screens.
- Real network integration: as backend services come online, swap mocks for
  real repositories.

---

## 2. Get started

### Prerequisites
- **Flutter 3.24+ stable** — install from https://docs.flutter.dev/get-started/install
- **Android Studio** with the Android SDK (for Android builds)
- **Xcode 15+** (macOS only, for iOS builds)
- Optional: VS Code with the Dart + Flutter extensions, or Android Studio itself

Verify your setup:

```bash
flutter doctor
```

You want green checkmarks on Flutter, Dart, Android toolchain, and (if on
macOS) Xcode. Yellow warnings about Chrome / connected devices are fine.

### Clone & run

```bash
git clone https://github.com/Omnexa-Labs/MedAPP.git
cd MedAPP/frontend/mobile
flutter pub get
flutter run
```

You'll get a device chooser. Pick an Android emulator, iOS simulator, or
Chrome. The app boots to a login screen with prefilled demo credentials —
hit Sign in.

### Modes

We have three modes, controlled by `--dart-define` flags:

```bash
# 1. MOCK MODE (default) — canned data, no backend needed
flutter run

# 2. LIVE BACKEND — Android emulator → host machine
flutter run \
  --dart-define=USE_MOCK_API=false \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000

# 3. LIVE BACKEND — iOS simulator
flutter run \
  --dart-define=USE_MOCK_API=false \
  --dart-define=API_BASE_URL=http://localhost:8000

# Physical Android device on the same LAN
flutter run \
  --dart-define=USE_MOCK_API=false \
  --dart-define=API_BASE_URL=http://<your-laptop-ip>:8000
```

To use mode 2 or 3 you need the backend running. From the repo root:
`make dev` boots Postgres, Redis, RabbitMQ, and the backend services in Docker.
Use `make dev-all` later if you also need the Claude agents.

**Start in mock mode.** Use live mode only when you specifically need to
integrate with a real endpoint.

---

## 3. The current approach (what's there and why)

### 3.1 Project structure

```
frontend/mobile/
├── lib/
│   ├── main.dart                      App entry point — runApp(ProviderScope(MedApp))
│   ├── app.dart                       Root widget — MaterialApp.router + theme
│   │
│   ├── core/                          Cross-cutting infrastructure
│   │   ├── config/env.dart            --dart-define-driven config
│   │   ├── network/api_client.dart    Dio instance + auth interceptor
│   │   ├── router/app_router.dart     go_router config + auth-aware redirects
│   │   ├── storage/token_storage.dart Secure (Keychain/Keystore) + Prefs fallback
│   │   └── theme/app_theme.dart       Material 3 theme (light + dark)
│   │
│   ├── features/                      Feature-first; each feature owns its slices
│   │   ├── auth/
│   │   │   ├── data/auth_repository.dart        HTTP + Mock impls
│   │   │   ├── domain/auth_user.dart            Plain model
│   │   │   └── presentation/
│   │   │       ├── auth_controller.dart         AsyncNotifier<AuthState>
│   │   │       ├── login_screen.dart
│   │   │       └── splash_screen.dart
│   │   ├── home/presentation/home_screen.dart
│   │   ├── providers/presentation/providers_screen.dart
│   │   ├── chat/presentation/chat_screen.dart
│   │   └── profile/presentation/profile_screen.dart
│   │
│   └── shared/                        Reusable widgets / models across features
│
├── test/                              Widget + unit tests
├── android/, ios/, web/               Platform projects (committed)
├── pubspec.yaml                       Dependencies
└── analysis_options.yaml              Lint rules
```

### 3.2 Architecture choices (and why each one)

**Feature-first, not layer-first.** Each feature folder (`auth/`, `booking/`,
`chat/`) owns its `data/`, `domain/`, `presentation/` slices. Why: feature
deletes are clean; new engineers find code by what it does, not by what
pattern it follows.

**Riverpod for state management.** Specifically `flutter_riverpod` 2.x with
`AsyncNotifier`. Why: testable without widget trees, type-safe, plays well
with dependency injection, no "BuildContext required" surprises. We deliberately
avoid the `@riverpod` codegen for now to keep the build pipeline simple — add it
later if hand-written providers become painful.

**Repository pattern with mock + http implementations.**
`AuthRepository` is an abstract class; `_HttpAuthRepository` and
`_MockAuthRepository` both implement it; the provider picks based on
`Env.useMockApi`. Why: you can build features without ever booting the
backend, and CI runs in mock mode for fast feedback.

**Sealed auth state.** `AuthState` is `sealed class` with three subtypes
(`AuthLoading | Authenticated | Unauthenticated`). The router watches it and
redirects accordingly — no manual `Navigator.push` from auth callbacks.
Why: one source of truth, exhaustive pattern matching, no "are we logged
in?" race conditions.

**`go_router` for routing.** Declarative, deep-link friendly, plays nicely
with Riverpod via `refreshListenable`. The router lives in
`core/router/app_router.dart` and currently has 4 main tabs plus splash and
login. To add a screen, add a `GoRoute` there.

**Dio + auth interceptor.** A single interceptor attaches `Bearer <token>`
from `TokenStorage` on every outbound request. Why: no per-call boilerplate;
401 responses can centrally trigger a logout via the auth notifier.

**Secure token storage.** `flutter_secure_storage` on mobile (Keychain on
iOS, EncryptedSharedPreferences on Android). Falls back to
`SharedPreferences` on web and in tests where secure storage isn't available.

**Theme.** Material 3 with a single seed color (`#0E7C66` — a muted teal).
Light + dark themes flip with system. Don't hardcode colors; pull from
`Theme.of(context).colorScheme`.

### 3.3 Conventions

- **Files**: `snake_case.dart`. Widget classes: `PascalCase`. Members:
  `camelCase`. No leading underscores for public API, leading underscore for
  private.
- **`const` everywhere** widgets allow it. The linter enforces this.
- **One widget per file** for screens. Small private widgets can live in the
  same file as the parent screen.
- **No `print()`** — use `debugPrint`, or proper logging (see §5).
- **Trailing commas** in widget trees. Auto-formats correctly and makes diffs
  cleaner.
- **Imports**: package imports first, then relative imports. `dart format`
  takes care of order within those groups.
- **Tests**: every feature gets at least one widget test for the happy path.
  Reference: `test/features/login_test.dart`.

---

## 4. How to add stuff

### 4.1 Add a screen

1. **Create the file** under `lib/features/<feature>/presentation/<name>_screen.dart`.
2. **Register a route** in `lib/core/router/app_router.dart`:
   ```dart
   GoRoute(path: '/bookings/:id', builder: (_, state) => BookingDetailScreen(id: state.pathParameters['id']!)),
   ```
3. **Navigate to it** from anywhere: `context.go('/bookings/abc')`.

### 4.2 Add a feature that talks to the backend

Take `features/auth/` as the template:

1. `domain/<model>.dart` — plain Dart class. Add a `fromJson` factory.
2. `data/<feature>_repository.dart` — abstract `Repository` class + two impls:
   - `_Http<Feature>Repository` (real Dio calls)
   - `_Mock<Feature>Repository` (canned data, `Future.delayed` for realism)
   - A `Provider<Repository>` that picks based on `Env.useMockApi`.
3. `presentation/<feature>_controller.dart` — `AsyncNotifier<State>` if the
   feature has multi-state UI; just a `FutureProvider` if it's a one-shot
   fetch.
4. `presentation/<screen>.dart` — `ConsumerWidget` or `ConsumerStatefulWidget`.

### 4.3 Add a dependency

```bash
flutter pub add <package_name>
```

Edit `pubspec.yaml` directly only when you need version constraints. Run
`flutter pub get` after.

### 4.4 Add localization (when we get there)

We'll use `flutter_localizations` + ARB files. Not wired yet — when we add
multilingual, the ARB files will live in `lib/l10n/` and we'll codegen via
`flutter gen-l10n`.

### 4.5 Add a test

```dart
testWidgets('booking confirmation shows total', (tester) async {
  await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: BookingConfirmScreen())));
  expect(find.text(r'$45'), findsOneWidget);
});
```

Run: `flutter test`.

---

## 5. Things I want you to know

### Don't do these
- ❌ **Don't bypass the repository pattern.** Calling Dio directly from a
  widget makes the screen un-testable.
- ❌ **Don't put logic in widgets.** If you're tempted to write business
  logic in `build()`, move it to a notifier.
- ❌ **Don't commit `.env`-like things** (API keys, tokens) — there's no
  good reason to embed secrets in a mobile binary anyway; they belong on the
  backend.
- ❌ **Don't disable the lints** in `analysis_options.yaml`. If a lint
  bothers you, discuss it.
- ❌ **Don't add `setState` to a `ConsumerWidget`** — convert to
  `ConsumerStatefulWidget` or move state into a notifier.

### Do these
- ✅ **Run `flutter analyze` before pushing.** CI runs it; failing PRs are
  the worst kind of feedback loop.
- ✅ **Use mock mode for everything that doesn't strictly need the
  backend.** It's 10× faster.
- ✅ **When in doubt about a tradeoff, ask in the PR.** Architectural
  decisions get recorded as ADRs in `docs/adr/`.
- ✅ **Read the matching backend service's README** when wiring up real
  endpoints. The OpenAPI spec is at `http://localhost:80XX/docs` for each
  service.

### Performance heuristics
- Lists with > 50 items: use `ListView.builder`, not `ListView`.
- Network images: `cached_network_image`, never raw `NetworkImage`.
- Avoid rebuilding the entire screen on small state changes: use
  `Consumer` widgets to scope rebuilds.
- Don't ship debug `print()`s — they tank performance in release mode.

### PHI / privacy
The mobile app handles **protected health information**. Things to remember:
- Never log PHI. Use `debugPrint` for development only, and redact patient
  IDs / lab values / etc. before logging.
- Never cache PHI to a non-secure store. `flutter_secure_storage` is fine;
  `shared_preferences` is not.
- When we add Sentry/crash reporting, scrub PII from breadcrumbs and stack
  traces.

---

## 6. The 12-week feature roadmap (what you'll likely work on, in order)

Rough sequence — pick up the next available, talk to backend about
endpoint readiness:

### Weeks 1–2: Auth + onboarding
- [ ] Signup (email/password)
- [ ] Phone OTP signup
- [ ] Forgot password
- [ ] Profile completion / KYC for non-patient roles
- [ ] Localized onboarding screens

### Weeks 3–4: Marketplace discovery
- [ ] Provider search with filters (specialty, geo, rating, price)
- [ ] Provider detail screen (doctor, nurse, hospital — different layouts)
- [ ] Reviews list
- [ ] Saved / followed providers

### Weeks 5–6: Booking
- [ ] Availability calendar (slot picker)
- [ ] Booking confirmation
- [ ] Payment integration (Stripe + M-Pesa)
- [ ] Booking list (upcoming, past, cancelled)
- [ ] Cancel / reschedule

### Weeks 7–8: Telemedicine
- [ ] Pre-call lobby (camera/mic check)
- [ ] WebRTC call screen (chat + file share + screen share for patient uploads)
- [ ] Post-call summary
- [ ] Prescription PDF viewer

### Weeks 9–10: EHR + AI
- [ ] Documents viewer (PDF, images)
- [ ] Upload labs / prescriptions
- [ ] Concierge chat (wire to `/agents/concierge`)
- [ ] Symptom checker chat (wire to `/agents/chat`)

### Weeks 11–12: Polish + launch prep
- [ ] Push notifications (FCM)
- [ ] Deep links
- [ ] Biometric unlock
- [ ] Sentry integration
- [ ] App Store / Play Store submission

---

## 7. Reference

### Useful commands

```bash
flutter pub get                  # resolve dependencies
flutter pub upgrade --major-versions   # upgrade deps
flutter pub outdated             # see what's stale

flutter run                      # debug mode (hot reload available)
flutter run --release            # release mode (test real perf)

flutter test                     # run tests
flutter test test/features/      # run a directory of tests
flutter test --coverage          # generate coverage/lcov.info

flutter analyze                  # static analysis (must pass CI)
dart format lib test             # format code

flutter clean                    # nuke build artifacts (rarely needed)
flutter doctor -v                # diagnose toolchain issues
```

### Dependencies (`pubspec.yaml`)

| Package | What it does |
|---|---|
| `flutter_riverpod` | State management |
| `go_router` | Declarative routing |
| `dio` | HTTP client |
| `flutter_secure_storage` | Keychain / Keystore |
| `shared_preferences` | Fallback storage on web |
| `intl` | Date / number formatting |
| `cached_network_image` | Network image with disk cache |
| `cupertino_icons` | iOS-style icons |
| `mocktail` (dev) | Mocking in tests |
| `flutter_lints` (dev) | Lint ruleset |

When adding to this list, ask: is there a smaller dependency that does the
job? Mobile app size matters.

### Files you'll touch most often

| File | When |
|---|---|
| `lib/core/router/app_router.dart` | Every new screen |
| `lib/core/theme/app_theme.dart` | When styling needs a new tweak |
| `pubspec.yaml` | New dependency |
| `lib/features/<feature>/data/<feature>_repository.dart` | New backend call |

### Where to look for help

| Question | Where |
|---|---|
| "What is this product?" | [`docs/PROJECT.md`](PROJECT.md) |
| "How does the backend work?" | [`docs/architecture/overview.md`](architecture/overview.md) and `backend/README.md` |
| "What endpoints exist?" | `http://localhost:80XX/docs` (Swagger UI) for each backend service |
| "How do agents work?" | `agents/README.md` |
| "What's the data model?" | Read `backend/services/*/app/models/` — each service owns its tables |
| "Flutter docs" | https://docs.flutter.dev |
| "Riverpod docs" | https://riverpod.dev |
| "go_router docs" | https://pub.dev/packages/go_router |

### Glossary

- **PHI** — Protected Health Information. Anything that identifies a patient
  + their health data. Encrypted, audited, never logged.
- **EHR** — Electronic Health Record. The patient's medical history.
- **MockLLM** — Deterministic stand-in for an LLM, used until we pick a
  provider. Lives in `agents/shared/llm.py`.
- **Agent** — A FastAPI service that orchestrates an LLM + tools (HTTP calls
  to backend services).
- **`USE_MOCK_API`** — Dart-define flag that swaps real Dio calls for canned
  in-memory responses. Default `true`.

---

## 8. Closing notes

You'll be reading and rewriting parts of this document as the product
evolves. Treat it as living; PR changes when they're useful for the next
person.

If something is unclear or feels wrong: open a discussion / PR / issue — the
worst kind of frontend codebase is one where the conventions live only in
people's heads.
