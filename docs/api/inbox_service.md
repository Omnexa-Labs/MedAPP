# API contract — `inbox_service`

**Base prefix:** `/v1/threads` · **Source of truth:** `backend/services/inbox_service/app/schemas/thread.py`
· **Client:** `frontend/mobile/MedAPP/src/features/chat/api.ts`

> **No new endpoints were created for this wiring.** Per the CTO's rule — create endpoints *only if
> they don't exist* — every route below already shipped. The frontend was on seed data because
> `docs/PIPELINE.md` wrongly recorded "no messaging endpoints", not because anything was missing.
> See §5u.

---

## Routes

| Method | Path | Body | Returns | Status |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/threads` | `ThreadCreate` | `ThreadOut` | 201 |
| `GET` | `/v1/threads` | — | `ThreadList` | 200 |
| `GET` | `/v1/threads/{thread_id}` | — | `ThreadOut` | 200 |
| `GET` | `/v1/threads/{thread_id}/messages` | — | `ThreadMessageOut[]` | 200 |
| `POST` | `/v1/threads/{thread_id}/messages` | `ThreadMessageCreate` | `ThreadMessageOut` | 200 |
| `POST` | `/v1/threads/{thread_id}/read` | — | `ThreadParticipantOut` | 200 |
| `POST` | `/v1/threads/handoff` | `HandoffCreate` | `ThreadOut` | 201 |

All routes take `CurrentPrincipalDep` — authenticated, and scoped to the caller. `GET /v1/threads`
needs no user filter param; the principal *is* the filter.

**Envelope is inconsistent, deliberately noted:** the thread list returns `{ items: [...] }`
(`ThreadList`), but the message list returns a **bare array**. The client handles both; don't
"fix" one to match the other without changing the schema.

---

## Schemas

### `ThreadOut`
| Field | Type | Notes |
| --- | --- | --- |
| `thread_id` | UUID | |
| `subject` | str | The only human-readable label a thread has. |
| `source` | str | e.g. `direct`. Default `direct`, max 32. |
| `status` | `open` \| `pending` \| `closed` | |
| `created_by_user_id` | UUID | |
| `assigned_role` | str \| null | Set when a thread is owned by a role queue. |
| `assigned_user_id` | UUID \| null | |
| `booking_id` | UUID \| null | Links a thread to an appointment. |
| `last_message_at` | datetime \| null | **Null = no messages yet.** Sort these LAST. |

### `ThreadMessageOut`
| Field | Type | Notes |
| --- | --- | --- |
| `message_id` | UUID | |
| `thread_id` | UUID | |
| `sender_user_id` | UUID \| null | Null for system/automated senders. |
| `sender_role` | str | |
| `body` | str | |
| `is_internal` | bool | **Clinician-only note. MUST NOT render in a patient thread.** |
| `created_at` | datetime | |

### `ThreadParticipantOut`
`participant_id`, `thread_id`, `user_id`, `role`, `joined_at` (nullable), `last_read_at`
(nullable), `is_active`.

### Request bodies
- **`ThreadCreate`** — `subject` (1–255, required), `source` (≤32, default `direct`),
  `participant_user_ids: UUID[]`, `participant_roles: str[]`, `assigned_role` (≤32, nullable),
  `booking_id` (nullable).
- **`ThreadMessageCreate`** — `body` only, 1–4000 chars. **Text only; no attachment field.**
- **`HandoffCreate`** — `user_id`, `assigned_role`, `subject` (1–255), `summary` (1–2000),
  `booking_id` (nullable), `locale` (≤8, default `en`). This is the AI → human escalation path.

---

## Gaps the UI has to absorb

These are **not** bugs in the client; they are things the contract does not carry. Each one is a
feature the Figma frames draw:

| Frame element | Why it can't be sourced | Current handling |
| --- | --- | --- |
| Inbox row **message preview** | `ThreadOut` has `last_message_at` but no preview text. A preview per row = a `GET /messages` per row (N+1 on every paint). | Row shows `source`. |
| Inbox row **unread count** | Not on the wire. Derivable server-side from `last_read_at`, not exposed. | Omitted. |
| Inbox row **avatar / counterparty name** | `ThreadOut` names no counterparty — only `assigned_role` / `assigned_user_id`, with no display name or photo. | Row shows `subject`. |
| **"3 online now"** presence | `is_active` is membership, not connectivity. | Seeded. |
| **"X joined the shift"** events | Participants have `joined_at`; there is no event stream. | Seeded. |
| **Delivery receipts** (double tick) | `last_read_at` gives READ, not delivered. | Seeded. |
| **Attachments** | `ThreadMessageCreate` is `{ body }`. No upload endpoint exists anywhere in the product. | Device-local only, never uploaded. |

### Proposed additions — backend work, not yet agreed
Adding these three to `ThreadOut` would remove the first three rows above and needs no new route:

```python
last_message_preview: str | None   # truncated body of the latest message
unread_count: int                  # derived from the caller's last_read_at
counterparty: ParticipantSummary | None   # display name + avatar for a 1:1
```

Member **count** is already derivable from participants and could join them. Presence, join events,
delivery receipts and attachments each need genuinely new capability and should be scoped
separately.

---

## Client mapping

`src/features/chat/api.ts` converts snake_case wire → camelCase domain, following the
`appointments/api.ts` convention:

`thread_id → id`, `last_message_at → lastMessageAtIso`, `message_id → id`,
`is_internal → isInternal`, `participant_id → id`.

`isInternal` is **surfaced, not filtered**, so a patient-facing caller has to exclude
clinician-only notes explicitly rather than inherit the decision silently.

## Wiring status

| Screen | State |
| --- | --- |
| `InboxScreen` | **Wired** — `GET /v1/threads` via `useQuery(["threads"])`, with loading, retryable error and empty states. Passes the real `threadId` onward. |
| `ChatThreadScreen` | **Wired** — `GET /{id}/messages`, `POST /{id}/messages`, `POST /{id}/read`, when a `threadId` is supplied. Falls back to seed when it is not, so untouched callers keep working. |
| `PractitionerChatScreen` | Seeded. Same migration; also needs the group gaps above. |
| `AiAssistantScreen` | Not wired. `POST /v1/threads/handoff` is its escalation path. |

---

## Thread wiring notes (`ChatThreadScreen`)

**The query is `enabled: Boolean(threadId)`.** Only `InboxScreen` pushes a real id today.
`PractitionerChatScreen` and the profile "Message" button do not, so they keep the seeded path and
fire no request for a thread that does not exist. That is what allows this service to be migrated
one caller at a time.

**`is_internal` is excluded by default.** `showInternalNotes` must be passed explicitly. A
clinician-only note leaking into the patient's own thread is a privacy incident, not a cosmetic
bug, so the safe value is the default and the caller has to opt out of it.

**Direction resolves against the signed-in user id, not a role string.** A clinician reading a
clinician's thread must still see their own messages on the outgoing side.

**No delivery ticks on live messages.** The seeded path sets `delivered: true` as a local-demo
convention; the wire reports READ (`last_read_at`), never "delivered", so rendering a tick from a
live message would invent a guarantee about someone's medical conversation.

**Send refetches rather than trusting the optimistic row.** The server assigns the id and
timestamp; a divergence between the optimistic bubble and the persisted one is how duplicate
bubbles appear after a retry. `onSettled` invalidates both `["thread", id, "messages"]` and
`["threads"]`, so the inbox's ordering updates too.

**Mark-read is fire-and-forget.** A failure must never block reading the thread, and no rendered
state depends on its response.

### Test-harness consequence, worth knowing before wiring the next service
Adding react-query to this screen made a `QueryClientProvider` mandatory for every suite that
renders it, because hooks cannot be conditional — `useQuery` runs even on the seeded path. Two
existing suites had to be wrapped. Reaching `@/hooks/use-current-user` and `./api` at module scope
also re-triggered the `@/lib/config` require-time throw that `AccountMenu.tsx` documents; both are
mocked in those suites. Expect the same three adjustments in every screen migrated from here on.

---

## Verified against the live backend — 2026-08-07

Stack: `api_gateway`, `user_service`, `inbox_service`, `postgres`, seeded with
`scripts/seed_dev_data.py`, authenticated as `ama.mensah@medapp.dev`.

| Call | Result |
| --- | --- |
| `GET /v1/threads` (no auth) | `401 {"error":"missing bearer token"}` |
| `GET /v1/threads` (empty) | `200 {"items":[]}` — envelope as documented |
| `POST /v1/threads` | `201` full `ThreadOut` |
| `POST /{id}/messages` | `200` full `ThreadMessageOut` |
| `GET /{id}/messages` | `200` **bare array**, confirming the envelope asymmetry |
| `POST /{id}/read` | `200` full `ThreadParticipantOut` |
| `GET /v1/threads` (populated) | `200`, `last_message_at` advanced to the new message |

Every field name and nesting matched the client's wire types. No mapping changes were needed.

### THE BLOCKER THIS FOUND — the gateway did not route `/v1/threads` at all

`api_gateway`'s `ROUTES` table had no `inbox_service` entry and `Settings` had no
`inbox_service_url`. Every messaging call the app made returned the gateway's own
`404 {"error":"unknown route"}` while `inbox_service` sat healthy and complete behind it.

**No test could have caught this.** The suites mock `./api`, and the client is correct — the
break was one layer below, in routing the app never exercises under Jest. It is also, in
hindsight, the likely origin of the "no messaging endpoints" claim: from the app's side the
endpoints genuinely did not answer.

Fixed by adding `inbox_service_url` and `"/v1/threads": settings.inbox_service_url`. **No new
endpoint was created** — this maps a route that already existed.

### Two live observations that change UI assumptions

1. **`last_message_at` is set at CREATION**, not on first message — a brand-new empty thread came
   back with a timestamp, not `null`. The client's `"New"` fallback for a null value is therefore
   nearly unreachable in practice. Harmless, but the sort rule is doing less work than assumed.
2. **`sender_role` is a coarse string** — the seeded patient posted as `"user"`, not a display
   name or a clinical title. `PractitionerChatScreen` renders `senderRole` as the group attribution
   line, so a live room would read "user" where the frame shows "Dr. Kwabena Osei · Attending
   Physician". That attribution needs the proposed `counterparty` resolution before the room can
   go live.

### Local-stack gotchas worth writing down
- **`make up` / `make seed` ignore `docker-compose.ports.yml`.** The Makefile's `COMPOSE` and
  `scripts/seed.sh` both hardcode a single `-f`, so on a box where another project holds 5432 they
  fail with "port is already allocated" — and `make seed` tears down running containers on the way.
  Pass both files explicitly instead:
  `docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.ports.yml …`
- **The `COMPOSE_FILE=a:b` form in the override's header is POSIX-only.** On Windows the colon is
  read as part of the drive path and compose fails with "cannot find the path specified";
  `COMPOSE_PATH_SEPARATOR=";"` did not rescue it either.
