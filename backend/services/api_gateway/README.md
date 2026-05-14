# API Gateway

Edge service for MedApp. Responsibilities:

- JWT verification (single point of trust)
- Routing to upstream services via path prefix (see `app/config.py::ROUTES`)
- Rate limiting (slowapi)
- Request/response tracing & request-id injection
- CORS

Upstream services run behind the gateway in K8s and are not exposed to the internet.
