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
| `ChatThreadScreen` | Seeded. Next: `GET /{id}/messages`, `POST /{id}/messages`, `POST /{id}/read`. |
| `PractitionerChatScreen` | Seeded. Same migration; also needs the group gaps above. |
| `AiAssistantScreen` | Not wired. `POST /v1/threads/handoff` is its escalation path. |
