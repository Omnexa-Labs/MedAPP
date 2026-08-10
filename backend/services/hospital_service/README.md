# Hospital Service

Port 8004. Owns hospital profiles, staff rosters, and public reviews.

Primary endpoints:
- `POST /v1/hospitals` — hospital_admin / platform_admin
- `GET /v1/hospitals` — public
- `GET /v1/hospitals/{id}` — public
- `POST /v1/hospitals/{id}/staff` — hospital_admin / platform_admin
- `GET /v1/hospitals/{id}/staff` — **any authenticated caller** (not public)
- `GET /v1/hospitals/{id}/reviews` — public

The staff roster is the one read on this router that requires a token, because
it returns a list of people rather than facts about an institution. It carries
**no names and no photos**: this service stores only a `user_id` per staff
member, and it says so in-band via `names_available` /
`names_unavailable_reason` so clients render role, title and department instead
of an "unpublished" empty state. `user_id` itself is returned only to
hospital_admin / platform_admin (`includes_user_ids`). Inactive staff are never
returned, for anyone. Reasoning in `app/services/hospital_service.py::list_staff`.

See `backend/README.md` for layout conventions.
