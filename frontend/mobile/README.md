# MedApp Mobile (Flutter)

Feature-first architecture. Each feature owns its own `data/`, `domain/`, `presentation/` slices.

```
lib/
  main.dart
  app.dart                    root widget + ProviderScope
  core/
    config/                   env, build flavors
    network/                  Dio client, interceptors (auth, retry, tracing)
    router/                   go_router config
    theme/                    Material 3 theme tokens
    utils/                    shared helpers
  features/
    auth/                     signup, login, OTP
    onboarding/               KYC, role selection
    home/                     dashboard, feed
    providers/                doctor/nurse/hospital listing + detail
    booking/                  calendar, slot, payment
    telemedicine/             call screen, chat, file share
    ehr/                      documents, vitals timeline
    ai_assistant/             chat with AI, symptom checker
    notifications/
    profile/                  view/edit, settings
    social/                   feed, posts, Q&A
  shared/
    widgets/                  reusable UI atoms
    models/                   shared DTOs
```

## State management

**Riverpod 2.x** with code generation (`@riverpod`).

## API client

Generated from `packages/openapi/*.yaml` into `lib/generated/`. Do not edit by hand.
Regenerate with `make gen-clients` from repo root.

## Running

```bash
flutter pub get
flutter run --dart-define=ENV=dev
```

## Flavors

- `dev` → local docker-compose API
- `staging` → GKE staging cluster
- `prod` → production
