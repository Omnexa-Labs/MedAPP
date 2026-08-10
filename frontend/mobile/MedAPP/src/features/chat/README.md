# features/chat/

Messaging: the inbox, a message thread, and the (not yet available) AI assistant.

`api.ts` talks to **`inbox_service`**, `/v1/threads` — not to `medical_chat_agent`,
which this directory's description used to claim. That claim is why the screens
here spent so long on seed data: it named a service with no client in this app,
so the real thread API that had shipped all along went uncalled.

## What is real

- `InboxScreen` — `GET /v1/threads`, `POST /v1/threads`. Polls every 30s while focused.
- `ChatThreadScreen` — `GET /v1/threads/{id}`, `GET|POST /v1/threads/{id}/messages`,
  `POST /v1/threads/{id}/read`. Polls every 10s while focused.
- `PractitionerChatScreen` — a thin, still-SEEDED caller of `ChatThreadScreen`
  (Figma 1057:1448). It passes no `threadId`, so it fires no request.
- **Voice notes** — `POST /v1/threads/{id}/attachments` (multipart, `duration_ms`),
  then `POST /messages` with `attachment_ids`, then playback from
  `GET /attachments/{id}/content`. Figma `voice_note — 1..9` on the Messaging page
  (548:615), each frame with a DARK proof beneath it.
  - `useComposerMedia` — capture, permissions, the 8 MiB / four-hour limits.
  - `VoiceNoteComposer` — the mic (**hold *and* tap**), recording bar, review bar.
  - `VoiceNoteAudio` — playback, waveform, play/pause.
  - `attachmentLimits` — the caps, with no imports, so the hook can enforce them
    without reaching `@/lib/config`.

  Two rules, both load-bearing. **Hold-to-record is never the only way in**: it is
  inoperable under Switch Control and under a screen reader, so the mic also takes
  a tap, and the tap starts the recording *locked* so both paths land in the same
  state. And **nothing renders as sent until `POST /messages` returns a row** — a
  201 from the upload is a staged attachment, not a delivered message.

## What is not

There is **no streaming** — no SSE, no WebSocket, and no hook encapsulating one.
Freshness comes from polling, which is why the poll intervals are named constants
in the two screens rather than buried in a query.

There is **no assistant**. `AiAssistantScreen` has no model behind it and no
endpoint to reach one; it says so, and offers a real escalation to a human
instead of simulating a reply. See that file's header for the full record of what
it used to fabricate.

There are **no delivery receipts** (`last_read_at` gives READ) and **no presence**
(`is_active` is membership). Screens must not imply either.

Attachments used to be the third item here. They shipped on 2026-08-08 — but note
what did *not*: there is **no attachment URL and no signed URL**, deliberately,
because a link that grants access is a bearer credential for PHI. Build the
content path from ids and send the normal bearer token. There is also no upload
**progress** (`fetch` with a `FormData` body reports none, and the backend has no
resumable upload), no server-generated **waveform** — the bars are a fixed figure
and `duration_ms` is the only real number — and nothing that **reaps a staged
attachment** whose message is never sent, which is why a retry after a failed send
reuses the id it already has instead of uploading again.
