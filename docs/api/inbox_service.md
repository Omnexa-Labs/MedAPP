# API contract — `inbox_service`

**Base prefix:** `/v1/threads` · **Source of truth:** `backend/services/inbox_service/app/schemas/thread.py`
· **Client:** `frontend/mobile/MedAPP/src/features/chat/api.ts`

> **The 2026-08-06 wiring pass created no new endpoints.** Per the CTO's rule — create endpoints
> *only if they don't exist* — every messaging route already shipped. The frontend was on seed data
> because `docs/PIPELINE.md` wrongly recorded "no messaging endpoints", not because anything was
> missing. See §5u.
>
> **2026-08-08 adds three genuinely new routes: attachments.** These did not exist anywhere in the
> product — the router was checked first, and the composer's own source
> (`useComposerMedia.ts`) carried a FLAGGED-FOR-THE-BACKEND note asking for exactly this. See
> [Attachments](#attachments-added-2026-08-08).

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
| `POST` | `/v1/threads/{thread_id}/attachments` | **multipart** | `AttachmentOut` | 201 — **NEW 2026-08-08** |
| `GET` | `/v1/threads/{thread_id}/attachments` | — | `AttachmentList` | 200 — **NEW 2026-08-08** |
| `GET` | `/v1/threads/{thread_id}/attachments/{attachment_id}/content` | — | **raw bytes** | 200 — **NEW 2026-08-08** |

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
| `attachments` | `AttachmentOut[]` | **NEW 2026-08-08.** Additive, always present, `[]` for the overwhelming majority of messages. A client that ignores the key is unaffected. |

### `ThreadParticipantOut`
`participant_id`, `thread_id`, `user_id`, `role`, `joined_at` (nullable), `last_read_at`
(nullable), `is_active`.

### `AttachmentOut` — **NEW 2026-08-08**
| Field | Type | Notes |
| --- | --- | --- |
| `attachment_id` | UUID | |
| `thread_id` | UUID | The authorisation anchor. Never null, never changes. |
| `message_id` | UUID \| null | **Null = staged**, uploaded but not yet sent on a message. |
| `uploader_user_id` | UUID | |
| `content_type` | str | From the allowlist below. |
| `byte_size` | int | |
| `original_filename` | str | Display only. Never used to build a path. |
| `duration_ms` | int \| null | **Voice notes.** Null for images and PDFs. |
| `created_at` | datetime | |

**There is no `url` field.** That is a deliberate security decision, not an omission — see
[PHI and access control](#phi-and-access-control-read-this-before-adding-a-url). `storage_key` is
never on the wire either.

`AttachmentList` — `{ items: AttachmentOut[] }`. The envelope, matching `ThreadList` rather than the
bare array `GET /messages` returns. The asymmetry documented above is inherited, not extended.

### Request bodies
- **`ThreadCreate`** — `subject` (1–255, required), `source` (≤32, default `direct`),
  `participant_user_ids: UUID[]`, `participant_roles: str[]`, `assigned_role` (≤32, nullable),
  `booking_id` (nullable).
- **`ThreadMessageCreate`** — `body` (≤4000) **and, since 2026-08-08, optional
  `attachment_ids: UUID[]`** (max 8). **A body-only `{"body": "..."}` send is byte-for-byte
  unchanged** — verified live and guarded by
  `tests/test_attachments.py::test_body_only_message_still_sends_unchanged`.
  `body`'s `min_length=1` became a default of `""` so a voice note can be sent with no typed text;
  **what is accepted did not widen** — a model validator requires text OR at least one attachment,
  so `{"body": ""}` and `{}` are still 422 exactly as before.
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
| ~~**Attachments**~~ | ~~`ThreadMessageCreate` is `{ body }`. No upload endpoint exists anywhere in the product.~~ | **CLOSED 2026-08-08** — see below. The backend is live; the client is not wired to it yet. |

### Proposed additions — backend work, not yet agreed
Adding these three to `ThreadOut` would remove the first three rows above and needs no new route:

```python
last_message_preview: str | None   # truncated body of the latest message
unread_count: int                  # derived from the caller's last_read_at
counterparty: ParticipantSummary | None   # display name + avatar for a 1:1
```

Member **count** is already derivable from participants and could join them. Presence, join events
and delivery receipts each need genuinely new capability and should be scoped separately.
(Attachments were on this list until 2026-08-08.)

---

## Attachments (added 2026-08-08)

### Why now
`frontend/mobile/MedAPP/src/features/chat/useComposerMedia.ts` has been able to pick a file and
record a voice note for some time — real `expo-document-picker`, real `expo-audio`, real permission
handling. **The file never left the phone**, because no endpoint in the product accepted one, and
the composer rendered "Not sent — this conversation isn't connected". That hook's own header
carried the request: *"FLAGGED FOR THE BACKEND: this needs `POST /v1/threads/:id/attachments`
(multipart, returning a durable id + url)."* This is that endpoint, minus the url — see below for
why the url is refused.

**The router was checked before anything was written.** No attachment route existed on
`threads.py`, on any other service, or on the gateway.

### The flow — two phases, on purpose

```
1. POST /v1/threads/{thread_id}/attachments      multipart      -> 201 AttachmentOut (message_id: null)
2. POST /v1/threads/{thread_id}/messages         {body, attachment_ids: [id]} -> 200 ThreadMessageOut
3. GET  /v1/threads/{thread_id}/messages                        -> attachments[] inline on each message
4. GET  /v1/threads/{thread_id}/attachments/{attachment_id}/content -> the bytes
```

Upload is separate from send because the composer picks a file *before* the user finishes typing,
and a voice note exists the instant recording stops. Forcing a message id at upload time would
either reorder the UI or make an 8 MiB upload look like a slow send button. An attachment therefore
exists "staged" (`message_id: null`) and is adopted by the message that references it. **`thread_id`
is set from the first instant**, so authorisation never waits on the message.

#### `POST /{thread_id}/attachments` — multipart fields
| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | file part | yes | Content type is read from the part, not from an extension. |
| `duration_ms` | form int | no | **Voice notes.** Persisted so the client can draw a player and scrubber without downloading the file. 0 … 14,400,000 (4 h). |

| Status | When |
| --- | --- |
| 201 | Staged. Returns `AttachmentOut`. |
| 403 | Caller is not an active participant of the thread. |
| 404 | Thread does not exist. |
| 413 | Over the size cap. Enforced **while reading**, not from `Content-Length`. |
| 415 | Content type not in the allowlist. |
| 422 | Empty file, or `duration_ms` out of range. |

`POST /{thread_id}/messages` gains: **404** if an `attachment_id` is unknown *or belongs to another
thread* (same response for both — an id from a thread you are not in must not be distinguishable
from a fabricated one), **403** if it was uploaded by a different user, **409** if it is already
attached to a message. None of these is a silent skip: a message that quietly drops the voice note
the user recorded is worse than a rejected send, because the user believes it went.

### Limits

| Limit | Value | Setting |
| --- | --- | --- |
| Max attachment size | **8 MiB** (8,388,608 bytes) | `INBOX_MAX_ATTACHMENT_BYTES` |
| Max attachments per message | 8 | schema constant |
| Max `duration_ms` | 4 hours | `INBOX_MAX_ATTACHMENT_DURATION_MS` |
| Content types | allowlist below | `app/config.py` |

**8 MiB is not arbitrary.** `api_gateway` rejects any body over 10 MB (`MAX_BODY_BYTES`) unless the
path is in `BODY_SIZE_WHITELIST_PREFIXES`. 8 MiB of file plus the multipart envelope stays under
that, so uploads work through the gateway with **no gateway change**. Proven live: a full 8 MiB PDF
uploads through the gateway, 201. **If you raise this past ~9.5 MB you must also whitelist
`/v1/threads`, or every large upload dies at the edge with the gateway's own 413 and never reaches
this service.**

**Content-type allowlist** — an allowlist, never a blocklist. A blocklist is a list of the dangerous
things someone thought of; this is the list of the three things the composer can produce.

- **Audio:** `audio/m4a`, `audio/x-m4a`, `audio/mp4`, `audio/aac`, `audio/mpeg`, `audio/ogg`,
  `audio/wav`, `audio/x-wav`, `audio/webm` (three m4a spellings because expo-audio's
  `HIGH_QUALITY` preset is reported differently across platforms and pickers)
- **Images:** `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`
- **Documents:** `application/pdf`

Parameters are stripped before matching, so `audio/m4a; codecs=mp4a.40.2` is accepted — rejecting a
correct upload for carrying a codec hint is the kind of failure that gets diagnosed as "uploads are
broken".

**The declared content type is client-supplied and is not trusted.** A `.exe` announced as
`image/png` passes the allowlist. That is handled on the way *out*, not with sniffing: see the
response headers below.

### Storage: local filesystem, and what that costs

Bytes go to a directory on a Docker named volume (`INBOX_ATTACHMENT_ROOT`, default
`/app/var/attachments`), behind the `AttachmentStorage` interface in
`backend/services/inbox_service/app/storage.py`.

**No cloud dependency was added.** This repo has no `boto3`, no Azure or GCS client anywhere in
`backend/`, and no configured bucket, credential or lifecycle policy. Adding one to ship a voice
note would mean inventing an account, a region and a key-rotation story nobody has agreed to — and
would still need this same interface in front of it.

So the decision is **deferred, not skipped**, and the seam is real: nothing above `storage.py` sees
a filesystem path, only an opaque `storage_key`. Swapping to S3 is one new class plus one line in
`get_storage()` — no router, service, schema or migration change.

**The limits, stated so nobody discovers them in production:**

1. **Not shared between replicas.** A file written by pod A is invisible to pod B. **`inbox_service`
   cannot be scaled horizontally** while this backend is in use unless the volume is RWX
   (NFS/EFS). This is the binding constraint and the reason the swap will eventually be forced.
2. **Not in the database backup.** `pg_dump` captures the rows and none of the bytes. A restore
   yields attachment rows pointing at files that do not exist — the fetch route answers 404 rather
   than 500 for exactly this case. The volume needs its own backup.
3. **No server-side encryption at rest** beyond what the host volume provides. On the dev stack,
   nothing. SSE-KMS is the real reason to move for a production PHI deployment.
4. **No lifecycle or retention automation.** Nothing deletes anything, ever. Storage grows
   monotonically and the size cap is the only bound.
5. **`docker compose down -v` deletes patient files.** The `inbox_attachments` volume is not
   covered by any database backup.

### PHI and access control — read this before adding a `url`

Attachments are PHI. A voice note is a patient describing their symptoms out loud.

**Authorisation is per-thread and is re-checked on every single call.** Only an active participant
may upload to a thread, list its attachments, or read one back. A non-participant gets **403**.
Every attachment function routes through the same `thread_service.get_thread` helper that
`list_messages`, `post_message` and `mark_thread_read` already use — attachments do not get a
second, parallel notion of "may this person see this thread" that can drift from the first.

The attachment id is checked **against the thread id** on every fetch, so a participant of thread A
cannot read thread B's attachment by holding its id.

**There is deliberately no attachment URL, and no signed URL.** The obvious design is to return a
link; it was rejected. **A URL that grants access is a bearer credential**, and an unusually leaky
one: it lands in browser history, in proxy and CDN logs, in the next request's `Referer`, in a
screenshot, in the "copy link" a patient forwards to a relative. A pre-signed S3 URL is the same
object with an expiry bolted on — still copyable, still valid for anyone holding the string. For a
recording of a patient's symptoms that is not an acceptable failure mode.

Instead: the client composes `/v1/threads/{thread_id}/attachments/{attachment_id}/content` from ids
it already has and sends its normal bearer token. **The id is not a capability.** Possession grants
nothing; participation does. Revoking access is removing someone from the thread, and it takes
effect on the *next request* rather than whenever an issued link happens to expire.

**Storage posture:** files are `0600`, directories `0700`, owned by the container's non-root UID
10001. **No static-file route serves the attachment directory** and none should be added — the only
way bytes leave the process is the authorised handler in `routers/attachments.py`. The storage key
is `<thread_id>/<random hex>.bin`: no part of the uploader's filename reaches the filesystem, so
path traversal and `voice-note.m4a.php` are impossible by construction rather than filtered. The
original filename is a database column and a JSON field, never a path.

**Fetch response headers, each one load-bearing:**

| Header | Why |
| --- | --- |
| `Content-Disposition: attachment` | Never rendered inline, so an uploaded HTML/SVG file declared as an allowed type cannot execute in the app's origin. |
| `X-Content-Type-Options: nosniff` | The declared type is client-supplied; nosniff stops a browser deciding the bytes look like something more interesting. |
| `Cache-Control: no-store` | PHI must not persist in a shared or disk cache after access is revoked. |
| `Content-Length` | From the stored `byte_size`, so clients get a real progress bar instead of an indeterminate spinner. |

**Audit trail.** `GET /attachments` and `GET /attachments/{id}/content` write an `AccessAudit` row
for **both** outcomes, granted and denied, with the thread's patient-side participant as
`patient_id` — the same discipline `list_messages` already follows. Uploads are **not** audited:
`access_audit` is a READ trail, and filing a patient's own upload into it would make "who read this
patient's data?" overstate exposure. The attachment row's `uploader_user_id` + `created_at` is the
write record.

### Migration `20260808_0004`

`thread_message_attachments`, revises `20260805_0003`. `created_at`/`updated_at` carry
`server_default=sa.func.now()` matching `shared.db.TimestampMixin` — **verified against the live
database, not the migration file**:

```
 column_name |        data_type         | is_nullable | column_default
-------------+--------------------------+-------------+----------------
 created_at  | timestamp with time zone | NO          | now()
 updated_at  | timestamp with time zone | NO          | now()
```

This repo has shipped the missing-server-default defect at least three times, and this service's own
revision `20260805_0003` exists solely to repair it on the first three tables. The tests cannot
catch it: they build the schema from `Base.metadata.create_all`, which reads the **model**, and the
model carries the mixin's defaults. A green suite sits happily on a table that cannot accept a row.

`downgrade()` drops the table and **orphans the files on the volume** — the bytes are not in
Postgres, so nothing in a schema downgrade can reach them. Clean `INBOX_ATTACHMENT_ROOT` by hand if
you ever run it.

### What was NOT built — explicit list

| Not built | Why |
| --- | --- |
| **Object storage (S3/GCS/Azure)** | Would add a cloud dependency this repo does not have, with no agreed bucket, credentials or region. The `AttachmentStorage` interface exists so it is a contained change later. |
| **Signed / expiring URLs** | A URL that grants access is a bearer credential. See above. |
| **Client wiring** | `useComposerMedia.ts` still hardcodes `uploaded: false` and `ChatThreadScreen` does not call these routes. This change is backend-only; the composer's single-slot UI, upload progress and retry are a separate piece of work. |
| **Reaping staged attachments** | An upload whose message is never sent leaves an orphan row and an orphan file **forever**. Nothing sweeps them. This is the most likely source of unbounded growth and wants a scheduled job. |
| **Deleting an attachment** | No `DELETE` route. Removing a message removes the row by FK cascade but **leaves the bytes on the volume**. |
| **Retention / lifecycle** | Nothing expires. The six-year audit retention position in `shared.audit.model` says nothing about attachment content. |
| **Virus / malware scanning** | Files are accepted, stored and served back unexamined. The allowlist plus `nosniff` + `attachment` disposition bound the blast radius in a browser; they do nothing about a malicious PDF opened by a native viewer. |
| **Content sniffing / magic-byte validation** | Only the declared type is checked. Mitigated by the response headers, not by inspection. |
| **Thumbnails, transcoding, waveform generation** | The client gets `content_type`, `byte_size` and `duration_ms` and renders from those. No frame specifies a server-rendered waveform. |
| **Per-user or per-thread upload quotas** | Only the per-file cap exists. A determined participant can upload 8 MiB repeatedly. |
| **Resumable / chunked upload** | Single-shot multipart. An interrupted 8 MiB upload restarts. |
| **Attachments on `POST /handoff`** | The AI→human escalation path is text only, unchanged. |
| **Gateway body-size whitelist entry** | Not needed at 8 MiB, and adding one would remove a real limit for nothing. |

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

---

## Attachments verified against the live backend — 2026-08-08

Stack: `api_gateway` (host 8010), `inbox_service`, `postgres` (host 5442), started with **both**
compose files from `infra/docker`. Two real seeded logins through the gateway:
`ama.mensah@medapp.dev` (patient, the thread's participant) and `kwabena.osei@medapp.dev` (doctor,
**not** a participant). Migration run in the container: `20260805_0003 -> 20260808_0004`,
`alembic current` reports `20260808_0004 (head)`.

**Upload (participant) → 201**
```json
{"attachment_id":"3f4fa385-85e5-4066-be28-82677851366e","thread_id":"a03e7662-e4b4-4e6c-a376-e8665bf09918",
 "message_id":null,"uploader_user_id":"11b535cd-366a-4a54-bb09-fc2fd751de66","content_type":"audio/m4a",
 "byte_size":928,"original_filename":"voice-note.m4a","duration_ms":7400,
 "created_at":"2026-08-08T10:20:20.662321Z"}
```

**Body-only send, unchanged → 200** (the regression that mattered most)
```json
{"message_id":"5bfee421-...","body":"Plain text, unchanged contract.","is_internal":false,"attachments":[]}
```

**Voice note with an EMPTY body → 200**, attachment adopted, `duration_ms` intact
```json
{"message_id":"5a939deb-4f04-4437-ac3e-373174d05cb5","body":"","attachments":[
  {"attachment_id":"3f4fa385-...","message_id":"5a939deb-...","content_type":"audio/m4a",
   "byte_size":928,"original_filename":"voice-note.m4a","duration_ms":7400}]}
```

**Fetch the bytes back → 200**, headers as designed, content identical
```
content-disposition: attachment; filename="voice-note.m4a"
x-content-type-options: nosniff
cache-control: no-store
content-type: audio/m4a
content-length: 928
--- byte comparison --- IDENTICAL (928 bytes)
```

**THE 403 PATH — second user's real token, all three routes**
```
upload            -> HTTP 403 {"detail":"forbidden"}
list attachments  -> HTTP 403 {"detail":"forbidden"}
fetch content     -> HTTP 403 {"detail":"forbidden"}   (holding a VALID attachment id)
```

**Limits**
```
application/x-msdownload  -> HTTP 415 {"detail":"content type application/x-msdownload is not accepted; allowed: ..."}
9 MiB upload              -> HTTP 413 {"detail":"attachment exceeds the 8388608 byte limit"}
8 MiB upload via gateway  -> HTTP 201  (confirms the cap sits under the gateway's 10 MB MAX_BODY_BYTES)
```

**Audit rows written, both outcomes** (`medapp_inbox.access_audit`)
```
      resource      | accessor_role | outcome | record_count
--------------------+---------------+---------+--------------
 thread_attachment  | doctor        | denied  |
 thread_attachments | doctor        | denied  |
 thread_attachment  | user          | granted |            1
 thread_attachments | user          | granted |            1
```

**On-disk posture**
```
drwx------ medapp medapp  /app/var/attachments
drwx------ medapp medapp  /app/var/attachments/a03e7662-.../
-rw------- medapp medapp  .../bc9e534a0e5e48e6ae465397504d3775.bin   (928 bytes)
```
Note the filename: no trace of `voice-note.m4a`. A `../../../../etc/passwd` filename is stored as
`passwd` in the database column and produces the same random `.bin` on disk
(`test_filename_cannot_carry_a_path`).

### THE BLOCKER THIS FOUND — the volume mount point, root-owned

The first live run returned **HTTP 500 on every upload** while all 21 tests were green:

```
PermissionError: [Errno 13] Permission denied: '/app/var/attachments/<thread-id>'
```

Compose mounted `inbox_attachments:/app/var/attachments`. **Docker seeds an empty named volume from
the image — including ownership — only if the mount path exists in the image.** `backend/Dockerfile`
creates and chowns `/app/var` to UID 10001; `/app/var/attachments` does not exist there, so Docker
created that directory itself as `root:root 0755`. The container runs as 10001 (to satisfy Pod
Security `restricted`), so it could list the directory and never write to it.

**No test could have caught this.** The suite writes to a `tmp_path` owned by whoever runs pytest.
The break is entirely in the container/volume boundary — the same shape as the gateway-routing
blocker recorded above, and the fifth defect in this repo to pass every test and fail live.

Fixed by mounting **one level up**, at `/app/var`, which *does* exist in the image and *is* owned by
10001; the service then creates `attachments/` inside it with mode 0700. No Dockerfile change, no
init container, no root-owned mount. A named volume rather than a bind mount for the same reason: a
bind mount from a Windows or macOS host lands root-owned and reintroduces the bug.

**A startup check was added** (`app/main.py::_check_attachment_storage`) so this class of failure is
loud instead of per-request: it creates the root and probes writability at boot, logging
`attachment_storage_ready` or a named `attachment_storage_unusable` error with the remedy. It
**logs rather than refusing to boot** — attachments are one feature of this service and messaging is
the rest, so killing the container would turn "voice notes are broken" into "the inbox is down".

Live confirmation after the fix:
```
{"path": "/app/var/attachments", "event": "attachment_storage_ready", "level": "info"}
```

### Local-stack gotchas worth writing down
- **`make up` / `make seed` ignore `docker-compose.ports.yml`.** The Makefile's `COMPOSE` and
  `scripts/seed.sh` both hardcode a single `-f`, so on a box where another project holds 5432 they
  fail with "port is already allocated" — and `make seed` tears down running containers on the way.
  Pass both files explicitly instead:
  `docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.ports.yml …`
- **The `COMPOSE_FILE=a:b` form in the override's header is POSIX-only.** On Windows the colon is
  read as part of the drive path and compose fails with "cannot find the path specified";
  `COMPOSE_PATH_SEPARATOR=";"` did not rescue it either.
