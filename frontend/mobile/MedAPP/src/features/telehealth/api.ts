// Telemedicine API — telemedicine_service, `/v1/rooms`.
//
// ---------------------------------------------------------------------------
// THERE IS NO "LIST MY ROOMS" ENDPOINT, AND NONE IS NEEDED
// ---------------------------------------------------------------------------
// `GET /v1/rooms` returns 405; the `GET /` in the service is its root handler,
// not a collection. Rooms are reached BY ID, and the app already has the id:
// `BookingOut.room_id` carries it, so a video appointment knows its own room.
//
// Verified live: `GET /v1/rooms/{unknown}` returns `404 {"detail":"room not
// found"}`, so the service is reachable and authorising correctly.
//
// ---------------------------------------------------------------------------
// THE TOKEN IS THE ONLY THING THAT ACTUALLY STARTS A CALL
// ---------------------------------------------------------------------------
// `GET /{id}/token` returns `{ room_id, token, expires_at }`. It EXPIRES, so it
// must be fetched when the user joins rather than cached with the room — a
// token collected on the appointments screen and used ten minutes later may be
// dead on arrival.
//
// What the token is FOR is not defined by this service: there is no provider
// SDK wired anywhere in the app (no Twilio, no Daily, no LiveKit). So the
// waiting room and consultation screens can be driven by this API — status,
// join, leave, end, in-call chat — but the actual VIDEO has no transport yet.
// That is the honest limit, and it is why `joinRoom` is separate from any
// notion of "connect".
//
// ---------------------------------------------------------------------------
// JOIN / LEAVE ARE PARTICIPATION RECORDS, NOT CONNECTION STATE
// ---------------------------------------------------------------------------
// `RoomJoinOut` carries `joined_at` and `left_at`. They are an audit trail of
// who was in a consultation and when — which matters clinically — not a
// realtime presence signal. Nothing pushes; a screen polls or re-reads.

import { client } from "@/lib/api/client";

export const ROOMS_PATH = "/v1/rooms";

export type RoomStatus = "scheduled" | "active" | "ended" | string;

interface RoomWire {
  room_id: string;
  booking_id: string;
  room_name: string;
  status: RoomStatus;
  scheduled_for: string | null;
  ended_at: string | null;
  recording_enabled: boolean;
  created_by_user_id: string;
}

interface TokenWire {
  room_id: string;
  token: string;
  expires_at: string;
}

interface JoinWire {
  room_id: string;
  user_id: string;
  role: string;
  joined_at: string | null;
  left_at: string | null;
}

interface RoomMessageWire {
  message_id: string;
  room_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
}

export interface Room {
  id: string;
  bookingId: string;
  name: string;
  /** Free text on the wire despite the enum; do not switch exhaustively. */
  status: RoomStatus;
  scheduledForIso: string | null;
  endedAtIso: string | null;
  /**
   * Whether the consultation is being recorded.
   *
   * A recorded medical consultation needs explicit, visible consent — this flag
   * must be surfaced to BOTH parties, not just honoured silently.
   */
  recordingEnabled: boolean;
  createdByUserId: string;
}

export interface RoomToken {
  roomId: string;
  token: string;
  /** Short-lived. Fetch at join time, never cache alongside the room. */
  expiresAtIso: string;
}

export interface RoomParticipant {
  roomId: string;
  userId: string;
  role: string;
  joinedAtIso: string | null;
  leftAtIso: string | null;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderUserId: string;
  body: string;
  createdAtIso: string;
}

const toRoom = (w: RoomWire): Room => ({
  id: w.room_id,
  bookingId: w.booking_id,
  name: w.room_name,
  status: w.status,
  scheduledForIso: w.scheduled_for ?? null,
  endedAtIso: w.ended_at ?? null,
  recordingEnabled: w.recording_enabled,
  createdByUserId: w.created_by_user_id,
});

const toParticipant = (w: JoinWire): RoomParticipant => ({
  roomId: w.room_id,
  userId: w.user_id,
  role: w.role,
  joinedAtIso: w.joined_at ?? null,
  leftAtIso: w.left_at ?? null,
});

const toMessage = (w: RoomMessageWire): RoomMessage => ({
  id: w.message_id,
  roomId: w.room_id,
  senderUserId: w.sender_user_id,
  body: w.body,
  createdAtIso: w.created_at,
});

export const telehealthApi = {
  /** `GET /v1/rooms/{id}`. 404s for an unknown room — verified live. */
  async getRoom(roomId: string): Promise<Room> {
    return toRoom(await client.get<RoomWire>(`${ROOMS_PATH}/${roomId}`));
  },

  /** Fetch at JOIN time. The token expires; see the header. */
  async getToken(roomId: string): Promise<RoomToken> {
    const w = await client.get<TokenWire>(`${ROOMS_PATH}/${roomId}/token`);
    return { roomId: w.room_id, token: w.token, expiresAtIso: w.expires_at };
  },

  async joinRoom(roomId: string): Promise<RoomParticipant> {
    return toParticipant(await client.post<JoinWire>(`${ROOMS_PATH}/${roomId}/join`, undefined));
  },

  async leaveRoom(roomId: string): Promise<RoomParticipant> {
    return toParticipant(await client.post<JoinWire>(`${ROOMS_PATH}/${roomId}/leave`, undefined));
  },

  /**
   * ENDS THE CONSULTATION FOR EVERYONE, not just the caller.
   *
   * Distinct from `leaveRoom`, and the difference matters: a patient dropping
   * off should leave, not end. Kept separate so a caller cannot confuse them.
   */
  async endRoom(roomId: string): Promise<Room> {
    return toRoom(await client.post<RoomWire>(`${ROOMS_PATH}/${roomId}/end`, undefined));
  },

  /** In-call chat. A BARE ARRAY, like inbox messages — not `{ items }`. */
  async listMessages(roomId: string): Promise<RoomMessage[]> {
    const w = await client.get<RoomMessageWire[]>(`${ROOMS_PATH}/${roomId}/messages`);
    return (w ?? []).map(toMessage);
  },

  async sendMessage(roomId: string, body: string): Promise<RoomMessage> {
    return toMessage(
      await client.post<RoomMessageWire>(`${ROOMS_PATH}/${roomId}/messages`, { body }),
    );
  },
};
