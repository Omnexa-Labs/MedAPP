# MedApp Backend

13 FastAPI microservices + a `shared/` library used by all of them.

## Service template

Each service follows the same layout:

```
services/<name>/
  app/
    __init__.py
    main.py            FastAPI app factory + lifespan
    config.py          pydantic-settings, env-driven
    deps.py            DI: db session, current_user, etc.
    models/            SQLAlchemy ORM
    schemas/           Pydantic request/response
    routers/           HTTP routers, one file per resource
    services/          business logic (no FastAPI imports)
    events/            event publishers/consumers (RabbitMQ)
    db.py              engine + sessionmaker
  alembic/             migrations
  alembic.ini
  tests/
  Dockerfile
  pyproject.toml
```

## Shared library (`backend/shared/`)

- `auth/` — JWT verification, RBAC dependencies (used by every service)
- `db/` — async SQLAlchemy base, session helpers, pagination
- `events/` — AMQP publisher/consumer, event schemas (CloudEvents)
- `observability/` — OpenTelemetry init, structured logging, request-id middleware
- `schemas/` — common Pydantic types (Money, GeoPoint, PageQuery, ErrorResponse)
- `clients/` — typed HTTP clients for cross-service calls

## Running a single service

```bash
make up SERVICE=user_service
make logs SERVICE=user_service
```

## Migrations

Each service owns its own database schema. Run migrations per-service:

```bash
make migrate SERVICE=user_service
```

Or all at once: `make migrate` from repo root.
