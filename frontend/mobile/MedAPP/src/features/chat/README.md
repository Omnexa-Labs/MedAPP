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

## What is not

There is **no streaming** — no SSE, no WebSocket, and no hook encapsulating one.
Freshness comes from polling, which is why the poll intervals are named constants
in the two screens rather than buried in a query.

There is **no assistant**. `AiAssistantScreen` has no model behind it and no
endpoint to reach one; it says so, and offers a real escalation to a human
instead of simulating a reply. See that file's header for the full record of what
it used to fabricate.

There are **no attachments** on the wire (`ThreadMessageCreate` is `{ body }`),
**no delivery receipts** (`last_read_at` gives READ) and **no presence**
(`is_active` is membership). Screens must not imply any of the three.
