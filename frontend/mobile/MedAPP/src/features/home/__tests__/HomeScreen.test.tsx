// Locks HomeScreen against the two defects it actually shipped: controls that
// look live and are not, and clinical copy with nothing behind it.
//
// The original suite asserted that the Quick Services strip reconnected the
// new-booking funnel — `find-care` was designed, built and backend-wired, and
// nothing in `src/features` linked to it. Those assertions are kept verbatim,
// because the funnel is still the reason the strip exists.
//
// What is added is the class-level guard. Ten controls on this screen rendered
// `accessibilityRole="button"` with a label, a hitSlop and a press animation and
// no handler; every one of them would have passed a test that only checked it
// RENDERED. `findDeadControls` presses all of them and reports the ones nothing
// observed — see src/test/live-controls.ts for why that is a shared helper.
//
// And the fabrication guard. The MedAI hero card quoted a sentence about the
// patient's own blood pressure, attributed to an AI, on a screen that has never
// issued a vitals request. That string cannot come back by accident.

import { fireEvent, screen, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TEST_METRICS } from "@/test/safe-area";
import { findDeadControls } from "@/test/live-controls";

// HomeScreen is the app's ONLY Reanimated consumer (the MedAI hero's `ai-pulse`
// loop), which is why no other suite has needed this. Under Jest the Worklets
// native module doesn't exist, so importing the real package throws at require
// time and the suite never runs at all.
//
// The library's own `react-native-reanimated/mock` does not help: it re-imports
// `./index` for its enums, so requiring it detonates the same native
// initialiser it is supposed to stand in for. Hence this stub, kept to exactly
// the six bindings HomeScreen imports — a wider fake would start asserting an
// animation API this screen doesn't use.
//
// Nothing is lost by faking it. The pulse is a decorative blob behind the hero
// card, and every assertion below is about navigation or copy.
jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  const identityEasing = (t: number) => t;
  return {
    __esModule: true,
    default: { View },
    Easing: { inOut: () => identityEasing, ease: identityEasing },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withRepeat: (animation: unknown) => animation,
    withTiming: (toValue: number) => toValue,
  };
});

// The store itself is mocked, not seeded: importing `@/store/auth-store` pulls
// in `@/lib/api/client` -> `@/lib/config`, which throws unless app.config.ts
// extras are present. Same reason (and same shape) as the LifestyleHubScreen
// suite's `use-current-user` mock. A signed-in user with no display name is the
// screen's own fallback path ("Good morning, there") and changes nothing the
// tests below look at.
jest.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

// Mocked at the FEATURE boundary, not at `client`, for the reason the
// appointments suite gives: mocking the HTTP client alone still pulls
// `lib/config` through, which throws outside Expo. It also lets each test state
// the shape it cares about rather than hand-rolling wire JSON.
jest.mock("@/features/appointments/api", () => ({
  appointmentsApi: { listAppointments: jest.fn(), cancelAppointment: jest.fn() },
}));
jest.mock("@/features/wearables/api", () => ({
  wearablesApi: { getSummary: jest.fn() },
}));

// All four verbs are spied, not just `push`. The dead-control sweep walks the
// SHELL's chrome too — the app bar's avatar and bell go through
// `router.navigate`, and the bottom nav's tabs through `router.replace` — so a
// mock that only implements `push` reports working shell buttons as dead (and,
// in this case, threw outright on `router.navigate is not a function`).
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    back: jest.fn(),
    canGoBack: () => true,
  },
}));

import { appointmentsApi } from "@/features/appointments/api";
import { wearablesApi } from "@/features/wearables/api";
import { HomeScreen } from "../HomeScreen";

const listAppointments = appointmentsApi.listAppointments as jest.Mock;
const getSummary = wearablesApi.getSummary as jest.Mock;

/** Far enough ahead that the clock cannot flip the bucket mid-run. */
const FUTURE = new Date(Date.now() + 3 * 864e5).toISOString();

const VIDEO_APPOINTMENT = {
  id: "b1",
  doctorId: "d-1",
  doctor: {
    doctorId: "d-1",
    name: "Dr. Adjoa Boateng",
    specialty: "Cardiologist",
    avatarUri: "",
  },
  startsAtIso: FUTURE,
  endsAtIso: FUTURE,
  status: "confirmed" as const,
  mode: "video" as const,
  roomId: "27db4d6b-2533-4afa-b807-2c14a4a621cd",
};

let activeClient: QueryClient | null = null;

/**
 * `retry: false` so an error-state assertion is not a multi-second timeout, and
 * `gcTime: 0` so the cache does not schedule a collection timer that outlives
 * the test — without it Jest reports "did not exit one second after the test
 * run", which is a hang in CI rather than a warning.
 */
function renderScreen() {
  activeClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <SafeAreaProvider initialMetrics={TEST_METRICS}>
      <QueryClientProvider client={activeClient}>
        <HomeScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockNavigate.mockClear();
  listAppointments.mockReset().mockResolvedValue({ upcoming: [], past: [] });
  getSummary.mockReset().mockResolvedValue({ recentSamples: [] });
});

afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("HomeScreen — Quick Services", () => {
  it("carries a Find Care tile that pushes the provider directory", () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText("Find Care"));

    // `find-care` is a directory ROOT: it reads no params and has no
    // param-dependent empty state, so a bare pathname is a complete link. The
    // assertion is exact rather than `objectContaining` for that reason — if
    // this screen ever starts passing params, that is a change worth failing on.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/(app)/find-care");
  });

  it("keeps every tile that already shipped, and their targets", () => {
    renderScreen();

    for (const label of ["Find Care", "Appts", "Pharmacy", "Labs", "Vitals", "Records"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    fireEvent.press(screen.getByLabelText("Appts"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/appointments");
  });

  it("does NOT announce the four destination-less tiles as buttons", () => {
    // The defect, stated directly. These four had `accessibilityRole="button"`,
    // an accessibilityLabel and `active:scale-95` with no handler, so TalkBack
    // said "Pharmacy, button" and the tile depressed under the finger for a tap
    // that went nowhere. They are still visible and still readable — the label
    // is a `<Text>` — they are simply no longer controls.
    renderScreen();

    for (const label of ["Pharmacy", "Labs", "Vitals", "Records"]) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("offers no 'View All' on the strip — there is no all-services screen", () => {
    // `actionLabel="View All"` was passed with no `onAction`, so `Section`
    // rendered a primary-coloured link with a button role that had never done
    // anything. `Section`'s prop type now makes the pair inseparable, and this
    // asserts the call site as well as the type.
    renderScreen();
    expect(screen.queryByLabelText("View All Quick Services")).toBeNull();
  });

  it("lays the six tiles out as two rows of three, not one row of six", () => {
    // Not a style assertion for its own sake. One row of six puts a 48px tile
    // in a 328px column at 360dp — narrower than the 56px icon plate inside it,
    // and narrow enough to ellipsise "Pharmacy". BRAND: "nothing is half-sliced
    // in the resting state". If someone flattens this back to a single row the
    // strip silently starts clipping, and only this assertion notices.
    renderScreen();

    // Walk up to the nearest strip row rather than reading `.parent` directly:
    // a tile's immediate parent is its own host wrapper, several levels below
    // the row (NativeWind adds wrappers of its own), so `.parent` is never
    // shared even when two tiles genuinely sit side by side.
    const ROW = "flex-row gap-base";
    // Narrowed to the two fields the walk needs. `ReactTestInstance.parent` is
    // typed as non-nullable, which would make the loop's own termination
    // condition unreachable to the compiler.
    type Ancestor = { props: { className?: string }; parent: Ancestor | null };
    const rowOf = (label: string) => {
      // By TEXT, not by label: four of the six tiles are no longer Pressables
      // and therefore carry no accessibilityLabel. The text node is inside the
      // tile either way, so the walk is identical.
      let node = screen.getByText(label) as unknown as Ancestor | null;
      while (node && node.props?.className !== ROW) node = node.parent;
      if (!node) throw new Error(`"${label}" is not inside a Quick Services row`);
      return node;
    };
    // Compared as a BOOLEAN, not `expect(a).toBe(b)` on the nodes themselves.
    // A failing identity assertion makes Jest pretty-print both React trees, and
    // a rendered HomeScreen is large enough that the diff exhausts the worker's
    // heap — the suite dies with an OOM instead of telling you what broke.
    const sameRow = (a: string, b: string) => rowOf(a) === rowOf(b);

    // Three per row…
    expect(sameRow("Find Care", "Appts")).toBe(true);
    expect(sameRow("Find Care", "Pharmacy")).toBe(true);
    expect(sameRow("Labs", "Vitals")).toBe(true);
    expect(sameRow("Labs", "Records")).toBe(true);
    // …in two distinct rows, which is what makes this a wrap and not a reorder.
    expect(sameRow("Find Care", "Labs")).toBe(false);
  });
});

describe("HomeScreen — no dead controls", () => {
  const PROBES = [mockPush, mockReplace, mockNavigate, listAppointments, getSummary];

  // The bottom nav's ACTIVE tab. PatientShell short-circuits it deliberately —
  // re-navigating to the screen you are already on is a wasted frame — so it
  // moves no probe while being entirely correct. It is the only exemption on
  // this screen, and the list staying at one is itself the assertion.
  const EXPECTED_INERT = ["Home"];

  it("fires something for every button on the resting screen", () => {
    const view = renderScreen();

    expect(findDeadControls(view, { probes: PROBES, expectedInert: EXPECTED_INERT })).toEqual([]);
  });

  it("fires something for every button once an appointment has loaded", async () => {
    // The loaded state has strictly more controls than the resting one — the
    // whole appointment card, including Join Call — so it needs its own pass.
    listAppointments.mockResolvedValue({ upcoming: [VIDEO_APPOINTMENT], past: [] });
    const view = renderScreen();
    await waitFor(() => expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy());

    expect(findDeadControls(view, { probes: PROBES, expectedInert: EXPECTED_INERT })).toEqual([]);
  });
});

describe("HomeScreen — nothing fabricated survives", () => {
  it("makes no clinical claim about the patient, and attributes none to MedAI", async () => {
    listAppointments.mockResolvedValue({ upcoming: [VIDEO_APPOINTMENT], past: [] });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy());

    // The exact strings that shipped. Each was a statement about this patient's
    // body or their care with no request behind it anywhere in the app.
    for (const fabrication of [
      /blood pressure readings look steady/i,
      /great progress on your care plan/i,
      /Morning breathing improves your HRV/i,
      /better recovery scores/i,
      /Mindfulness/i,
    ]) {
      expect(screen.queryByText(fabrication)).toBeNull();
    }

    // The hero still invites — it just no longer asserts. This is
    // AiAssistantScreen's own framing, so the card promises what the
    // destination delivers.
    expect(screen.getByText(/not a diagnosis/i)).toBeTruthy();
  });

  it("renders no wellness figures when the patient has no readings", () => {
    // The literals were "7h 20m" and "6,240 / 8,000". With no samples the whole
    // section is absent — NOT zeroed, because a zero step count claims the
    // patient did not move (docs/api/wearable_sync_service.md).
    renderScreen();

    expect(screen.queryByText("Daily Wellness")).toBeNull();
    expect(screen.queryByText("7h 20m")).toBeNull();
    expect(screen.queryByText(/6,240/)).toBeNull();
  });

  it("renders the day's real sleep and steps, with no invented goal", async () => {
    const at = (h: number) => {
      const d = new Date();
      d.setHours(h, 0, 0, 0);
      return d.toISOString();
    };
    getSummary.mockResolvedValue({
      recentSamples: [
        { id: "s1", deviceId: "dev-1", kind: "sleep_minutes", value: "440", unit: "min", recordedAtIso: at(7) },
        { id: "s2", deviceId: "dev-1", kind: "steps", value: "1940", unit: "steps", recordedAtIso: at(18) },
      ],
    });
    renderScreen();

    // 440 minutes rendered as hours and minutes, not as a raw wire number.
    await waitFor(() => expect(screen.getByText("7h 20m")).toBeTruthy());
    // A bare count. The "/ 8,000" denominator is gone: nothing stores a target,
    // so it was the one half of that row that could never be made true.
    expect(screen.getByText("1,940")).toBeTruthy();
    expect(screen.queryByText(/8,000/)).toBeNull();
  });

  it("shows no appointment card at all when there is no upcoming booking", async () => {
    renderScreen();
    await waitFor(() => expect(listAppointments).toHaveBeenCalled());

    // No invented clinician, and no "Tomorrow, 10:30 AM" that stays "Tomorrow"
    // forever. An absent section is the honest resting state.
    expect(screen.queryByText("Upcoming Appointments")).toBeNull();
    expect(screen.queryByText(/Dr\. Sarah Chen/)).toBeNull();
    expect(screen.queryByText("Tomorrow, 10:30 AM")).toBeNull();
  });

  it("renders the real next booking and joins its real room", async () => {
    listAppointments.mockResolvedValue({ upcoming: [VIDEO_APPOINTMENT], past: [] });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy());
    expect(screen.getByText("Cardiologist")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Join video call"));

    // `sessionId` is the ROOM handle. It used to be the appointment id under
    // that name, which the waiting room would resolve to no room at all.
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(app)/waiting-room",
        params: expect.objectContaining({
          sessionId: VIDEO_APPOINTMENT.roomId,
          appointmentId: "b1",
          providerId: "d-1",
          providerName: "Dr. Adjoa Boateng",
          viewerRole: "patient",
        }),
      }),
    );
  });

  it("states the room is pending rather than offering a Join button with no room", async () => {
    // `provision_room` never raises, so a video booking can 201 with
    // `room_id: null`. A disabled Join tells the patient they are doing
    // something wrong; they are not.
    listAppointments.mockResolvedValue({
      upcoming: [{ ...VIDEO_APPOINTMENT, roomId: undefined }],
      past: [],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy());

    expect(screen.queryByLabelText("Join video call")).toBeNull();
    expect(screen.getByText(/video room is not ready yet/i)).toBeTruthy();
  });

  it("badges an in-person booking as in person, and offers it no call", async () => {
    // The badge was the literal string "Virtual" for every booking, so a
    // patient with a clinic appointment was told it was a video call.
    listAppointments.mockResolvedValue({
      upcoming: [{ ...VIDEO_APPOINTMENT, mode: "in-person" as const, roomId: undefined }],
      past: [],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText("In person")).toBeTruthy());

    expect(screen.queryByText("Virtual")).toBeNull();
    expect(screen.queryByLabelText("Join video call")).toBeNull();
    expect(screen.queryByText(/MedApp Secure Link/)).toBeNull();
  });

  it("still routes the Upcoming Appointments section header", async () => {
    listAppointments.mockResolvedValue({ upcoming: [VIDEO_APPOINTMENT], past: [] });
    renderScreen();
    await waitFor(() => expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("View All Upcoming Appointments"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/appointments");
  });
});
