# Lab Service

Port 8009. Owns lab orders, uploaded results, and patient result access.

Primary endpoints:
- `POST /v1/lab/orders`
- `POST /v1/lab/results/upload`
- `GET /v1/lab/results/{id}`
- `GET /v1/me/lab/results`

See `backend/README.md` for layout conventions.
