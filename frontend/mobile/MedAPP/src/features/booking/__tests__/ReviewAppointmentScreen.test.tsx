// ReviewAppointmentScreen — the behaviour the design gate deliberately changed.
//
// Frames: 756:4213 (light), 756:4442 (submitting), 756:4586 (confirm-failed),
// 756:4765 (discard), 756:4813 (no-data).
//
// What is asserted here is not the markup — it is the four things a user can
// lose on this screen and did not use to be protected from:
//
//   1. abandoning a booking by accident (hardware back, "Cancel"),
//   2. being shown a booking nobody made (the deleted FALLBACK),
//   3. being told nothing when a confirmation fails (a user told nothing books
//      twice),
//   4. a "Directions" affordance that was decoration.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { BackHandler, Linking } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// The HTTP client is mocked as a MODULE, not spied on: importing it for real
// pulls in `@/lib/config`, which throws unless app.config.ts extras are present
// (the same reason LifestyleHubScreen.test.tsx mocks the store above the client).
jest.mock("@/lib/api/client", () => ({ client: { post: jest.fn() } }));

import { router, useLocalSearchParams } from "expo-router";
import { client } from "@/lib/api/client";

import { ReviewAppointmentScreen } from "../ReviewAppointmentScreen";

const post = client.post as unknown as jest.Mock;

let mockSessionCurrent = true;
jest.mock("@/hooks/use-session-scope", () => ({
  useSessionScope: () => ({ owner: "u1", revision: 1, isCurrent: () => mockSessionCurrent }),
}));

const PARAMS = {
  startsAtIso: "2025-05-13T10:00:00-04:00",
  endsAtIso: "2025-05-13T10:45:00-04:00",
  practitionerId: "prac-1",
  practitionerName: "Dr. Julian Sterling",
  practitionerSpecialty: "Senior Cardiologist",
  date: "2025-05-13",
  time: "10:00 AM",
  endTime: "10:45 AM",
  timezone: "EDT · Boston",
  mode: "in-person",
  type: "Standard Consultation",
  reason: "Chest pain",
  locationName: "MedApp Cardiology Center",
  locationAddress: "1 Seaport Blvd, Boston, MA 02210",
};

function withParams(overrides: Record<string, string | undefined> = {}) {
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue({
    ...PARAMS,
    ...overrides,
  });
}

let testQueryClient: QueryClient | undefined;

/** A fresh client per test: a shared one would carry mutation state between them. */
function renderScreen(node: ReactElement = <ReviewAppointmentScreen />) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: 0 }, queries: { retry: false } },
  });
  testQueryClient = queryClient;
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

/** The handler the screen registered with BackHandler, or null if it registered none. */
function hardwareBack(): (() => boolean) | null {
  const calls = (BackHandler.addEventListener as unknown as jest.Mock).mock.calls;
  const registered = calls.filter(([event]) => event === "hardwareBackPress");
  const last = registered[registered.length - 1];
  return last ? (last[1] as () => boolean) : null;
}

let removeSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionCurrent = true;
  removeSpy = jest.fn();
  jest
    .spyOn(BackHandler, "addEventListener")
    .mockReturnValue({ remove: removeSpy } as unknown as ReturnType<
      typeof BackHandler.addEventListener
    >);
  jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  withParams();
});

afterEach(() => {
  testQueryClient?.clear();
  testQueryClient = undefined;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Required item 3 — abandon
// ---------------------------------------------------------------------------

describe("abandoning the booking", () => {
  it('has no "Cancel": Edit and Cancel were the same function under two labels', () => {
    renderScreen();
    expect(screen.queryByLabelText(/cancel/i)).toBeNull();
    expect(screen.getAllByLabelText("Edit")).toHaveLength(1);
    expect(screen.getAllByLabelText("Confirm Booking")).toHaveLength(1);
  });

  it("routes the app-bar back through the discard dialog, not out of the screen", () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(screen.getByText("Discard this booking?")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it("mirrors it on Android hardware back, and CONSUMES the event", () => {
    renderScreen();
    const handler = hardwareBack();
    expect(handler).toBeTruthy();

    let consumed: boolean | undefined;
    act(() => {
      consumed = handler!();
    });

    // `return true` is the whole point: false pops the screen out from behind
    // the dialog it just opened.
    expect(consumed).toBe(true);
    expect(screen.getByText("Discard this booking?")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it("discards the whole journey exactly once", () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Go back"));
    fireEvent.press(screen.getByLabelText("Discard booking"));
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
  });

  it('"Keep editing" closes the dialog and navigates nowhere', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Go back"));
    fireEvent.press(screen.getByLabelText("Keep editing"));
    expect(screen.queryByText("Discard this booking?")).toBeNull();
    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("removes the hardware-back handler on unmount", () => {
    const view = renderScreen();
    view.unmount();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('"Edit" goes back so screen 1 can rehydrate — it does not dismiss', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Edit"));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismissAll).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Required item 1 — consultation mode
// ---------------------------------------------------------------------------

describe("consultation mode is its own axis", () => {
  it("in-person shows the address and a Directions action", () => {
    renderScreen();
    expect(screen.getByText("MedApp Cardiology Center")).toBeTruthy();
    expect(screen.getByText("1 Seaport Blvd, Boston, MA 02210")).toBeTruthy();
    expect(screen.getByLabelText("Directions")).toBeTruthy();
  });

  it("video shows the consultation block and NO Directions", () => {
    withParams({ mode: "video" });
    renderScreen();
    expect(screen.queryByLabelText("Directions")).toBeNull();
    expect(screen.getByText("Video consultation")).toBeTruthy();
  });

  it("opens the persisted booking so confirmation reloads its saved mode", async () => {
    // The response's `mode`, not the route param this screen was handed. They
    // agree here — `confirm` posts the param — but the confirmation screen says
    // "your video consultation is confirmed" about the row that now exists, so it
    // must read the row.
    post.mockResolvedValue({ booking_id: "video-booking", mode: "video" });
    withParams({ mode: "video" });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { bookingId: "video-booking" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Required item 5 — the map is replaced by a real handoff
// ---------------------------------------------------------------------------

describe("Directions", () => {
  it("opens a maps URL carrying the encoded address, and renders no map image", async () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText("Directions"));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    const url = (Linking.openURL as unknown as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("1 Seaport Blvd, Boston, MA 02210"));
    expect(screen.queryByLabelText("Map of clinic")).toBeNull();
  });

  it("falls back to https when no native maps handler claims the scheme", async () => {
    (Linking.canOpenURL as unknown as jest.Mock).mockResolvedValue(false);
    renderScreen();
    fireEvent.press(screen.getByLabelText("Directions"));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
    expect((Linking.openURL as unknown as jest.Mock).mock.calls[0][0]).toContain(
      "https://www.google.com/maps/search/",
    );
  });

  it("survives a rejected handoff — openURL rejects when nothing claims the URL", async () => {
    (Linking.openURL as unknown as jest.Mock).mockRejectedValue(new Error("no handler"));
    renderScreen();
    fireEvent.press(screen.getByLabelText("Directions"));
    await waitFor(() =>
      expect((Linking.openURL as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(0),
    );
    // Still on the screen, not an unhandled rejection mid-booking.
    expect(screen.getByLabelText("Confirm Booking")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The async confirm — 756:4442 / 756:4586
// ---------------------------------------------------------------------------

describe("confirming", () => {
  it("submitting: Edit is disabled, the CTA says Confirming… and is busy", async () => {
    let release: ((value: unknown) => void) | undefined;
    post.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));

    await waitFor(() => expect(screen.getByLabelText("Confirming…")).toBeTruthy());
    expect(screen.getByLabelText("Confirming…").props.accessibilityState.busy).toBe(true);
    expect(screen.getByLabelText("Edit").props.accessibilityState.disabled).toBe(true);
    // A maps handoff mid-commit backgrounds the app under the request.
    expect(screen.queryByLabelText("Directions")).toBeNull();

    await act(async () => {
      release?.({});
    });
  });

  it("suppresses back while the request is in flight — dismissAll would orphan it", async () => {
    let release: ((value: unknown) => void) | undefined;
    post.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(screen.getByLabelText("Confirming…")).toBeTruthy());

    let consumed: boolean | undefined;
    act(() => {
      consumed = hardwareBack()!();
    });
    expect(consumed).toBe(true);
    expect(screen.queryByText("Discard this booking?")).toBeNull();
    expect(router.dismissAll).not.toHaveBeenCalled();

    await act(async () => {
      release?.({});
    });
  });

  // The endpoint this screen used to post to — `/v1/appointments` — is not
  // routed by the gateway and does not exist behind it, so every real Confirm
  // 404'd. These two tests are the ones that would have caught it: they assert
  // the PATH and the BODY, the only parts of a mocked-client test that can.
  it("posts the real booking route with a BookingCreate body", async () => {
    post.mockResolvedValue({
      booking_id: "b-1",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:45:00-04:00",
    });

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(post).toHaveBeenCalled());

    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/v1/bookings");
    expect(body.doctor_id).toBe("prac-1");
    expect(body.reason).toBe("Chest pain");
    // Offset-bearing, not naive: the service rejects naive datetimes outright.
    expect(body.starts_at).toMatch(/^2025-05-13T10:00:00[+-]\d{2}:\d{2}$/);
    expect(body.ends_at).toMatch(/^2025-05-13T10:45:00[+-]\d{2}:\d{2}$/);
    // MODE IS SENT NOW — `BookingCreate.mode` exists, and the default fixture is
    // an in-person booking. It used to be dropped here with `type`.
    expect(body.mode).toBe("in_person");
    // TYPE still has no column, and is still not smuggled into `notes`.
    expect(body.consultation_type).toBeUndefined();
    expect(body.type).toBeUndefined();
    expect(body.notes).toBeUndefined();
  });

  it("posts the VIDEO mode when that is what the user picked on screen 1", async () => {
    // The whole point of the change: the choice made on `select-time-slot`
    // reaches the row instead of being displayed twice and stored never.
    withParams({ mode: "video" });
    post.mockResolvedValue({
      booking_id: "b-2",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:45:00-04:00",
      mode: "video",
      room_id: "27db4d6b-2533-4afa-b807-2c14a4a621cd",
    });

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(post).toHaveBeenCalled());

    expect(post.mock.calls[0][1].mode).toBe("video");

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const arg = (router.replace as unknown as jest.Mock).mock.calls[0][0];
    expect(Object.keys(arg.params)).toEqual(["bookingId"]);
    // The room handle is NOT carried onto the confirmation screen: that screen
    // has no join affordance (550:1826 puts it on the appointment card, which
    // reads the room itself), and a spare handle on a screen that cannot use it
    // is what later becomes a fabricated link. And no `joinUrl` is synthesised
    // from it either — `telemedicine_service` has no URL concept.
    expect(arg.params).not.toHaveProperty("roomId");
    expect(arg.params).not.toHaveProperty("joinUrl");
  });

  it("forwards only the saved booking ID for confirmation to reload", async () => {
    post.mockResolvedValue({
      booking_id: "3f1a...",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:45:00-04:00",
    });

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());

    const call = (router.replace as unknown as jest.Mock).mock.calls[0][0];
    expect(call.pathname).toBe("/(app)/booking-confirmed");
    expect(call.params).toEqual({ bookingId: "3f1a..." });
    // `booking_reference` and `join_url` exist nowhere in the backend. Nothing
    // is forwarded for them, and `booking_id` is NOT laundered into a
    // human-readable "reference" the clinic could never look up.
    expect("bookingReference" in call.params).toBe(false);
    expect("joinUrl" in call.params).toBe(false);
    expect(call.params.bookingId).toBe("3f1a...");
  });

  it("failed: says what happened, says nothing was charged, offers another time", async () => {
    post.mockRejectedValue(Object.assign(new Error("taken"), { status: 409 }));

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));

    await waitFor(() => expect(screen.getByText("That slot was just taken")).toBeTruthy());
    expect(screen.getByText(/Nothing has been charged/)).toBeTruthy();
    expect(screen.getByLabelText("Choose another time")).toBeTruthy();
    // The bar becomes Edit | Try again — the user is not stranded.
    expect(screen.getByLabelText("Try again")).toBeTruthy();
    expect(screen.getByLabelText("Edit")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Choose another time"));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("does not claim the slot was taken when the request merely failed", async () => {
    post.mockRejectedValue(Object.assign(new Error("offline"), { status: 0 }));

    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));

    await waitFor(() => expect(screen.getByText("We couldn't confirm this booking")).toBeTruthy());
    expect(screen.queryByText("That slot was just taken")).toBeNull();
    expect(screen.getByText(/Check My Appointments before retrying/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 756:4813 — the deleted FALLBACK
// ---------------------------------------------------------------------------

describe("missing params", () => {
  it("says the session expired instead of inventing an appointment", () => {
    (useLocalSearchParams as unknown as jest.Mock).mockReturnValue({});
    renderScreen();

    expect(screen.getByText("This booking session has expired")).toBeTruthy();
    expect(screen.getByLabelText("Start again")).toBeTruthy();
    // No docked bar: there is nothing to confirm.
    expect(screen.queryByLabelText("Confirm Booking")).toBeNull();
    expect(screen.queryByLabelText("Secure encrypted checkout")).toBeNull();
    // None of the deleted fallback survives anywhere in the tree.
    expect(screen.queryByText(/Dr\. Julian Sterling/)).toBeNull();
    expect(screen.queryByText(/Rochester/)).toBeNull();
    expect(screen.queryByText(/45 Minutes/)).toBeNull();
  });

  it("refuses a session with no practitioner id — doctor_id is required", () => {
    // Without it there is no bookable appointment, only a Confirm button that
    // would 422 every time. The expired frame is the honest answer.
    withParams({ practitionerId: undefined });
    renderScreen();
    expect(screen.getByText("This booking session has expired")).toBeTruthy();
    expect(screen.queryByLabelText("Confirm Booking")).toBeNull();
  });

  it("treats an unrecognised mode as absent rather than guessing", () => {
    withParams({ mode: "telepathy" });
    renderScreen();
    expect(screen.getByText("This booking session has expired")).toBeTruthy();
  });

  it("starts the journey over from the expired screen", () => {
    (useLocalSearchParams as unknown as jest.Mock).mockReturnValue({});
    renderScreen();
    fireEvent.press(screen.getByLabelText("Start again"));
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Provenance — a badge is a claim about where a value came from
// ---------------------------------------------------------------------------

describe("provider-supplied values", () => {
  it('renders Duration WITHOUT a "From provider" badge — no provider supplied it', () => {
    withParams({ duration: "45 Minutes" });
    renderScreen();
    expect(screen.getByText("45 Minutes")).toBeTruthy();
    // The badge is a PROVENANCE claim and the value has no provenance: screen 1
    // derives the duration from `SEED_SLOTS`, eleven times typed into a bundled
    // file, because `/v1/slots` does not exist. This file's header already
    // records deleting the badge once, when it sat over a hardcoded "45
    // Minutes"; the hardcoding then moved one module away and the badge came
    // back with it. The row stays — the duration is a real consequence of the
    // slot picked — the certificate does not.
    expect(screen.queryByText("From provider")).toBeNull();
  });

  it("omits the whole Duration row when no duration was supplied", () => {
    renderScreen();
    expect(screen.queryByText("Duration")).toBeNull();
  });

  it("carries no provenance badge anywhere in the tree", () => {
    withParams({ duration: "45 Minutes", timezone: "EDT · Boston", feeCents: "12000" });
    renderScreen();
    expect(screen.queryByText("From provider")).toBeNull();
  });

  it("shows the timezone badge only when a timezone came with the slot", () => {
    renderScreen();
    expect(screen.getByText("EDT · Boston")).toBeTruthy();
    expect(screen.getByText("10:00 AM – 10:45 AM")).toBeTruthy();
  });

  it("degrades to the start time alone when no end time or zone arrived", () => {
    withParams({ endTime: undefined, timezone: undefined });
    renderScreen();
    expect(screen.getByText("10:00 AM")).toBeTruthy();
    expect(screen.queryByText("EDT · Boston")).toBeNull();
  });

  it("formats the ISO date at the leaf, and passes anything else through", () => {
    renderScreen();
    expect(screen.getByText("Tuesday, 13 May 2025")).toBeTruthy();
  });

  // The duration param is a DISPLAY string ("45 Minutes"); the wire wants an
  // `ends_at`. These pin the conversion, and — the point — that an unreadable
  // label is not turned into a number.
  it("preserves the slot end when a display duration differs", async () => {
    post.mockResolvedValue({
      booking_id: "b-1",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T11:15:00-04:00",
    });
    withParams({ endTime: undefined, duration: "1 hr 15 min" });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].ends_at).toBe(PARAMS.endsAtIso);
  });

  it("preserves the slot end when a display duration is unreadable", async () => {
    post.mockResolvedValue({
      booking_id: "b-1",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:30:00-04:00",
    });
    withParams({ endTime: undefined, duration: "about an hour" });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    // 30, the DEFAULT_SLOT_MINUTES floor — not 60 guessed off the word "hour".
    expect(post.mock.calls[0][1].ends_at).toBe(PARAMS.endsAtIso);
  });

  it("prefers a real end time over the duration label", async () => {
    post.mockResolvedValue({
      booking_id: "b-1",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:45:00-04:00",
    });
    withParams({ endTime: "10:45 AM", duration: "1 hr 15 min" });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].ends_at).toMatch(/^2025-05-13T10:45:00[+-]\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// Identity — 756:4213's rating and tags, answered ONCE
//
// Screen 1 held a private `SEED_RATING = { 4.9, 1200 }` and this screen showed
// no rating at all, so one clinician had two ratings and one of them was minted
// on device. Both screens now read the same two params, which is what makes
// them unable to disagree. What is asserted here is that this screen renders
// what it is HANDED and mints nothing.
// ---------------------------------------------------------------------------

describe("practitioner identity", () => {
  it("renders the rating and tags the params carry", () => {
    withParams({ rating: "4.8", reviewCount: "326", tags: "Cardiology,Top Rated" });
    renderScreen();
    expect(screen.getByLabelText("4.8 out of 5, 326 reviews")).toBeTruthy();
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getByText("Top Rated")).toBeTruthy();
  });

  it("shows no rating and no tags when none were supplied — it invents neither", () => {
    renderScreen();
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
    expect(screen.queryByText("Top Rated")).toBeNull();
    // Specifically not screen 1's seed, which is what the drift looked like.
    expect(screen.queryByText("4.9")).toBeNull();
    expect(screen.queryByText(/1200 reviews/)).toBeNull();
  });

  it("drops a rating with no review count rather than rendering (NaN reviews)", () => {
    withParams({ rating: "4.8" });
    renderScreen();
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("treats an out-of-range or unparseable rating as absent, never clamped", () => {
    for (const rating of ["7.2", "-1", "excellent"]) {
      withParams({ rating, reviewCount: "326" });
      const view = renderScreen();
      expect(screen.queryByLabelText(/out of 5/)).toBeNull();
      view.unmount();
    }
  });

  it("rejects a fractional review count", () => {
    withParams({ rating: "4.8", reviewCount: "326.5" });
    renderScreen();
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
  });

  it("does not put a rating on screen 3, which has no place to draw one", async () => {
    post.mockResolvedValue({
      booking_id: "b-1",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:45:00-04:00",
    });
    withParams({ rating: "4.8", reviewCount: "326", tags: "Cardiology,Top Rated" });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());

    const { params } = (router.replace as unknown as jest.Mock).mock.calls[0][0];
    expect("rating" in params).toBe(false);
    expect("reviewCount" in params).toBe(false);
    expect("tags" in params).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The checkout theatre, and the price that was actually available all along
// ---------------------------------------------------------------------------
// The screen asserted "a $10 processing fee may apply" and labelled its commit
// bar "Secure encrypted checkout" — over a flow with no payment step, no amount,
// no card and no `payment_service` call, against a backend where payments are
// simulated and no provider is integrated. Meanwhile the one real money fact in
// the system, `consultation_fee_cents`, was on the doctor wire and dropped by
// `adaptDoctor`, so a patient confirmed a medical appointment having been shown
// an invented fee in the wrong currency and never the actual price.

describe("money", () => {
  it("states no fee amount of its own, in any currency", () => {
    renderScreen();
    expect(screen.queryByText(/\$10/)).toBeNull();
    expect(screen.queryByText(/processing fee/i)).toBeNull();
    // `$` at all: the seeded roster bills in Ghana, so a dollar sign was wrong
    // even before the amount was.
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("asks the clinic for actual cancellation terms", () => {
    renderScreen();
    expect(screen.getByText(/Contact the clinic about fees and cancellation terms/)).toBeTruthy();
  });

  it("advertises no checkout", () => {
    renderScreen();
    expect(screen.queryByText(/checkout/i)).toBeNull();
    expect(screen.queryByText(/encrypted/i)).toBeNull();
  });

  it("renders the consultation fee in MAJOR units — the wire is cents", () => {
    withParams({ feeCents: "12000" });
    renderScreen();

    // 12000 cents is 120.00, not 12,000. docs/api/README.md lists "Money is in
    // CENTS on doctors and nurses — a raw render is 100x the price" as a known
    // trap on this exact column.
    expect(screen.getByText("GHS 120.00")).toBeTruthy();
    expect(screen.queryByText(/12000/)).toBeNull();
    expect(screen.getByText("Consultation fee")).toBeTruthy();
  });

  it("always shows two minor digits, so 12050 is not 120.5", () => {
    withParams({ feeCents: "12050" });
    renderScreen();
    expect(screen.getByText("GHS 120.50")).toBeTruthy();
  });

  it("omits the row entirely when no fee was recorded", () => {
    renderScreen();
    // Null on the column means "no fee set", which is NOT a free consultation —
    // so nothing is rendered rather than "GHS 0.00".
    expect(screen.queryByText("Consultation fee")).toBeNull();
  });

  it("treats an unreadable amount as absent rather than rounding it into a price", () => {
    for (const bad of ["", "  ", "abc", "-500", "120.5"]) {
      withParams({ feeCents: bad });
      const { unmount } = renderScreen();
      expect(screen.queryByText("Consultation fee")).toBeNull();
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
describe("atomic rescheduling", () => {
  const response = {
    booking_id: "b-new",
    user_id: "u-1",
    status: "booked",
    doctor_id: "prac-1",
    starts_at: PARAMS.startsAtIso,
    ends_at: PARAMS.endsAtIso,
    mode: "in_person",
  };
  it("uses one reschedule request and confirms its stored result", async () => {
    withParams({ rescheduleOfId: "b-old" });
    post.mockResolvedValue(response);
    renderScreen();
    expect(screen.getByText(/original appointment stays booked/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe("/v1/bookings/b-old/reschedule");
    expect((router.replace as jest.Mock).mock.calls[0][0].params.bookingId).toBe("b-new");
  });
  it("does not send a separate cancellation on failure", async () => {
    withParams({ rescheduleOfId: "b-old" });
    post.mockRejectedValue(Object.assign(new Error("taken"), { status: 409 }));
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(screen.getByText("That slot was just taken")).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("requires authoritative instants when restoring an old route", () => {
    withParams({ startsAtIso: undefined });
    renderScreen();
    expect(screen.getByText("This booking session has expired")).toBeTruthy();
  });
  it("suppresses late success after an account switch and prevents double taps", async () => {
    let resolve!: (value: typeof response) => void;
    post.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    mockSessionCurrent = false;
    await act(async () => resolve(response));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
