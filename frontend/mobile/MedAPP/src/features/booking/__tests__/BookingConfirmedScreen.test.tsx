// BookingConfirmedScreen — the terminal screen of the booking flow.
//
// Figma 756:4742 (light) · 757:5181 (dark) · 757:4828 (video). Build spec §4.
//
// Every assertion below is one of the four things this screen owns, and each of
// them was a live defect rather than a restyle:
//
//   item 4  the booking reference. The frame draws `MED-8R4K-2210`; the backend
//           has no such field, so the row is GONE rather than guarded. These
//           tests now pin the absence at the SOURCE level too — a guarded row
//           behind a param nothing can set is how this screen shipped a feature
//           that had never once rendered.
//   item 9  "Add to Calendar" adds to a calendar. It used to be
//           `() => goToAppointments()`: a button that navigated away instead of
//           doing what it said, which is why nobody noticed it never worked.
//           It then spent a round keyed to instants the confirm response never
//           returned, so it STILL never ran; the assertions below drive it off
//           `BookingOut.starts_at` / `ends_at`, which are real.
//   item 3  Android hardware back must mirror Close. Without it, back popped
//           onto Review's still-live "Confirm Booking" — a double booking.
//   item 1  `mode` branches the checklist, the badge and the supporting copy.
//           The shipped screen hardcoded "Video Call" and told in-person
//           patients to test their camera.
//
// The shell rules (one detail bar, no tab set, close-by-replace) stay in
// BookingJourneyShell.test.tsx and are not duplicated here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};

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

// No `expo-clipboard` mock: the screen no longer imports it. Its only two
// callers copied a booking reference and a join link, neither of which exists.
// `does not import expo-clipboard` below is the guard that keeps that true.

jest.mock("expo-calendar", () => ({
  EntityTypes: { EVENT: "event", REMINDER: "reminder" },
  requestCalendarPermissionsAsync: jest.fn(),
  getDefaultCalendarAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  createEventAsync: jest.fn(),
}));

import { AccessibilityInfo, BackHandler, Linking, Share } from "react-native";
import { router } from "expo-router";
import * as Calendar from "expo-calendar";
import { BookingConfirmedScreen } from "../BookingConfirmedScreen";

/**
 * A confirmed in-person booking, EXACTLY as Review forwards it after a real
 * `POST /v1/bookings`.
 *
 * `startsAtIso` / `endsAtIso` are the response's own `starts_at` / `ends_at`,
 * in the offset form the service round-trips (`api.ts:toOffsetIso` sends
 * `-04:00`, not `Z`) — not a hand-written `…Z`. That is the whole point of this
 * round: these two are the only server-owned values on the screen, and the
 * calendar path has to work off the real shape.
 *
 * There is no `bookingReference` and no `joinUrl` here because `BookingOut` has
 * neither. Nothing in this file may add them.
 */
const IN_PERSON = {
  practitionerName: "Dr. Amina Sterling",
  practitionerSpecialty: "Consultant Cardiologist",
  date: "2025-05-13",
  time: "10:00 AM",
  endTime: "10:45 AM",
  timezone: "EDT · Boston",
  type: "Standard Consultation",
  mode: "in-person",
  startsAtIso: "2025-05-13T10:00:00-04:00",
  endsAtIso: "2025-05-13T10:45:00-04:00",
  locationName: "MedApp Cardiology Center",
  locationAddress: "1 Seaport Blvd, Boston, MA 02210",
};

const VIDEO = { ...IN_PERSON, mode: "video", locationName: undefined, locationAddress: undefined };

const IN_PERSON_CHECKLIST = [
  "Bring photo ID and any recent test results",
  "Arrive 10 minutes early to complete check-in",
  "List any medication you are currently taking",
];
const VIDEO_CHECKLIST = [
  "Test your microphone and camera",
  // Was "Join the link 10 minutes before the start", which is the frame's copy
  // and false twice over: `telemedicine_service` issues no link (a room is
  // joined in-app from `room_id`) and gates joining on no time window at all.
  "Join from My Appointments when it is time",
  "Find a quiet spot with a stable connection",
];

const DENIED_COPY =
  "MedApp can't add this to your calendar without calendar access. You can turn it on in Settings.";

/** The registered hardwareBackPress handler, captured per render. */
let backPress: (() => boolean | null | undefined) | null = null;
let removeBackHandler: jest.Mock;

function source(): string {
  return readFileSync(join(__dirname, "..", "BookingConfirmedScreen.tsx"), "utf8");
}

/** Strips comments, so a hex mentioned in the "these are deleted" note is not a hit. */
function code(): string {
  return source()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

function grantCalendar() {
  (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
    granted: true,
    canAskAgain: true,
    expires: "never",
  });
  (Calendar.getDefaultCalendarAsync as jest.Mock).mockResolvedValue({ id: "cal-default" });
  (Calendar.getCalendarsAsync as jest.Mock).mockResolvedValue([
    { id: "cal-readonly", allowsModifications: false },
    { id: "cal-writable", allowsModifications: true, isPrimary: true },
  ]);
  (Calendar.createEventAsync as jest.Mock).mockResolvedValue("event-1");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  backPress = null;
  removeBackHandler = jest.fn();
  jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event: string, handler: () => boolean | null | undefined) => {
      backPress = handler;
      return { remove: removeBackHandler } as never;
    });
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Required item 3 — hardware back mirrors Close
// ---------------------------------------------------------------------------
describe("Android hardware back", () => {
  it("mirrors Close: replaces to Home and never pops back onto Review", () => {
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    expect(backPress).toBeInstanceOf(Function);
    const handled = backPress!();

    // `return true` is the whole point: `false` lets the system ALSO pop, which
    // lands the user on Review with a live "Confirm Booking".
    expect(handled).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/(app)");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("removes its handler on unmount", () => {
    mockParams = { ...IN_PERSON };
    const view = render(<BookingConfirmedScreen />);
    expect(removeBackHandler).not.toHaveBeenCalled();
    view.unmount();
    expect(removeBackHandler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Required item 4 — the booking reference
// ---------------------------------------------------------------------------
describe("booking reference", () => {
  it("renders no reference row: the backend has no such field", () => {
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    expect(screen.queryByText("Reference")).toBeNull();
    expect(screen.queryByLabelText("Copy")).toBeNull();
    // Not a dash, not "Pending", not a generated one.
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/MED-/);
    // And the file cannot be hiding a generator.
    expect(code()).not.toMatch(/MED-/);
  });

  it("cannot be coaxed into one by a param, because no such param is read", () => {
    // The previous pass guarded the row on `params.bookingReference`. Nothing
    // sets it — `ReviewAppointmentScreen` cannot, because `BookingOut` has no
    // reference — so the row was unreachable code that read as a shipped
    // feature. Passing the param must now do nothing at all.
    mockParams = { ...IN_PERSON, bookingReference: "MED-8R4K-2210" };
    render(<BookingConfirmedScreen />);

    expect(screen.queryByText("Reference")).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/MED-8R4K-2210/);
  });

  it("reads no reference or join-url param, and copies nothing anywhere", () => {
    const src = code();
    // The source guard is the assertion that would have caught the original
    // defect: a rendering test passes just as happily against a param the
    // product can never supply.
    expect(src).not.toMatch(/bookingReference/);
    expect(src).not.toMatch(/joinUrl/);
    expect(src).not.toMatch(/join_url|booking_reference/);
    expect(src).not.toMatch(/expo-clipboard/);
  });

  it("keeps the reference out of the share sheet too", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share appointment"));
    });

    const [{ message }] = share.mock.calls[0] as [{ message: string }];
    expect(message).toContain("Dr. Amina Sterling");
    expect(message).toContain("Tuesday, 13 May 2025");
    expect(message).not.toMatch(/Reference/);
  });

  it("shares NO link — there is no appointment route a link could open", async () => {
    // The post and facility shares carry `medapp://` deep links now. This one
    // deliberately does not, and the difference is not effort:
    //   * `/(app)/appointments` is a LIST of the signed-in user's bookings. It
    //     takes no id, so there is nothing for a link to select.
    //   * this screen renders entirely from params — practitioner, date, time,
    //     location — so an addressable version would have to put a named
    //     patient's appointment in a query string that ends up in someone
    //     else's chat log.
    //   * and a booking is scoped to the account that made it, so even with an
    //     id the link would 403 for every recipient.
    // A link that opens a dead screen is worse than no link.
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share appointment"));
    });

    const [{ message }] = share.mock.calls[0] as [{ message: string }];
    expect(message).not.toMatch(/medapp:|exp:|https?:\/\//);
  });

  it("never puts a source file near a link builder", () => {
    // The source guard, same shape as the reference one above: a rendering
    // assertion passes just as happily against a link nobody pressed.
    const src = readFileSync(join(__dirname, "..", "BookingConfirmedScreen.tsx"), "utf8");
    expect(src).not.toMatch(/shareLinkLine|shareLinkFor|Linking\.createURL/);
  });
});

// ---------------------------------------------------------------------------
// Required item 1 — consultation mode branches the screen
// ---------------------------------------------------------------------------
describe("consultation mode", () => {
  it("in-person: the in-person checklist and the In person badge", () => {
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    for (const item of IN_PERSON_CHECKLIST) expect(screen.getByText(item)).toBeTruthy();
    for (const item of VIDEO_CHECKLIST) expect(screen.queryByText(item)).toBeNull();
    expect(screen.getByText("In person")).toBeTruthy();
    expect(
      screen.getByText("Your in-person appointment is confirmed. We've saved it to My Appointments."),
    ).toBeTruthy();
  });

  it("video: the video checklist and the Video badge", () => {
    mockParams = { ...VIDEO };
    render(<BookingConfirmedScreen />);

    for (const item of VIDEO_CHECKLIST) expect(screen.getByText(item)).toBeTruthy();
    for (const item of IN_PERSON_CHECKLIST) expect(screen.queryByText(item)).toBeNull();
    expect(screen.getByText("Video")).toBeTruthy();
    expect(
      screen.getByText(
        "Your video consultation is confirmed. You'll join it from My Appointments.",
      ),
    ).toBeTruthy();
  });

  it("draws no join-link row in either mode — the backend issues no join URL", () => {
    for (const fixture of [IN_PERSON, VIDEO]) {
      mockParams = { ...fixture, joinUrl: "https://meet.medapp.dev/abc" };
      const view = render(<BookingConfirmedScreen />);
      expect(screen.queryByText("Join link")).toBeNull();
      expect(screen.queryByLabelText("Copy link")).toBeNull();
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/meet\.medapp\.dev/);
      view.unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// Required item 9 — the expo-calendar flow, including denied
// ---------------------------------------------------------------------------
describe("Add to Calendar", () => {
  it("creates a real event at the SERVER'S instant on the writable calendar", async () => {
    grantCalendar();
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add to Calendar"));
    });

    expect(Calendar.requestCalendarPermissionsAsync).toHaveBeenCalled();
    expect(Calendar.createEventAsync).toHaveBeenCalledTimes(1);
    const [calendarId, event] = (Calendar.createEventAsync as jest.Mock).mock.calls[0];
    expect(typeof calendarId).toBe("string");
    expect(event.title).toContain("Dr. Amina Sterling");
    // The absolute moment, asserted against an offset-independent constant
    // rather than the fixture string, so this is green in any CI zone and would
    // fail if the screen ever recomposed the event from `date` + `time`.
    expect(event.startDate.getTime()).toBe(Date.UTC(2025, 4, 13, 14, 0, 0));
    expect(event.endDate.getTime()).toBe(Date.UTC(2025, 4, 13, 14, 45, 0));
    expect(event.location).toContain("1 Seaport Blvd");

    // NO `timeZone`. The only zone the flow carries is `"EDT · Boston"` — a
    // display label, not the IANA id expo-calendar wants, and wrong for the
    // same clinic in January. The instants above already place the event.
    expect(event.timeZone).toBeUndefined();
    expect(code()).not.toMatch(/timeZone/);

    await waitFor(() => expect(screen.getByLabelText("Added to Calendar")).toBeTruthy());
    // It must NOT navigate away — the old implementation's whole trick.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a video consultation gets neither a location nor an invented join note", async () => {
    grantCalendar();
    mockParams = { ...VIDEO, joinUrl: "https://meet.medapp.dev/abc" };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add to Calendar"));
    });

    const [, event] = (Calendar.createEventAsync as jest.Mock).mock.calls[0];
    expect(event.location).toBeUndefined();
    // There is no join link to carry, so the event carries no note promising
    // one. It is still a real event at the real time.
    expect(event.notes).toBeUndefined();
    expect(event.startDate.getTime()).toBe(Date.UTC(2025, 4, 13, 14, 0, 0));
  });

  it("DENIED: an in-product callout with a route to Settings, not a native Alert", async () => {
    (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
      granted: false,
      canAskAgain: false,
      expires: "never",
    });
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add to Calendar"));
    });

    await waitFor(() => expect(screen.getByText(DENIED_COPY)).toBeTruthy());
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(DENIED_COPY);

    fireEvent.press(screen.getByLabelText("Open Settings"));
    expect(Linking.openSettings).toHaveBeenCalled();

    // The screen stays where it is; the appointment is still confirmed.
    expect(router.replace).not.toHaveBeenCalled();
    expect(code()).not.toMatch(/Alert\./);
  });

  it("FAILED: reports the failure in place and never navigates away", async () => {
    grantCalendar();
    (Calendar.createEventAsync as jest.Mock).mockRejectedValue(new Error("no calendar"));
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add to Calendar"));
    });

    await waitFor(() =>
      expect(screen.getByText(/We couldn't add this to your calendar/)).toBeTruthy(),
    );
    // No "Open Settings" here: nothing in Settings fixes this one.
    expect(screen.queryByLabelText("Open Settings")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("offers no button at all when the API sent no start/end instants", () => {
    mockParams = { ...IN_PERSON, startsAtIso: undefined, endsAtIso: undefined };
    render(<BookingConfirmedScreen />);
    // Absent, not disabled: a dead control with no explanation is the pattern
    // this screen is losing.
    expect(screen.queryByLabelText("Add to Calendar")).toBeNull();
    expect(screen.getByLabelText("View My Appointments")).toBeTruthy();
  });

  it("offers no button for an unparseable instant, rather than scheduling Invalid Date", () => {
    mockParams = { ...IN_PERSON, startsAtIso: "soon" };
    render(<BookingConfirmedScreen />);
    expect(screen.queryByLabelText("Add to Calendar")).toBeNull();
  });

  it("but IS offered for a real confirm response — the branch that had never run", () => {
    // The regression this whole round exists for: `POST /v1/appointments` 404'd,
    // so this screen was never reached and the button was never rendered once.
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);
    expect(screen.getByLabelText("Add to Calendar")).toBeTruthy();
  });

  it("reports a failure when no calendar can be written to", async () => {
    grantCalendar();
    (Calendar.getDefaultCalendarAsync as jest.Mock).mockResolvedValue(null);
    (Calendar.getCalendarsAsync as jest.Mock).mockResolvedValue([
      { id: "cal-holidays", allowsModifications: false },
    ]);
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Add to Calendar"));
    });

    await waitFor(() =>
      expect(screen.getByText(/We couldn't add this to your calendar/)).toBeTruthy(),
    );
    // Writing to a subscribed read-only calendar throws; it must not be tried.
    expect(Calendar.createEventAsync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Nothing is fabricated (the deleted FALLBACK)
// ---------------------------------------------------------------------------
describe("no invented booking", () => {
  it("renders no practitioner, date, time or type when none arrived", () => {
    mockParams = {};
    render(<BookingConfirmedScreen />);

    const tree = JSON.stringify(screen.toJSON());
    expect(tree).not.toMatch(/Dr\./);
    expect(tree).not.toMatch(/Video Call/);
    expect(screen.queryByText("Date & Time")).toBeNull();
    expect(screen.queryByText("Consultation Type")).toBeNull();
    // The headline still stands — the user did confirm something.
    expect(screen.getByText("Appointment Confirmed")).toBeTruthy();
  });

  it("carries no FALLBACK object and no remote avatar URI", () => {
    const src = code();
    expect(src).not.toMatch(/FALLBACK/);
    expect(src).not.toMatch(/googleusercontent/);
  });
});

// ---------------------------------------------------------------------------
// The frame, and the regression guard the literals survived three passes by
// ---------------------------------------------------------------------------
describe("frame fidelity", () => {
  it("drops the '!', the Remote pill and the decorative corner accent", () => {
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);
    expect(screen.queryByText("Appointment Confirmed!")).toBeNull();
    expect(screen.getByText("Appointment Confirmed")).toBeTruthy();
    expect(screen.queryByText("Remote")).toBeNull();
    expect(code()).not.toMatch(/borderBottomLeftRadius/);
  });

  it("renders the long date the frame draws, from an ISO param", () => {
    mockParams = { ...IN_PERSON };
    render(<BookingConfirmedScreen />);
    expect(screen.getByText("Tuesday, 13 May 2025")).toBeTruthy();
    expect(screen.getByText("10:00 AM – 10:45 AM · EDT · Boston")).toBeTruthy();
    // The hardcoded "May" that used to be string-concatenated upstream.
    expect(code()).not.toMatch(/`\$\{[^}]*\} May /);
  });

  it("contains no colour literal, no icon-library import and no off-scale spacing", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/@expo\/vector-icons/);
    expect(src).not.toMatch(/\bmt-xl\b/);
    expect(src).not.toMatch(/px-gutter|paddingHorizontal:\s*24/);
  });

  it("casts no shadow — nothing on a terminal page floats", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
    // `Button` defaults `primary` to the CTA shadow, so the in-flow CTA must
    // opt out explicitly rather than inherit an elevation no frame draws.
    expect(src).toMatch(/shadow=\{false\}/);
  });
});
