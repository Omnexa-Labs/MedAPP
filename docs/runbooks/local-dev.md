# Local development

## Prereqs

- Docker Desktop (with WSL2 on Windows)
- Python 3.12 + `uv`
- Node 20 + pnpm
- Flutter 3.22+
- gcloud SDK (for cloud work, optional locally)

## First run

```bash
cp .env.example .env
make dev          # boots Postgres, Redis, RabbitMQ, all 13 services
make migrate      # apply Alembic migrations across all services
make seed         # load fixtures
```

Open:
- API gateway: http://localhost:8000
- RabbitMQ UI: http://localhost:15672 (medapp / medapp)
- Each service: http://localhost:80XX/healthz

## Mobile app

```bash
cd frontend/mobile
flutter pub get
flutter run --dart-define=ENV=dev --dart-define=API_BASE_URL=http://10.0.2.2:8000
```

`10.0.2.2` is the Android emulator's host-loopback. On iOS sim use `http://localhost:8000`.

## Troubleshooting

- **Postgres won't accept connections** — `make down && docker volume rm medapp_pgdata && make dev`.
- **Alembic "Target database is not up to date"** — run `make migrate` again; check for unmerged migration heads with `alembic heads`.
- **Flutter can't reach API** — confirm the right `API_BASE_URL` for your platform.
