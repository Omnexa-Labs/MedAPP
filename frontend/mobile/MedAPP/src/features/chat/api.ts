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
//   * ATTACHMENTS. `ThreadMessageCreate` is `{ body }` — text only. There is no
//     upload endpoint anywhere in the product.
//
// Those four stay seeded and stay flagged. Everything else on this module is
// real.
//
// `is_internal` on a message is a clinician-only note — it must never render in
// a patient-facing thread. `isInternal` is carried through deliberately so a
// caller has to make that decision rather than leak it by default.

import { client } from "@/lib/api/client";

export const THREADS_PATH = "/v1/threads";

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

interface ThreadMessageOutWire {
  message_id: string;
  thread_id: string;
  sender_user_id: string | null;
  sender_role: string;
  body: string;
  is_internal: boolean;
  created_at: string;
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

function toMessage(w: ThreadMessageOutWire): ThreadMessage {
  return {
    id: w.message_id,
    threadId: w.thread_id,
    senderUserId: w.sender_user_id,
    senderRole: w.sender_role,
    body: w.body,
    isInternal: w.is_internal,
    createdAtIso: w.created_at,
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

  /** Text only — the service accepts `{ body }` and nothing else. */
  async sendMessage(threadId: string, body: string): Promise<ThreadMessage> {
    return toMessage(
      await client.post<ThreadMessageOutWire>(`${THREADS_PATH}/${threadId}/messages`, { body }),
    );
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
