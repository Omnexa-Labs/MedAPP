# Local development

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
EXPO_PUBLIC_APP_ENV=dev EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000 npm run android
```

`10.0.2.2` is the Android emulator's host-loopback. On iOS sim use `http://localhost:8000`.

## Troubleshooting

- **Postgres won't accept connections** — `make down && docker volume rm medapp_pgdata && make dev`.
- **Alembic "Target database is not up to date"** — run `make migrate` again; check for unmerged migration heads with `uv run alembic heads` inside the service directory.
- **Mobile app can't reach API** — confirm the right `EXPO_PUBLIC_API_BASE_URL` for your platform.
