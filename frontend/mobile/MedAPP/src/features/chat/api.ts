// Messaging API — inbox_service, `/v1/threads`.
//
// ---------------------------------------------------------------------------
// THIS EXISTS BECAUSE A LONG-STANDING PIPELINE CLAIM WAS WRONG
// ---------------------------------------------------------------------------
// docs/PIPELINE.md's inert-control audit recorded "New conversation —
// InboxScreen. No messaging endpoints." That line was quoted forward into
// ChatThreadScreen's header, PractitionerChatScreen's header and two §5
// entries, and it is FALSE. `inbox_service` ships a complete thread API and has
// done all along:
//
//   POST   /v1/threads                    create
//   GET    /v1/threads                    list (the inbox)
//   GET    /v1/threads/{id}               one thread
//   GET    /v1/threads/{id}/messages      the transcript
//   POST   /v1/threads/{id}/messages      send
//   POST   /v1/threads/{id}/read          mark read -> returns the participant
//   POST   /v1/threads/handoff            AI -> human escalation
//
// The consequence of believing the claim: the chat screens were built on seed
// constants, and member counts, join events and delivery receipts were all
// flagged "a wire concept this app has no wire for". Three of those four are
// genuinely absent from this service — see WHAT THE SERVICE DOES NOT MODEL
// below — but the messages themselves were always available.
//
// ---------------------------------------------------------------------------
// WHAT THE SERVICE DOES NOT MODEL, so the screens must not imply it
// ---------------------------------------------------------------------------
//   * PRESENCE. No "3 online now". `ThreadParticipantOut` has `is_active`,
//     which is membership, not connectivity.
//   * DELIVERY RECEIPTS. There is `last_read_at` per participant, so a READ
//     state is derivable, but nothing reports "delivered".
//   * JOIN/LEAVE EVENTS. `joined_at` exists on the participant row; there is no
//     event stream, so a "X joined the shift" line cannot be sourced.
//   * ~~ATTACHMENTS~~ SHIPPED 2026-08-08 and wired here. Three routes, and the
//     one thing to know before reading the code: upload is a SEPARATE call from
//     send. See ATTACHMENTS below.
//
// The first three stay seeded and stay flagged. Everything else on this module
// is real.
//
// `is_internal` on a message is a clinician-only note — it must never render in
// a patient-facing thread. `isInternal` is carried through deliberately so a
// caller has to make that decision rather than leak it by default.
//
// ---------------------------------------------------------------------------
// ATTACHMENTS — and the two places this module stops looking like the others
// ---------------------------------------------------------------------------
//   POST /v1/threads/{id}/attachments   multipart `file` + optional
//                                       `duration_ms` -> 201 AttachmentOut
//   POST /v1/threads/{id}/messages      { body, attachment_ids } -> the message
//   GET  /v1/threads/{id}/attachments/{aid}/content  -> the bytes
//
// 1. THE UPLOAD DOES NOT GO THROUGH `client`. `client.send` does
//    `JSON.stringify(body)`, which turns a `FormData` into `"{}"`, and the
//    multipart boundary has to be chosen by the platform's own fetch. So
//    `uploadAttachment` is the one raw `fetch` in this feature. What it gives
//    up, stated rather than discovered: the client's shared 401 → refresh →
//    retry-once. A 401 here surfaces as a failed upload the user can retry, and
//    by then any concurrent query has already rotated the token in
//    `secureStorage` — which is why the token is read from there rather than
//    cached.
//
// 2. THERE IS NO URL ON THE RESPONSE, AND THAT IS DELIBERATE. Not an omission,
//    and not something to add: a URL that grants access is a bearer credential,
//    and it leaks into history, proxy logs, `Referer`, screenshots and the
//    "copy link" a patient forwards to a relative. A voice note is a patient
//    describing their symptoms out loud. `attachmentContentUri` therefore
//    composes the path from ids the caller already holds and
//    `attachmentAuthHeaders` supplies the normal bearer token — the id is not a
//    capability, participation is. Do not cache the result as a "url", and do
//    not introduce a signed one.

import { client } from "@/lib/api/client";
import { config } from "@/lib/config";
import { secureStorage } from "@/lib/storage/secure-storage";
import { getDeviceIdCached } from "@/lib/device/device-id";
import { ApiError } from "@/types/api";

export const THREADS_PATH = "/v1/threads";

// The limits live in ./attachmentLimits — importable by a composer hook that has
// no business reaching `@/lib/config`. Re-exported so a caller holding this
// module does not need to know that.
export {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_DURATION_MS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  isAllowedContentType,
} from "./attachmentLimits";

// ---------------------------------------------------------------------------
// Wire types — snake_case, mirroring app/schemas/thread.py exactly
// ---------------------------------------------------------------------------

export type ThreadStatus = "open" | "pending" | "closed";

interface ThreadOutWire {
  thread_id: string;
  subject: string;
  source: string;
  status: ThreadStatus;
  created_by_user_id: string;
  assigned_role: string | null;
  assigned_user_id: string | null;
  booking_id: string | null;
  last_message_at?: string | null;
}

interface ThreadListWire {
  items: ThreadOutWire[];
}

interface AttachmentOutWire {
  attachment_id: string;
  thread_id: string;
  message_id: string | null;
  uploader_user_id: string;
  content_type: string;
  byte_size: number;
  original_filename: string;
  duration_ms: number | null;
  created_at: string;
}

interface ThreadMessageOutWire {
  message_id: string;
  thread_id: string;
  sender_user_id: string | null;
  sender_role: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  /**
   * Additive, always present, `[]` on the overwhelming majority of messages.
   * Optional here anyway: a fixture or an older row without the key must map to
   * `[]` rather than crash the transcript.
   */
  attachments?: AttachmentOutWire[];
}

interface ThreadParticipantOutWire {
  participant_id: string;
  thread_id: string;
  user_id: string;
  role: string;
  joined_at: string | null;
  last_read_at: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Domain types — camelCase, what screens consume
// ---------------------------------------------------------------------------

export interface Thread {
  id: string;
  subject: string;
  source: string;
  status: ThreadStatus;
  createdByUserId: string;
  assignedRole: string | null;
  assignedUserId: string | null;
  bookingId: string | null;
  /** ISO. Null on a thread with no messages yet — sort those last, not first. */
  lastMessageAtIso: string | null;
}

export interface Attachment {
  id: string;
  threadId: string;
  /** Null = STAGED: uploaded, not yet carried by a message. */
  messageId: string | null;
  uploaderUserId: string;
  contentType: string;
  byteSize: number;
  /** Display only. Never used to build a path — on either side of the wire. */
  originalFilename: string;
  /** Voice notes only. Null for images and PDFs. */
  durationMs: number | null;
  createdAtIso: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  senderUserId: string | null;
  senderRole: string;
  body: string;
  /**
   * A clinician-only note. NEVER render this in a patient-facing thread — the
   * field is surfaced rather than filtered here so the decision is explicit at
   * the call site instead of silently inherited.
   */
  isInternal: boolean;
  createdAtIso: string;
  attachments: Attachment[];
}

export interface ThreadParticipant {
  id: string;
  threadId: string;
  userId: string;
  role: string;
  joinedAtIso: string | null;
  lastReadAtIso: string | null;
  isActive: boolean;
}

function toThread(w: ThreadOutWire): Thread {
  return {
    id: w.thread_id,
    subject: w.subject,
    source: w.source,
    status: w.status,
    createdByUserId: w.created_by_user_id,
    assignedRole: w.assigned_role,
    assignedUserId: w.assigned_user_id,
    bookingId: w.booking_id,
    lastMessageAtIso: w.last_message_at ?? null,
  };
}

function toAttachment(w: AttachmentOutWire): Attachment {
  return {
    id: w.attachment_id,
    threadId: w.thread_id,
    messageId: w.message_id,
    uploaderUserId: w.uploader_user_id,
    contentType: w.content_type,
    byteSize: w.byte_size,
    originalFilename: w.original_filename,
    durationMs: w.duration_ms,
    createdAtIso: w.created_at,
  };
}

function toMessage(w: ThreadMessageOutWire): ThreadMessage {
  return {
    id: w.message_id,
    threadId: w.thread_id,
    senderUserId: w.sender_user_id,
    senderRole: w.sender_role,
    body: w.body,
    isInternal: w.is_internal,
    createdAtIso: w.created_at,
    attachments: (w.attachments ?? []).map(toAttachment),
  };
}

function toParticipant(w: ThreadParticipantOutWire): ThreadParticipant {
  return {
    id: w.participant_id,
    threadId: w.thread_id,
    userId: w.user_id,
    role: w.role,
    joinedAtIso: w.joined_at,
    lastReadAtIso: w.last_read_at,
    isActive: w.is_active,
  };
}

export interface CreateThreadInput {
  subject: string;
  source?: string;
  participantUserIds?: string[];
  participantRoles?: string[];
  assignedRole?: string | null;
  bookingId?: string | null;
}

/**
 * `POST /v1/threads/handoff` — AI -> human escalation.
 *
 * WRAPPED, BUT NOT CALLABLE FROM THIS APP, and the distinction matters enough to
 * state here rather than let someone discover it as a 403 in the field:
 * `create_handoff_thread` (inbox_service/app/services/thread_service.py:66)
 * rejects any principal whose role is not `service` or `admin`. A patient's
 * bearer token carries neither, so a handoff can only ever be filed BY the
 * assistant service on the user's behalf — which is why it takes `user_id`
 * rather than reading the caller's subject.
 *
 * It is wrapped because the escalation belongs to `medical_chat_agent` and that
 * service does not exist yet; when it ships, this is the call it makes. The
 * patient-initiated escalation the app CAN make is `createThread` with an
 * `assignedRole` — see AiAssistantScreen.
 */
export interface HandoffInput {
  /** The patient the thread is about. NOT the caller — see above. */
  userId: string;
  assignedRole: string;
  subject: string;
  /** Filed as the thread's first message, `is_internal: true`. */
  summary: string;
  bookingId?: string | null;
  locale?: string;
}

/**
 * The multipart part a picked file or a finished recording turns into.
 *
 * `uri` is device-local. React Native's `FormData` accepts this `{ uri, name,
 * type }` shape and streams the file itself — reading it into a `Blob` first
 * would put 8 MiB of PHI on the JS heap for no gain.
 */
export interface AttachmentUpload {
  uri: string;
  name: string;
  /** Must be in the server's allowlist or the upload is a 415. */
  mimeType: string;
  /** Voice notes only. Persisted so a player can be drawn without a download. */
  durationMs?: number;
}

/**
 * The absolute content path for one attachment, composed from ids.
 *
 * NOT a url in the credential sense — see the ATTACHMENTS block at the top.
 * Whatever fetches this must send `attachmentAuthHeaders()`; unauthenticated it
 * is a 401 and from a non-participant a 403, which is the whole point.
 */
export function attachmentContentUri(threadId: string, attachmentId: string): string {
  return `${config.apiBaseUrl}${THREADS_PATH}/${threadId}/attachments/${attachmentId}/content`;
}

/**
 * Headers for a request this module does not itself make — `expo-audio`'s
 * `AudioSource.headers` streams the bytes, so the bearer token has to travel
 * with it rather than with `client`.
 */
export async function attachmentAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await secureStorage.getAccessToken().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  const deviceId = getDeviceIdCached();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

export const chatApi = {
  /** The inbox. `GET /v1/threads` is already scoped to the principal. */
  async listThreads(): Promise<Thread[]> {
    const res = await client.get<ThreadListWire>(THREADS_PATH);
    return (res.items ?? []).map(toThread);
  },

  async getThread(threadId: string): Promise<Thread> {
    return toThread(await client.get<ThreadOutWire>(`${THREADS_PATH}/${threadId}`));
  },

  /** The transcript. Returns a BARE ARRAY, not an `{ items }` envelope. */
  async listMessages(threadId: string): Promise<ThreadMessage[]> {
    const res = await client.get<ThreadMessageOutWire[]>(`${THREADS_PATH}/${threadId}/messages`);
    return (res ?? []).map(toMessage);
  },

  /**
   * Send.
   *
   * `attachmentIds` is omitted from the body entirely when there are none, so a
   * body-only send stays BYTE-FOR-BYTE the request it always was — the
   * regression the backend guards with
   * `test_body_only_message_still_sends_unchanged`, and the one worth not
   * breaking from this side either.
   *
   * `body` may be `""` when an attachment is present: a voice note needs no
   * typed text. `{"body": ""}` with no attachment is still a 422, exactly as
   * before, which is why the caller — not this function — decides there is
   * something to send.
   */
  async sendMessage(
    threadId: string,
    body: string,
    attachmentIds?: string[],
  ): Promise<ThreadMessage> {
    const payload: { body: string; attachment_ids?: string[] } = { body };
    if (attachmentIds && attachmentIds.length > 0) payload.attachment_ids = attachmentIds;
    return toMessage(
      await client.post<ThreadMessageOutWire>(`${THREADS_PATH}/${threadId}/messages`, payload),
    );
  },

  /**
   * Stage one attachment. Returns it with `messageId: null` until a message
   * adopts it.
   *
   * The raw `fetch` is explained in the ATTACHMENTS block at the top: `client`
   * would JSON-stringify the `FormData`. `Content-Type` is deliberately NOT set
   * — the platform has to append its own multipart boundary, and setting the
   * header by hand omits it and produces a 422 that looks like a server bug.
   */
  async uploadAttachment(threadId: string, file: AttachmentUpload): Promise<Attachment> {
    const form = new FormData();
    // The cast is React Native's: RN's FormData takes this object where the DOM
    // type demands a Blob, and there is no lib.dom-compatible spelling of it.
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    if (file.durationMs !== undefined) {
      form.append("duration_ms", String(Math.round(file.durationMs)));
    }

    const headers = await attachmentAuthHeaders();
    headers.Accept = "application/json";

    let response: Response;
    try {
      response = await fetch(`${config.apiBaseUrl}${THREADS_PATH}/${threadId}/attachments`, {
        method: "POST",
        headers,
        body: form,
      });
    } catch (cause) {
      throw new ApiError(
        cause instanceof Error ? cause.message : "Network request failed",
        0,
        "NETWORK_ERROR",
        cause,
      );
    }

    if (!response.ok) {
      // Same three-key envelope tolerance `client.parseError` has: FastAPI
      // emits `detail`, the gateway emits `error`.
      let message = `Upload failed with status ${response.status}`;
      try {
        const parsed = (await response.json()) as {
          detail?: unknown;
          error?: string;
          message?: string;
        };
        const detail = typeof parsed.detail === "string" ? parsed.detail : undefined;
        message = parsed.message ?? parsed.error ?? detail ?? message;
      } catch {
        // Not JSON. The status-based message stands.
      }
      throw new ApiError(message, response.status);
    }

    return toAttachment((await response.json()) as AttachmentOutWire);
  },

  /** Every attachment on a thread. `{ items }`, matching `ThreadList`. */
  async listAttachments(threadId: string): Promise<Attachment[]> {
    const res = await client.get<{ items: AttachmentOutWire[] }>(
      `${THREADS_PATH}/${threadId}/attachments`,
    );
    return (res.items ?? []).map(toAttachment);
  },

  /** Marks the thread read and returns the caller's participant row. */
  async markRead(threadId: string): Promise<ThreadParticipant> {
    return toParticipant(
      await client.post<ThreadParticipantOutWire>(`${THREADS_PATH}/${threadId}/read`, undefined),
    );
  },

  async createThread(input: CreateThreadInput): Promise<Thread> {
    return toThread(
      await client.post<ThreadOutWire>(THREADS_PATH, {
        subject: input.subject,
        source: input.source ?? "direct",
        participant_user_ids: input.participantUserIds ?? [],
        participant_roles: input.participantRoles ?? [],
        assigned_role: input.assignedRole ?? null,
        booking_id: input.bookingId ?? null,
      }),
    );
  },

  /** See `HandoffInput` — service/admin principals only. */
  async handoff(input: HandoffInput): Promise<Thread> {
    return toThread(
      await client.post<ThreadOutWire>(`${THREADS_PATH}/handoff`, {
        user_id: input.userId,
        assigned_role: input.assignedRole,
        subject: input.subject,
        summary: input.summary,
        booking_id: input.bookingId ?? null,
        locale: input.locale ?? "en",
      }),
    );
  },
};
