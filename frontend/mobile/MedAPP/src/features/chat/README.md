# features/chat/

Medical AI chat — message thread UI, composer, streaming responses, citation rendering.

Talks to the `medical_chat_agent` service via `api.ts`. Streaming concerns (SSE / WebSocket) are encapsulated in a hook here, not leaked into screens.
