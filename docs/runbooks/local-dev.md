# Local development

> **On a physical phone over USB, use [run-it-yourself.md](run-it-yourself.md) instead.** This
> file targets an emulator and assumes `make` + bash. It does not cover the `adb reverse`
> tunnels a real device needs on this network, and the office Wi-Fi has client isolation on, so
> the LAN path below simply does not work there.

## Prereqs

- Docker Desktop (with WSL2 on Windows)
- Python 3.12 + `uv`
- Node 20 + npm/pnpm
- Android Studio and Android SDK for mobile Android builds
- gcloud SDK (for cloud work, optional locally)

## First run

```bash
cp .env.example .env
make dev          # boots Postgres, Redis, RabbitMQ, and the backend services
make migrate      # apply Alembic migrations across backend services that own Alembic
make migrate SERVICE=user_service  # apply a single service migration
make up SERVICE=user_service       # start one service and its compose deps
make logs SERVICE=user_service     # tail one service's logs
make seed         # load fixtures
```

Use `make dev-all` later if you want the Claude agents too.

Open:
- API gateway: http://localhost:8000
- RabbitMQ UI: http://localhost:15672 (medapp / medapp)
- Each service: http://localhost:80XX/healthz

## Mobile app

```bash
cd frontend/mobile/MedAPP
npm install
APP_ENV=dev API_BASE_URL=http://10.0.2.2:8000 npm run android
```

`10.0.2.2` is the Android emulator's host-loopback. On iOS sim use `http://localhost:8000`.

**The variable names above were wrong until 2026-08-05** — this file said
`EXPO_PUBLIC_APP_ENV` / `EXPO_PUBLIC_API_BASE_URL`, and nothing reads those.
`app.config.ts:41` reads `process.env.API_BASE_URL` and passes it through
`extra.apiBaseUrl`; the `EXPO_PUBLIC_` spelling was silently ignored, leaving the app on
its built-in default. Harmless on an emulator, where the default happens to be right —
which is exactly why it went unnoticed — and fatal on a real device.

Note also that `API_BASE_URL` is read when `app.config.ts` is evaluated, i.e. at Metro
startup. Reloading the app will not pick up a new value; restart Metro.

## Troubleshooting

- **Postgres won't accept connections** — `make down && docker volume rm medapp_pgdata && make dev`.
- **Alembic "Target database is not up to date"** — run `make migrate` again; check for unmerged migration heads with `uv run alembic heads` inside the service directory.
- **Mobile app can't reach API** — confirm the right `EXPO_PUBLIC_API_BASE_URL` for your platform.
