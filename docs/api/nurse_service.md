# API contract — nurse service

Prefix: `/v1/nurses`. Public directory/detail reads use the existing nurse profile
contract: nurse ID, account ID, name, specialty, biography, languages, home-visit
fee in cents, photo URL, listing and active flags. Directory reads filter active
profiles and support the existing specialty/search/service-area parameters.

## Authenticated self profile — 2026-09-14

`GET /v1/nurses/me` and `PATCH /v1/nurses/me` identify the owner from the JWT
subject, independently of the nurse profile ID. They require nurse or admin
role; admins also resolve only their own profile through these endpoints.
GET returns inactive self profiles; PATCH rejects inactive records with 403.
Missing profiles return 404, invalid subjects 401, and unrelated roles 403.
Static `/me` routes precede UUID routes. Public reads still exclude inactive records.

The NurseUpdate contract accepts partial edits. Unknown fields (including role,
owner ID and active status) return 422. Supplied first/last names, languages and
listing cannot be null. Names are trimmed and bounded to 255 characters, specialty
to 255, biography to 10,000, and language labels to 20 nonempty names of at most
120 characters. Languages are trimmed/deduplicated. Optional biography and specialty
can be cleared with null. Existing home-visit fees and photo fields are retained.

The mobile professional editor saves name, specialty, biography, languages and
listing. It does not grant credentials, change clinical permissions, infer fee
currency, or send nurses into doctor bookings/schedules. Full nurse workspace,
service-area editing and fee administration remain tracked work.
