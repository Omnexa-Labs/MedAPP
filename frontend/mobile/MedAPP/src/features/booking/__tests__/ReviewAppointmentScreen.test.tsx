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

const PARAMS = {
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

/** A fresh client per test: a shared one would carry mutation state between them. */
function renderScreen(node: ReactElement = <ReviewAppointmentScreen />) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: 0 }, queries: { retry: false } },
  });
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

afterEach(() => jest.restoreAllMocks());

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

  it("forwards mode to the confirmation screen", async () => {
    post.mockResolvedValue({});
    withParams({ mode: "video" });
    renderScreen();
    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ mode: "video" }),
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
    // Fields the backend has no column for are dropped, not smuggled.
    expect(body.mode).toBeUndefined();
    expect(body.consultation_type).toBeUndefined();
    expect(body.notes).toBeUndefined();
  });

  it("forwards the SERVER's instants and invents no reference or join link", async () => {
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
    expect(call.params.startsAtIso).toBe("2025-05-13T10:00:00-04:00");
    expect(call.params.endsAtIso).toBe("2025-05-13T10:45:00-04:00");
    // `booking_reference` and `join_url` exist nowhere in the backend. Nothing
    // is forwarded for them, and `booking_id` is NOT laundered into a
    // human-readable "reference" the clinic could never look up.
    expect("bookingReference" in call.params).toBe(false);
    expect("joinUrl" in call.params).toBe(false);
    expect(JSON.stringify(call.params)).not.toContain("3f1a");
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
    expect(screen.getByText(/nothing has been charged/i)).toBeTruthy();
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
  it('renders Duration with "From provider" only when a duration was supplied', () => {
    withParams({ duration: "45 Minutes" });
    renderScreen();
    expect(screen.getByText("45 Minutes")).toBeTruthy();
    expect(screen.getByText("From provider")).toBeTruthy();
  });

  it("omits the whole Duration row when it was not", () => {
    renderScreen();
    expect(screen.queryByText("Duration")).toBeNull();
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
  it("turns a displayed duration into a real window when there is no end time", async () => {
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
    expect(post.mock.calls[0][1].ends_at).toMatch(/^2025-05-13T11:15:00[+-]\d{2}:\d{2}$/);
  });

  it("lets api.ts apply its documented default when the label is unreadable", async () => {
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
    expect(post.mock.calls[0][1].ends_at).toMatch(/^2025-05-13T10:30:00[+-]\d{2}:\d{2}$/);
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
// The contract with screen 1 — what a REAL user currently reaches
//
// Every test above hands this screen params that screen 1 does not yet push.
// That is the right way to exercise a branch, and it is also exactly how a
// fabricated endpoint passed 595 tests: a suite that supplies its own inputs
// cannot tell you the caller supplies them too. This block pins the gap so a
// green run stops implying those rows are live for anyone.
// ---------------------------------------------------------------------------

/** `SelectTimeSlotScreen.proceedToReview`'s params-out, verbatim. */
const SCREEN_1_PARAMS_OUT = {
  practitionerId: "prac-1",
  practitionerName: "Dr. Julian Sterling",
  practitionerSpecialty: "Senior Cardiologist",
  practitionerAvatar: undefined,
  date: "2025-05-13",
  time: "10:00 AM",
  mode: "in-person",
  type: "Standard Consultation",
  reason: "Chest pain",
};

describe("what screen 1 actually sends today", () => {
  beforeEach(() => {
    (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(SCREEN_1_PARAMS_OUT);
  });

  it("reviews and books the appointment on those nine params alone", async () => {
    post.mockResolvedValue({
      booking_id: "b-1",
      user_id: "u-1",
      status: "booked",
      doctor_id: "prac-1",
      starts_at: "2025-05-13T10:00:00-04:00",
      ends_at: "2025-05-13T10:30:00-04:00",
    });

    renderScreen();
    // Not the expired frame: the six required params are all present.
    expect(screen.queryByText("This booking session has expired")).toBeNull();
    expect(screen.getByText("Tuesday, 13 May 2025")).toBeTruthy();
    expect(screen.getByText("10:00 AM")).toBeTruthy();
    expect(screen.getByText("Standard Consultation")).toBeTruthy();
    expect(screen.getByText("Chest pain")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Confirm Booking"));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(post.mock.calls[0][0]).toBe("/v1/bookings");
  });

  it("KNOWN GAP: six designed rows are unreachable until screen 1 forwards them", () => {
    renderScreen();
    // Location card + Directions  — needs locationName / locationAddress
    expect(screen.queryByLabelText("Directions")).toBeNull();
    // Duration + "From provider"  — needs duration
    expect(screen.queryByText("From provider")).toBeNull();
    // Time range and zone badge   — needs endTime / timezone
    expect(screen.queryByText(/–/)).toBeNull();
    expect(screen.queryByText(/EDT/)).toBeNull();
    // Rating and tags (756:4213)  — needs rating / reviewCount / tags
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
    // ...and none of them is faked to fill the hole. docs/PIPELINE.md §5.
  });
});

// ---------------------------------------------------------------------------
// Regression guard — the literals survived three prior passes
// ---------------------------------------------------------------------------

describe("the source itself", () => {
  const source = readFileSync(
    join(__dirname, "..", "ReviewAppointmentScreen.tsx"),
    "utf8",
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");

  it("carries no colour literal", () => {
    expect(code.match(/#[0-9a-fA-F]{6}/g)).toBeNull();
    expect(code.match(/rgba?\(/g)).toBeNull();
  });

  it("imports no icon library — Icon.tsx is the only file allowed to", () => {
    expect(code).not.toContain("@expo/vector-icons");
  });

  it("keeps no shadow but the dialog's, which is a sanctioned floating role", () => {
    // One useTokenShadow call, and it is the dialog's.
    expect(code.match(/useTokenShadow\(/g)).toHaveLength(1);
    expect(code).toContain("dialogShadow");
  });

  it("has no fabricated appointment left in it", () => {
    expect(code).not.toContain("FALLBACK");
    expect(code).not.toMatch(/lh3\.googleusercontent/);
  });
});
