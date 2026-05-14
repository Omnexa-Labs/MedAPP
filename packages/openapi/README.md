# OpenAPI specs

Canonical specs per service. Source of truth for generated clients.

- `user_service.yaml`
- `doctor_service.yaml`
- ... (one per service)

CI fetches `/openapi.json` from each running service in staging and diffs against the
checked-in spec — breaking changes fail the build.
