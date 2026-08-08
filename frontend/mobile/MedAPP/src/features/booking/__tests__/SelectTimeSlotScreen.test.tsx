// SelectTimeSlotScreen — the behaviour this pass changed.
//
// Separate from BookingJourneyShell.test.tsx on purpose: that file asserts the
// SHELL rules that hold for all three booking screens (one detail bar, no tab
// set), and those assertions are shared. This file asserts what is specific to
// step 1 — rehydration, the Consultation Mode axis, the unavailable/disabled
// states, the loading/empty branches, and what the screen PUSHES — and it needs
// a per-test params mock that the shared file has no use for.
//
// Two of the suites below exist because of defects that shipped green:
//
//   THE PUSH. Screen 2 reads fourteen params; this screen sent nine. Its
//   Location section, its Directions action, its Duration row and its time
//   range + timezone badge were therefore dead in every real run, and the only
//   reason nothing failed is that screen 2's own tests hand it those params
//   directly. A test that supplies both ends of a handoff cannot tell you the
//   handoff is missing — so the push assertions here name every param screen 2
//   reads, and the threading tests drive them from the availability payload.
//
//   THE CLOCK. The date strip was anchored to a typed-out "2025-05-12" and the
//   tests asserted "Tue 13 May", so the suite passed for fifteen months while
//   the picker offered nothing but dates `booking_service` rejects. Time is now
//   pinned with a fake clock, and the expectations are named days relative to
//   THAT clock — which is what makes "the strip starts today" assertable at all.

import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { Slot, SlotsResult } from "../hooks/use-booking-availability";

// `mock`-prefixed so Jest's factory hoisting allows the reference.
let mockParams: Record<string, string> = {};
let mockSlotsResult: SlotsResult | null = null;

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// Only `useSlots` is swapped; `useDateStrip` stays real, so the date assertions
// run against the same derivation the screen ships with.
jest.mock("../hooks/use-booking-availability", () => {
  const actual = jest.requireActual("../hooks/use-booking-availability");
  return {
    ...actual,
    useSlots: (practitionerId: string | undefined, dateIso: string): SlotsResult =>
      mockSlotsResult ?? actual.useSlots(practitionerId, dateIso),
  };
});

import { router } from "expo-router";
import { SelectTimeSlotScreen } from "../SelectTimeSlotScreen";

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------
// Tue 12 May 2026, 08:00 local — before the seed grid's first slot, so "today"
// is fully bookable and the past-slot rule below can be turned on deliberately
// rather than depending on when the suite happens to run.
//
// Only `Date` is faked. Faking the timer functions as well breaks RNTL's act()
// flushing, and nothing here needs them.
const NOW = new Date(2026, 4, 12, 8, 0, 0);

/** The six tiles the strip must draw, anchored at TODAY = NOW. */
const TODAY = "2026-05-12";
const TODAY_LABEL = "Tue 12 May";
const TOMORROW = "2026-05-13";
const TOMORROW_LABEL = "Wed 13 May";
const DAY_3_LABEL = "Thu 14 May";
const DAY_5 = "2026-05-16";
const DAY_5_LABEL = "Sat 16 May";

/**
 * A clock AFTER the seed grid's last slot (05:00 PM), so TODAY has nothing left
 * to book.
 *
 * This replaces `CLOSED_LABEL`/`CLOSED_ISO`, which pointed at
 * `SEED_CLOSED_STRIP_INDEX = 3` — a constant that closed the fourth day of every
 * strip, for every clinician, forever. 756:4384 draws Thu 15 dashed, and one
 * clinic's diary had been typed out as if it were every clinic's; a patient was
 * told a doctor does not work on a day nobody had asked the doctor about. It is
 * deleted, so the unavailable-date branch is now reached the one way this app
 * can DERIVE rather than assert: the service requires `starts_at` in the future,
 * so a day whose every slot has already started has nothing bookable left on it.
 */
const AFTER_LAST_SLOT = new Date(2026, 4, 12, 19, 0, 0);

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "setImmediate",
      "clearImmediate",
      "nextTick",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "performance",
      "hrtime",
    ],
  });
});

afterAll(() => {
  jest.useRealTimers();
});

const FULL_PARAMS = {
  practitionerId: "8f1a1f0e-6c5a-4a2f-9a1f-9b0e1d2c3a45",
  // Seeded roster only — an invented clinician in a fixture is how the name
  // spread into three screens in the first place.
  practitionerName: "Dr. Kwabena Osei",
  practitionerSpecialty: "Senior Cardiologist",
  date: TOMORROW,
  time: "10:00 AM",
  mode: "video",
  type: "Follow-up Visit",
  reason: "Chest pain",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.setSystemTime(NOW);
  mockParams = {};
  mockSlotsResult = null;
});

/** accessibilityState as the tree reports it, by accessible name. */
function stateOf(label: string) {
  return screen.getByLabelText(label).props.accessibilityState;
}

/** The params object handed to `router.push`. */
function pushedParams(): Record<string, string> {
  return (router.push as jest.Mock).mock.calls[0][0].params;
}

// ---------------------------------------------------------------------------
// Rehydration (required item 2)
// ---------------------------------------------------------------------------

describe("rehydration", () => {
  it("restores every choice the review screen sends back", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);

    expect(stateOf(TOMORROW_LABEL).selected).toBe(true);
    expect(stateOf("10:00 AM").selected).toBe(true);
    expect(stateOf("Video").selected).toBe(true);
    expect(stateOf("Follow-up Visit").selected).toBe(true);
    expect(screen.getByLabelText("Reason for visit").props.value).toBe("Chest pain");
  });

  it("rehydrates only what it was given — a different date wins over the default", () => {
    mockParams = { date: DAY_5 };
    render(<SelectTimeSlotScreen />);

    expect(stateOf(DAY_5_LABEL).selected).toBe(true);
    expect(stateOf(TODAY_LABEL).selected).toBe(false);
  });

  it("pre-selects NO slot and NO type when it is given none, and disables the CTA", () => {
    render(<SelectTimeSlotScreen />);

    for (const slot of ["09:00 AM", "10:00 AM", "10:45 AM", "01:30 PM"]) {
      expect(stateOf(slot).selected).toBe(false);
    }
    for (const type of ["Standard Consultation", "Follow-up Visit"]) {
      expect(stateOf(type).selected).toBe(false);
    }
    expect(stateOf("Book Now").disabled).toBe(true);
  });

  it("does not navigate while the CTA is disabled", () => {
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("round-trips: a new slot goes out, the untouched choices come along", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);

    fireEvent.press(screen.getByLabelText("10:45 AM"));
    fireEvent.press(screen.getByLabelText("Book Now"));

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(app)/review-appointment",
        params: expect.objectContaining({
          time: "10:45 AM",
          date: TOMORROW,
          mode: "video",
          type: "Follow-up Visit",
          reason: "Chest pain",
        }),
      }),
    );
  });

  it("clears the slot when the date changes, so a stale time cannot be booked", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);

    fireEvent.press(screen.getByLabelText(DAY_3_LABEL));

    expect(stateOf("10:00 AM").selected).toBe(false);
    expect(stateOf("Book Now").disabled).toBe(true);
  });

  it("sends an ISO date, never a re-typeset one with a hardcoded month", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    expect(pushedParams().date).toBe(TOMORROW);
    expect(pushedParams().date).not.toMatch(/May/);
  });
});

// ---------------------------------------------------------------------------
// The date strip anchors to TODAY
//
// It was pinned to "2025-05-12" — the date in the frame, typed out as if it were
// data. Every tile the picker offered was in the past, and `booking_service`
// rejects a `starts_at` that is not in the future, so the whole picker was
// unbookable. Nothing failed: the tests asserted the frozen labels.
// ---------------------------------------------------------------------------

describe("the strip starts today", () => {
  it("opens on today and offers no past date", () => {
    render(<SelectTimeSlotScreen />);

    expect(stateOf(TODAY_LABEL).selected).toBe(true);
    // The day before today is not drawn at all.
    expect(screen.queryByLabelText("Mon 11 May")).toBeNull();
    for (const label of [TODAY_LABEL, TOMORROW_LABEL, DAY_3_LABEL, DAY_5_LABEL]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("pushes today's real ISO date, not a date from a frame", () => {
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("10:45 AM"));
    fireEvent.press(screen.getByLabelText("Standard Consultation"));
    fireEvent.press(screen.getByLabelText("Book Now"));

    expect(pushedParams().date).toBe(TODAY);
  });

  it("marks today's slots that have already started unavailable", () => {
    // 10:30 — 09:00 and 10:00 have gone, 10:45 has not.
    jest.setSystemTime(new Date(2026, 4, 12, 10, 30, 0));
    render(<SelectTimeSlotScreen />);

    expect(screen.getByLabelText("09:00 AM, unavailable")).toBeTruthy();
    expect(screen.getByLabelText("10:00 AM, unavailable")).toBeTruthy();
    expect(stateOf("10:45 AM").disabled).toBeFalsy();
  });

  it("leaves a later day's identical slots bookable", () => {
    jest.setSystemTime(new Date(2026, 4, 12, 10, 30, 0));
    mockParams = { date: TOMORROW };
    render(<SelectTimeSlotScreen />);

    expect(screen.queryByLabelText("09:00 AM, unavailable")).toBeNull();
    expect(stateOf("09:00 AM").disabled).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// What screen 2 is sent (required item 5, and the Duration / timezone blocks)
// ---------------------------------------------------------------------------

const PAYLOAD_WITH_CLINIC: SlotsResult = {
  slots: [
    { time: "10:00 AM", endTime: "10:45 AM", period: "Morning", available: true },
    { time: "11:30 AM", endTime: "12:45 PM", period: "Morning", available: true },
  ],
  isLoading: false,
  timezoneLabel: "EDT · Boston",
  location: { name: "Boston Medical Center", address: "1 Boston Medical Center Pl, Boston, MA" },
};

describe("the handoff to screen 2", () => {
  it("threads the timezone, the end time, the duration and the location", () => {
    mockSlotsResult = PAYLOAD_WITH_CLINIC;
    mockParams = { ...FULL_PARAMS, mode: "in-person" };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    expect(pushedParams()).toEqual(
      expect.objectContaining({
        time: "10:00 AM",
        endTime: "10:45 AM",
        timezone: "EDT · Boston",
        duration: "45 minutes",
        locationName: "Boston Medical Center",
        locationAddress: "1 Boston Medical Center Pl, Boston, MA",
      }),
    );
  });

  it("derives the duration from the payload's own two instants, over an hour too", () => {
    mockSlotsResult = PAYLOAD_WITH_CLINIC;
    mockParams = { ...FULL_PARAMS, time: "11:30 AM" };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    // Read back by screen 2's `parseDurationMinutes` as 75.
    expect(pushedParams().duration).toBe("1 hr 15 min");
  });

  it("sends the seed grid's own end time, so `ends_at` is not an assumed 30 minutes", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    expect(pushedParams().endTime).toBe("10:30 AM");
    expect(pushedParams().duration).toBe("30 minutes");
  });

  it("omits what the payload does not carry — never the string \"undefined\"", () => {
    mockSlotsResult = {
      slots: [{ time: "10:00 AM", period: "Morning", available: true }],
      isLoading: false,
    };
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    const params = pushedParams();
    for (const key of ["endTime", "timezone", "duration", "locationName", "locationAddress"]) {
      expect(params).not.toHaveProperty(key);
    }
    expect(Object.values(params)).not.toContain("undefined");
  });

  it("sends the practitioner id — `doctor_id` is a required UUID on the wire", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    expect(pushedParams().practitionerId).toBe(FULL_PARAMS.practitionerId);
  });
});

// ---------------------------------------------------------------------------
// The rating is the practitioner's, or it is nothing
//
// `SEED_RATING = { value: 4.9, count: 1200 }` rendered a score and a review
// count beside a named clinician. Both were typed into the screen.
// ---------------------------------------------------------------------------

describe("practitioner rating", () => {
  it("renders the rating the payload states", () => {
    mockParams = { ...FULL_PARAMS, practitionerRating: "4.8", practitionerReviewCount: "326" };
    render(<SelectTimeSlotScreen />);

    expect(screen.getByLabelText("4.8 out of 5, 326 reviews")).toBeTruthy();
  });

  it("renders NO rating when the payload has none", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);

    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
    expect(screen.queryByText("4.9")).toBeNull();
    expect(screen.queryByText(/reviews/)).toBeNull();
  });

  it("renders no rating from half a rating, or from a value out of range", () => {
    mockParams = { ...FULL_PARAMS, practitionerRating: "4.8" };
    render(<SelectTimeSlotScreen />);
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
    screen.unmount();

    mockParams = { ...FULL_PARAMS, practitionerRating: "7.4", practitionerReviewCount: "326" };
    render(<SelectTimeSlotScreen />);
    // Not clamped to 5 — a clamped score is still a made-up score.
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Consultation Mode (required item 1)
// ---------------------------------------------------------------------------

describe("consultation mode", () => {
  it("defaults to in-person and emits the axis", () => {
    mockParams = { ...FULL_PARAMS, mode: undefined as unknown as string };
    render(<SelectTimeSlotScreen />);

    expect(stateOf("In person").selected).toBe(true);
    fireEvent.press(screen.getByLabelText("Book Now"));
    expect(pushedParams().mode).toBe("in-person");
  });

  it("is a SEPARATE axis from consultation type — switching one keeps the other", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);

    fireEvent.press(screen.getByLabelText("In person"));

    expect(stateOf("In person").selected).toBe(true);
    expect(stateOf("Follow-up Visit").selected).toBe(true);

    fireEvent.press(screen.getByLabelText("Book Now"));
    expect(pushedParams().mode).toBe("in-person");
    expect(pushedParams().type).toBe("Follow-up Visit");
  });

  it("ignores a mode param that is not one of the two", () => {
    mockParams = { ...FULL_PARAMS, mode: "carrier-pigeon" };
    render(<SelectTimeSlotScreen />);
    expect(stateOf("In person").selected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Availability is fabricated, and the screen says so
// ---------------------------------------------------------------------------
// `/v1/slots` does not exist — the gateway has no availability route and
// booking_service exposes only the four booking endpoints — so the grid is
// `SEED_SLOTS`, eleven times typed into a bundled file. `POST /v1/bookings` IS
// real. That combination is the defect: a patient books a slot no clinician ever
// offered, and nothing on screen suggests otherwise.
//
// It cannot be made real from this side, so the honest form is to say it. The
// notice is driven by `isProvisional` off the payload rather than hardcoded into
// the screen, which means the real `useSlots` deletes it by returning false —
// nobody has to remember.

describe("provisional availability", () => {
  it("warns that the times are not confirmed with the clinician", () => {
    render(<SelectTimeSlotScreen />);
    expect(screen.getByText(/aren't confirmed with the clinician yet/)).toBeTruthy();
  });

  it("puts the warning ABOVE the chips, not after the choice", () => {
    render(<SelectTimeSlotScreen />);
    // A caveat read after the tap is a caveat read after the decision, so the
    // order in the tree is the assertion — `findAll` walks it depth-first.
    const notice = screen.getByText(/aren't confirmed with the clinician yet/);
    const chip = screen.getByLabelText("10:45 AM");
    const order = screen.UNSAFE_root.findAll(
      (node: (typeof notice) | (typeof chip)) => node === notice || node === chip,
    );
    expect(order[0]).toBe(notice);
  });

  it("disappears the moment the payload says the grid is real", () => {
    // What a live /v1/slots response looks like: `isProvisional` false (or
    // absent). The notice must not outlive the fabrication it describes.
    mockSlotsResult = {
      slots: [{ time: "10:00 AM", period: "Morning", available: true }],
      isLoading: false,
      isProvisional: false,
    };
    render(<SelectTimeSlotScreen />);
    expect(screen.queryByText(/aren't confirmed with the clinician yet/)).toBeNull();
  });

  it("does not sit over a skeleton", () => {
    mockSlotsResult = { slots: [], isLoading: true, isProvisional: true };
    render(<SelectTimeSlotScreen />);
    // Nothing has been offered yet, so there is nothing to caveat.
    expect(screen.queryByText(/aren't confirmed with the clinician yet/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pass-through params: the fee, and the booking being replaced
// ---------------------------------------------------------------------------

describe("what this screen carries but never renders", () => {
  it("threads the consultation fee to screen 2, still in minor units", () => {
    mockParams = { ...FULL_PARAMS, practitionerFeeCents: "12000" };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    // Exactly one place divides by 100, and it is the screen that prints it.
    expect(pushedParams().feeCents).toBe("12000");
    // Not rendered here: this screen has no place for a price, and 756:4384
    // draws none.
    expect(screen.queryByText(/120/)).toBeNull();
  });

  it("threads the booking a reschedule replaces", () => {
    mockParams = { ...FULL_PARAMS, rescheduleOfId: "b-old" };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    // Screen 2 is the only screen that can act on it — it is what turns a second
    // booking into a replacement.
    expect(pushedParams().rescheduleOfId).toBe("b-old");
  });

  it("forwards neither when neither was supplied", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);
    fireEvent.press(screen.getByLabelText("Book Now"));

    // `defined()` strips them — expo-router would otherwise serialise the string
    // "undefined", and screen 2 would cancel a booking with that id.
    expect(pushedParams()).not.toHaveProperty("feeCents");
    expect(pushedParams()).not.toHaveProperty("rescheduleOfId");
  });
});

// ---------------------------------------------------------------------------
// Unavailable is not colour-only (required item 7)
// ---------------------------------------------------------------------------

describe("unavailable states", () => {
  it("announces an unavailable slot and refuses the press", () => {
    render(<SelectTimeSlotScreen />);

    // 756:4384 draws 09:30 AM and 02:00 PM dashed.
    const taken = screen.getByLabelText("09:30 AM, unavailable");
    expect(taken.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(taken);
    expect(taken.props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText("02:00 PM, unavailable")).toBeTruthy();
  });

  it("announces an unavailable date and refuses the press", () => {
    // Today, after the last slot has started: nothing left to book, derived from
    // the service's own future-only rule.
    jest.setSystemTime(AFTER_LAST_SLOT);
    render(<SelectTimeSlotScreen />);

    const closed = screen.getByLabelText(`${TODAY_LABEL}, unavailable`);
    expect(closed.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(closed);
    // Still on the default (first bookable) date, which is tomorrow.
    expect(stateOf(TOMORROW_LABEL).selected).toBe(true);
  });

  it("does not default onto the unavailable date", () => {
    jest.setSystemTime(AFTER_LAST_SLOT);
    render(<SelectTimeSlotScreen />);
    expect(
      screen.getByLabelText(`${TODAY_LABEL}, unavailable`).props.accessibilityState.selected,
    ).toBe(false);
  });

  it("closes NO day by assertion — every other tile in the strip is bookable", () => {
    // The deleted `SEED_CLOSED_STRIP_INDEX`. It dashed the strip's fourth tile
    // for every clinician in the product, which is an invented day off.
    render(<SelectTimeSlotScreen />);

    for (const label of [TODAY_LABEL, TOMORROW_LABEL, DAY_3_LABEL, "Fri 15 May", DAY_5_LABEL]) {
      expect(screen.queryByLabelText(`${label}, unavailable`)).toBeNull();
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// State frames: loading 757:5286, no-slots 757:5597
// ---------------------------------------------------------------------------

describe("state branches", () => {
  it("loading renders no slot chips and a disabled CTA", () => {
    mockSlotsResult = { slots: [], isLoading: true };
    render(<SelectTimeSlotScreen />);

    expect(screen.queryByLabelText("10:00 AM")).toBeNull();
    expect(screen.queryByText("Morning")).toBeNull();
    // The rest of the form stays live — only the data-backed blocks are skeletons.
    expect(screen.getByLabelText("In person")).toBeTruthy();
    expect(screen.getByLabelText("Reason for visit")).toBeTruthy();
    expect(stateOf("Book Now").disabled).toBe(true);
  });

  it("no slots keeps the rest of the form and disables the CTA", () => {
    mockSlotsResult = { slots: [], isLoading: false };
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);

    expect(screen.getByText(/No slots on/)).toBeTruthy();
    // The date strip, which is the escape that exists and sits directly above.
    expect(screen.getByLabelText(TOMORROW_LABEL)).toBeTruthy();
    expect(screen.getByText(/Pick another date in the strip above/)).toBeTruthy();
    expect(screen.getByLabelText("Reason for visit")).toBeTruthy();
    // A rehydrated time cannot carry the user past a date with nothing to book.
    expect(stateOf("Book Now").disabled).toBe(true);
  });

  it("offers no dead calendar button — it was this state's ONLY way out", () => {
    // 757:5597 draws a "See calendar" button and `openCalendar` was `() => {}`.
    // On a day with no times the patient had exactly one affordance and pressing
    // it did nothing at all. The full-month picker has no frame and no route.
    mockSlotsResult = { slots: [], isLoading: false };
    render(<SelectTimeSlotScreen />);
    expect(screen.queryByLabelText("See calendar")).toBeNull();
  });

  it("offers no dead calendar shortcut in the Select Date header either", () => {
    render(<SelectTimeSlotScreen />);
    expect(screen.queryByLabelText("See Calendar")).toBeNull();
  });

  it("a date whose slots have all started reaches no-slots from the real hook", () => {
    // Derived, not asserted: `starts_at` must be in the future, so a today past
    // its last slot genuinely has nothing bookable.
    jest.setSystemTime(AFTER_LAST_SLOT);
    mockParams = { date: TODAY };
    render(<SelectTimeSlotScreen />);
    expect(screen.getByText(/No slots on/)).toBeTruthy();
  });

  it("renders one group per period, from the data", () => {
    const slots: Slot[] = [
      { time: "08:00 AM", period: "Early", available: true },
      { time: "08:30 AM", period: "Early", available: false },
    ];
    mockSlotsResult = { slots, isLoading: false };
    render(<SelectTimeSlotScreen />);

    expect(screen.getByText("Early")).toBeTruthy();
    expect(screen.queryByText("Morning")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reconciliations the frames forced (G3 / G7 / G14 / KAV)
// ---------------------------------------------------------------------------

describe("frame reconciliation", () => {
  it("has an EMPTY app-bar action slot — no stranger's photo", () => {
    render(<SelectTimeSlotScreen />);
    expect(screen.queryByLabelText("Your profile")).toBeNull();
  });

  it("draws the practitioner through the shared row, with a real fallback", () => {
    mockParams = { ...FULL_PARAMS };
    render(<SelectTimeSlotScreen />);
    expect(screen.getByText("Dr. Kwabena Osei")).toBeTruthy();
    expect(screen.getByLabelText("Verified")).toBeTruthy();
  });

  it("keeps the docked CTA inside the keyboard inset (758:2091)", () => {
    // Was KeyboardAvoidingView. That component infers the keyboard from a window
    // resize, and Android edge-to-edge no longer resizes the window — proven on
    // device, where the chat composer stayed buried even with behavior="padding".
    // The intent of this test is unchanged: the docked CTA must ride up with the
    // keyboard rather than sit under it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { KeyboardInset } = require("@/components/ui");
    render(<SelectTimeSlotScreen />);
    const inset = screen.UNSAFE_getByType(KeyboardInset);
    expect(within(inset).getByLabelText("Book Now")).toBeTruthy();
  });

  it("carries no colour literal, no icon-library import, and no frozen date or rating", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const read = (file: string) =>
      fs
        .readFileSync(path.join(__dirname, "..", file), "utf8")
        // Comments are stripped first, deliberately: the files' DELETED blocks
        // NAME what they removed, and that record is the point — a guard that
        // forbade writing them down would delete the evidence along with the bug.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    const screenSource = read("SelectTimeSlotScreen.tsx");
    // These survived three prior passes precisely because nothing failed when
    // they were added.
    expect(screenSource).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(screenSource).not.toMatch(/from "@expo\/vector-icons"/);
    expect(screenSource).not.toMatch(/px-gutter/);
    // The rating is the payload's. No score and no review count in the source.
    expect(screenSource).not.toMatch(/SEED_RATING/);
    expect(screenSource).not.toMatch(/\b4\.9\b/);
    expect(screenSource).not.toMatch(/\b1200\b/);

    // And no calendar date typed into the availability seed: an anchor in the
    // source is an anchor in the past by the time anyone books against it.
    const hookSource = read(path.join("hooks", "use-booking-availability.ts"));
    expect(hookSource).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
