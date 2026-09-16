jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn(), post: jest.fn() } }));
import { client } from "@/lib/api/client";
import { bookingApi, type CreateBookingPayload } from "../api";
const post = client.post as jest.Mock;
const get = client.get as jest.Mock;
const payload: CreateBookingPayload = {
  doctorId: "d1",
  startsAtIso: "2030-05-13T10:00:00+05:30",
  endsAtIso: "2030-05-13T10:30:00+05:30",
  mode: "video",
};
const wire = {
  booking_id: "b1",
  user_id: "u1",
  doctor_id: "d1",
  starts_at: payload.startsAtIso,
  ends_at: payload.endsAtIso,
  status: "booked",
  mode: "video",
  room_id: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue(wire);
});
it("preserves offset-bearing server instants and mode", async () => {
  const booking = await bookingApi.createBooking(payload);
  expect(post.mock.calls[0][0]).toBe("/v1/bookings");
  expect(post.mock.calls[0][1]).toMatchObject({
    starts_at: payload.startsAtIso,
    ends_at: payload.endsAtIso,
    mode: "video",
  });
  expect(booking.roomId).toBeUndefined();
  expect(booking.mode).toBe("video");
});
it.each(["", "2030-05-13T10:00:00", "bad"])(
  "rejects missing or naive slot instant %s",
  async (startsAtIso) => {
    await expect(bookingApi.createBooking({ ...payload, startsAtIso })).rejects.toThrow(
      "Choose a current",
    );
    expect(post).not.toHaveBeenCalled();
  },
);
it("rejects reversed windows", async () => {
  await expect(
    bookingApi.createBooking({ ...payload, endsAtIso: payload.startsAtIso }),
  ).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});
it("keeps a long visit reason in notes", async () => {
  const reason = "x".repeat(300);
  await bookingApi.createBooking({ ...payload, reason, notes: "additional" });
  expect(post.mock.calls[0][1].reason).toHaveLength(255);
  expect(post.mock.calls[0][1].notes).toBe(`${reason}\n\nadditional`);
});
it("reschedules through one request with the session guard", async () => {
  const options = { isSessionCurrent: () => true };
  await bookingApi.rescheduleBooking("b1", payload, options);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][0]).toBe("/v1/bookings/b1/reschedule");
  expect(post.mock.calls[0][2]).toBe(options);
});
it("reads actual free slots with a cancellable request", async () => {
  const options = { signal: new AbortController().signal };
  get.mockResolvedValue({
    items: [
      {
        doctor_id: "d1",
        starts_at: payload.startsAtIso,
        ends_at: payload.endsAtIso,
        timezone: "Asia/Kolkata",
      },
    ],
  });
  const slots = await bookingApi.listSlots("d1", "2030-05-13", options);
  expect(get.mock.calls[0][0]).toBe(
    "/v1/bookings/slots?doctor_id=d1&from_date=2030-05-13&to_date=2030-05-13",
  );
  expect(get.mock.calls[0][1]).toBe(options);
  expect(slots[0].startsAtIso).toBe(payload.startsAtIso);
});
