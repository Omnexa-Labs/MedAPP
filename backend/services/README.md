# Service structure standard

Every backend service should grow inside the same internal layering pattern so
the codebase stays predictable.

## Required folders

```text
backend/services/<name>/
  app/
    main.py
    config.py
    deps.py
    db.py
    models/
    schemas/
    routers/
    services/
    events/
  alembic/
  tests/
  Dockerfile
  pyproject.toml
```

## Dependency direction

- `routers` depend on `schemas`, `deps`, and `services`.
- `services` depend on `models`, `db`, shared clients, and event helpers.
- `models` never import routers.
- `schemas` stay as pure request/response contracts.
- `deps` expose common per-request objects like sessions and current user.

## Why this matters

This keeps `auth_service.py`, `kyc_service.py`, and similar module names clearly
inside a microservice, instead of making them look like separate systems. It
also keeps new services easy to extend because every service starts with the
same mental model.
