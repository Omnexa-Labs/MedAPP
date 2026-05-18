# Analytics Service

Port 8012. Owns event ingestion and admin analytics dashboards.

Primary endpoints:
- `POST /v1/internal/events`
- `GET /v1/admin/metrics/funnel`
- `GET /v1/admin/metrics/retention`
- `GET /v1/admin/doctors/{id}/scorecard`

See `backend/README.md` for layout conventions.
