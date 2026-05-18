# Nurse Service

Port 8003. Owns nurse profiles, home-visit service areas, and visit pricing.

Primary endpoints:
- `POST /v1/nurses`
- `GET /v1/nurses`
- `GET /v1/nurses/{id}`
- `PATCH /v1/nurses/{id}`
- `POST /v1/nurses/{id}/service_area`
- `POST /v1/nurses/{id}/home_visit_fee`

See `backend/README.md` for layout conventions.
