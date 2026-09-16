import { client, type RequestOptions } from "@/lib/api/client";
import { ApiError } from "@/types/api";

export type BookingMode = "in-person" | "video";
export interface CreateBookingPayload {
  doctorId: string;
  startsAtIso: string;
  endsAtIso: string;
  reason?: string;
  notes?: string;
  mode?: BookingMode;
}
interface BookingWire {
  booking_id: string;
  user_id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled";
  reason?: string | null;
  notes?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  mode?: "in_person" | "video";
  room_id?: string | null;
}
export interface Booking {
  bookingId: string;
  userId: string;
  doctorId: string;
  startsAtIso: string;
  endsAtIso: string;
  status: "booked" | "cancelled";
  reason?: string;
  notes?: string;
  cancelledAtIso?: string;
  cancellationReason?: string;
  mode: BookingMode;
  roomId?: string;
}
export interface AvailableSlot {
  doctorId: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
}
function text(value?: string | null) {
  return value?.trim() || undefined;
}
function adapt(b: BookingWire): Booking {
  return {
    bookingId: b.booking_id,
    userId: b.user_id,
    doctorId: b.doctor_id,
    startsAtIso: b.starts_at,
    endsAtIso: b.ends_at,
    status: b.status,
    reason: text(b.reason),
    notes: text(b.notes),
    cancelledAtIso: text(b.cancelled_at),
    cancellationReason: text(b.cancellation_reason),
    mode: b.mode === "video" ? "video" : "in-person",
    roomId: text(b.room_id),
  };
}
export function validInstant(value?: string): boolean {
  return !!value && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function body(payload: CreateBookingPayload) {
  if (
    !text(payload.doctorId) ||
    !validInstant(payload.startsAtIso) ||
    !validInstant(payload.endsAtIso) ||
    Date.parse(payload.endsAtIso) <= Date.parse(payload.startsAtIso)
  ) {
    throw new ApiError("Choose a current clinician slot before booking.", 0);
  }
  const reason = text(payload.reason);
  const notes = text(payload.notes);
  return {
    doctor_id: payload.doctorId,
    // Preserve the exact instants. Display clocks never become network values.
    starts_at: payload.startsAtIso,
    ends_at: payload.endsAtIso,
    reason: reason?.slice(0, 255),
    notes: reason && reason.length > 255 ? [reason, notes].filter(Boolean).join("\n\n") : notes,
    ...(payload.mode ? { mode: payload.mode === "video" ? "video" : "in_person" } : {}),
  };
}
export const BOOKINGS_PATH = "/v1/bookings";
export const bookingApi = {
  async listSlots(
    doctorId: string,
    date: string,
    options?: RequestOptions,
  ): Promise<AvailableSlot[]> {
    const query = new URLSearchParams({ doctor_id: doctorId, from_date: date, to_date: date });
    const result = await client.get<{
      items: { doctor_id: string; starts_at: string; ends_at: string; timezone: string }[];
    }>(`${BOOKINGS_PATH}/slots?${query}`, options);
    return result.items.map((s) => ({
      doctorId: s.doctor_id,
      startsAtIso: s.starts_at,
      endsAtIso: s.ends_at,
      timezone: s.timezone,
    }));
  },
  async createBooking(payload: CreateBookingPayload, options?: RequestOptions): Promise<Booking> {
    return adapt(await client.post<BookingWire>(BOOKINGS_PATH, body(payload), options));
  },
  async rescheduleBooking(
    id: string,
    payload: CreateBookingPayload,
    options?: RequestOptions,
  ): Promise<Booking> {
    return adapt(
      await client.post<BookingWire>(
        `${BOOKINGS_PATH}/${encodeURIComponent(id)}/reschedule`,
        body(payload),
        options,
      ),
    );
  },
  async listBookings(options?: RequestOptions): Promise<Booking[]> {
    const result = await client.get<{ items: BookingWire[] }>(BOOKINGS_PATH, options);
    return result.items.map(adapt);
  },
  async getBooking(id: string, options?: RequestOptions): Promise<Booking> {
    return adapt(
      await client.get<BookingWire>(`${BOOKINGS_PATH}/${encodeURIComponent(id)}`, options),
    );
  },
  async cancelBooking(id: string, reason?: string, options?: RequestOptions): Promise<Booking> {
    return adapt(
      await client.post<BookingWire>(
        `${BOOKINGS_PATH}/${encodeURIComponent(id)}/cancel`,
        { cancellation_reason: text(reason) ?? null },
        options,
      ),
    );
  },
};
