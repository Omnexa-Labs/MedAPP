// The booking API boundary.
//
// This file exists because of the specific way the previous pass failed: the
// confirm call posted to `/v1/appointments`, a route the gateway does not have
// and no service behind it defines, and 595 tests passed over it because every
// one of them mocked `@/lib/api/client` and asserted on what the SCREEN did.
// A test that mocks the boundary cannot tell you the boundary is wrong — unless
// it asserts the two things the mock still sees: the path and the body.
//
// So that is what is asserted here, against the contract read out of
// `backend/services/booking_service/`:
//   POST /v1/bookings  <- BookingCreate { doctor_id, starts_at, ends_at,
//                                         reason?(<=255), notes? }
// with `create_booking` requiring BOTH datetimes timezone-aware and
// `starts_at < ends_at`.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn() },
}));

import { client } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import { bookingApi } from "../api";

const post = client.post as unknown as jest.Mock;

const OK = {
  booking_id: "1c9e0f24-0000-4000-8000-000000000001",
  user_id: "1c9e0f24-0000-4000-8000-000000000002",
  status: "booked" as const,
  doctor_id: "1c9e0f24-0000-4000-8000-000000000003",
  starts_at: "2025-05-13T10:00:00-04:00",
  ends_at: "2025-05-13T10:30:00-04:00",
};

const BASE = {
  doctorId: OK.doctor_id,
  date: "2025-05-13",
  time: "10:00 AM",
};

beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue(OK);
});

/** The body of the single POST this module made. */
function body(): Record<string, string> {
  return post.mock.calls[0][1] as Record<string, string>;
}

describe("the route", () => {
  it("posts to /v1/bookings — the route the gateway actually maps", async () => {
    await bookingApi.createBooking(BASE);
    expect(post.mock.calls[0][0]).toBe("/v1/bookings");
  });

  it("no file in src/features/booking mentions the invented /v1/appointments", () => {
    const dir = join(__dirname, "..");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(readFileSync(join(dir, f), "utf8")).not.toContain("/v1/appointments\"");
    }
  });
});

describe("the BookingCreate body", () => {
  it("sends exactly the fields the schema declares", async () => {
    await bookingApi.createBooking({ ...BASE, reason: "  Chest pain  " });
    expect(Object.keys(body()).sort()).toEqual(["doctor_id", "ends_at", "reason", "starts_at"]);
    expect(body().doctor_id).toBe(OK.doctor_id);
    expect(body().reason).toBe("Chest pain");
  });

  it("omits an empty reason rather than sending a blank string", async () => {
    await bookingApi.createBooking({ ...BASE, reason: "   " });
    expect("reason" in body()).toBe(false);
  });

  it("keeps a >255-char reason in full by carrying the overflow in notes", async () => {
    const long = "a".repeat(300);
    await bookingApi.createBooking({ ...BASE, reason: long });
    // The service caps `reason` at 255; nothing is silently truncated away.
    expect(body().reason).toHaveLength(255);
    expect(body().notes).toBe(long);
  });

  it("refuses to post without a doctor — doctor_id is a required UUID", async () => {
    await expect(bookingApi.createBooking({ ...BASE, doctorId: "" })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("fails on the device rather than posting a garbled time", async () => {
    await expect(
      bookingApi.createBooking({ ...BASE, time: "half past ten" }),
    ).rejects.toMatchObject({ status: 0 });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("starts_at / ends_at", () => {
  /** Local-parts constructor — the same zone the composer works in. */
  const local = (h: number, m: number) => new Date(2025, 4, 13, h, m, 0, 0).getTime();

  it("is timezone-aware — a naive datetime is rejected by create_booking", async () => {
    await bookingApi.createBooking(BASE);
    expect(body().starts_at).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(body().ends_at).toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it("names the wall-clock the user picked, in the zone the device is in", async () => {
    await bookingApi.createBooking(BASE);
    expect(body().starts_at).toContain("2025-05-13T10:00:00");
    // And it is the right INSTANT, not just the right string.
    expect(new Date(body().starts_at).getTime()).toBe(local(10, 0));
  });

  it("reads 12-hour and 24-hour clocks, and midnight/noon correctly", async () => {
    await bookingApi.createBooking({ ...BASE, time: "12:00 AM", endTime: "12:30 AM" });
    expect(new Date(body().starts_at).getTime()).toBe(local(0, 0));
    post.mockClear();

    await bookingApi.createBooking({ ...BASE, time: "12:00 PM", endTime: "12:30 PM" });
    expect(new Date(body().starts_at).getTime()).toBe(local(12, 0));
    post.mockClear();

    await bookingApi.createBooking({ ...BASE, time: "14:30" });
    expect(new Date(body().starts_at).getTime()).toBe(local(14, 30));
  });

  it("does NOT drift a day west of Greenwich (bare-ISO strings parse as UTC)", async () => {
    await bookingApi.createBooking(BASE);
    expect(body().starts_at.slice(0, 10)).toBe("2025-05-13");
    expect(new Date(body().starts_at).getDate()).toBe(13);
  });

  it("prefers a real end time over any assumption", async () => {
    await bookingApi.createBooking({ ...BASE, endTime: "10:45 AM", durationMinutes: 15 });
    expect(new Date(body().ends_at).getTime()).toBe(local(10, 45));
  });

  it("uses the provider duration when only a start arrived", async () => {
    await bookingApi.createBooking({ ...BASE, durationMinutes: 45 });
    expect(new Date(body().ends_at).getTime()).toBe(local(10, 45));
  });

  it("falls back to the documented 30-minute default when neither exists", async () => {
    await bookingApi.createBooking(BASE);
    expect(new Date(body().ends_at).getTime()).toBe(local(10, 30));
  });

  it("never posts a window the service would reject: ends_at > starts_at always", async () => {
    // An end that is not after the start (parse artefact, or a slot crossing
    // midnight — which no frame draws) falls through to the duration rule.
    await bookingApi.createBooking({ ...BASE, endTime: "9:00 AM" });
    expect(new Date(body().ends_at).getTime()).toBeGreaterThan(
      new Date(body().starts_at).getTime(),
    );
    expect(new Date(body().ends_at).getTime()).toBe(local(10, 30));
  });
});

describe("the BookingOut adapter", () => {
  it("returns camelCase and no invented fields", async () => {
    const booking = await bookingApi.createBooking(BASE);
    expect(booking).toEqual({
      bookingId: OK.booking_id,
      userId: OK.user_id,
      status: "booked",
      doctorId: OK.doctor_id,
      startsAtIso: OK.starts_at,
      endsAtIso: OK.ends_at,
      reason: undefined,
      notes: undefined,
      cancelledAtIso: undefined,
      cancellationReason: undefined,
      // Stored fields, not invented ones: `mode` is NOT NULL on the table with
      // `server_default 'in_person'`, and `room_id` is null unless a room was
      // provisioned.
      mode: "in-person",
      roomId: undefined,
    });
    // The two fields the previous pass invented are not on the type and are not
    // synthesised from booking_id. `roomId` is not a rehabilitation of
    // `joinUrl` — it is a handle the service actually returns, and nothing here
    // turns it into a URL.
    expect("bookingReference" in booking).toBe(false);
    expect("joinUrl" in booking).toBe(false);
  });

  // -------------------------------------------------------------------------
  // mode + room_id — the choice that used to be discarded at this boundary
  // -------------------------------------------------------------------------

  it("SENDS the mode the user picked, in the service's own spelling", async () => {
    await bookingApi.createBooking({ ...BASE, mode: "video" });
    // Hyphen in the app, UNDERSCORE on the wire — `mode: "in-person"` is a 422
    // reading "Input should be 'in_person' or 'video'".
    await bookingApi.createBooking({ ...BASE, mode: "in-person" });

    expect(post.mock.calls[0][1]).toMatchObject({ mode: "video" });
    expect(post.mock.calls[1][1]).toMatchObject({ mode: "in_person" });
  });

  it("OMITS mode when the caller has none, leaving the server's default", async () => {
    // `BookingCreate.mode` is `= IN_PERSON`. Posting "in_person" for "the flow
    // did not say" would turn an absence into an assertion and put the default
    // in two places.
    await bookingApi.createBooking(BASE);
    expect("mode" in body()).toBe(false);
  });

  it("reads mode and room_id back off the response", async () => {
    post.mockResolvedValue({
      ...OK,
      mode: "video",
      room_id: "27db4d6b-2533-4afa-b807-2c14a4a621cd",
    });
    const booking = await bookingApi.createBooking({ ...BASE, mode: "video" });
    expect(booking.mode).toBe("video");
    expect(booking.roomId).toBe("27db4d6b-2533-4afa-b807-2c14a4a621cd");
  });

  it("keeps a video booking VIDEO when the room could not be provisioned", async () => {
    // A real state, not a contrivance: `provision_room` never raises, so the
    // booking 201s with `room_id: null` when telemedicine is unreachable. The
    // client must not read the missing room as "in person" — that would hide the
    // visit's modality entirely.
    post.mockResolvedValue({ ...OK, mode: "video", room_id: null });
    const booking = await bookingApi.createBooking({ ...BASE, mode: "video" });
    expect(booking.mode).toBe("video");
    expect(booking.roomId).toBeUndefined();
  });

  it("falls back to in person on an absent or unknown mode, never to video", async () => {
    // The errors are not symmetric. "In person" on a video booking sends someone
    // travelling, which a phone call fixes; "video" on an in-person booking tells
    // them to stay home waiting for a session that does not exist.
    post.mockResolvedValue({ ...OK, mode: undefined });
    expect((await bookingApi.createBooking(BASE)).mode).toBe("in-person");

    post.mockResolvedValue({ ...OK, mode: "telehealth" });
    expect((await bookingApi.createBooking(BASE)).mode).toBe("in-person");
  });

  it("collapses null free-text to undefined", async () => {
    post.mockResolvedValue({ ...OK, reason: null, notes: "  ", cancelled_at: null });
    const booking = await bookingApi.createBooking(BASE);
    expect(booking.reason).toBeUndefined();
    expect(booking.notes).toBeUndefined();
    expect(booking.cancelledAtIso).toBeUndefined();
  });

  it("lets the service's own errors through untouched", async () => {
    post.mockRejectedValue(new ApiError("doctor is already booked", 400));
    await expect(bookingApi.createBooking(BASE)).rejects.toMatchObject({ status: 400 });
  });
});

describe("the rest of the surface", () => {
  it("cancels against POST /v1/bookings/{id}/cancel", async () => {
    post.mockResolvedValue({ ...OK, status: "cancelled" });
    const booking = await bookingApi.cancelBooking(OK.booking_id, "Feeling better");
    expect(post.mock.calls[0][0]).toBe(`/v1/bookings/${OK.booking_id}/cancel`);
    expect(post.mock.calls[0][1]).toEqual({ cancellation_reason: "Feeling better" });
    expect(booking.status).toBe("cancelled");
  });

  it("lists against GET /v1/bookings", async () => {
    (client.get as unknown as jest.Mock).mockResolvedValue({ items: [OK] });
    const items = await bookingApi.listBookings();
    expect((client.get as unknown as jest.Mock).mock.calls[0][0]).toBe("/v1/bookings");
    expect(items[0].bookingId).toBe(OK.booking_id);
  });
});
