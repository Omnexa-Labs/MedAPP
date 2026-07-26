# API conventions

- **Versioning**: every service exposes `/v1/...`. Bump path on breaking change.
- **Errors**: JSON body `{code, message, details}` (see `shared.schemas.ErrorResponse`).
- **Pagination**: `?page=1&size=20`, responses use `Page<T>` (items/total/page/size).
- **Auth**: `Authorization: Bearer <JWT>`. Gateway injects `X-User-Id`, `X-User-Role` for downstream services.
- **Idempotency**: POSTs that mutate require `Idempotency-Key` header; service stores `(key, response)` for 24h.
- **Tracing**: clients pass `traceparent` (W3C). The gateway generates one if missing.
- **OpenAPI**: each service publishes `/openapi.json`. The canonical specs live in `packages/openapi/` and are used to generate TypeScript clients.

## API contract

See [backend API contract](backend-contract.md) for the frontend-facing service-by-service endpoint map and short descriptions.
