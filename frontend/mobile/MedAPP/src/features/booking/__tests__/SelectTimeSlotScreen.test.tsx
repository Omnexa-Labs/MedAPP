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
/** Strip index 3 — the seed's closed day, standing in for 756:4384's dashed Thu 15. */
const CLOSED_LABEL = "Fri 15 May";
const CLOSED_ISO = "2026-05-15";
const DAY_5 = "2026-05-16";
const DAY_5_LABEL = "Sat 16 May";

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
  practitionerName: "Dr. Sarah Jenkins",
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
    render(<SelectTimeSlotScreen />);

    const closed = screen.getByLabelText(`${CLOSED_LABEL}, unavailable`);
    expect(closed.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(closed);
    // Still on the default (first bookable) date.
    expect(stateOf(TODAY_LABEL).selected).toBe(true);
  });

  it("does not default onto the unavailable date", () => {
    render(<SelectTimeSlotScreen />);
    expect(
      screen.getByLabelText(`${CLOSED_LABEL}, unavailable`).props.accessibilityState.selected,
    ).toBe(false);
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
    expect(screen.getByLabelText("See calendar")).toBeTruthy();
    expect(screen.getByLabelText(TOMORROW_LABEL)).toBeTruthy();
    expect(screen.getByLabelText("Reason for visit")).toBeTruthy();
    // A rehydrated time cannot carry the user past a date with nothing to book.
    expect(stateOf("Book Now").disabled).toBe(true);
  });

  it("a date with no availability reaches the no-slots branch from the real hook", () => {
    mockParams = { date: CLOSED_ISO };
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
    expect(screen.getByText("Dr. Sarah Jenkins")).toBeTruthy();
    expect(screen.getByLabelText("Verified")).toBeTruthy();
  });

  it("keeps the docked CTA inside a KeyboardAvoidingView (758:2091)", () => {
    render(<SelectTimeSlotScreen />);
    const kav = screen.UNSAFE_getByType(
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      require("react-native").KeyboardAvoidingView,
    );
    expect(within(kav).getByLabelText("Book Now")).toBeTruthy();
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
