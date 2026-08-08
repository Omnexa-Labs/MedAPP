// Locks the shell migration for the Overview TAB ROOT, and the query states
// that replaced its fabricated readings.
//
// The shell regressions guarded here are (1) the hand-rolled bar creeping back,
// (2) a back button appearing on a tab root, and (3) the BottomNav routing being
// lost when it moved from <BottomNav onTabPress> onto <PatientShell onTabPress>.
//
// The DATA regression is the one that matters more. The screen destructured only
// `data` from `useQuery`, so loading, failure and "no readings" were the same
// `undefined` and all three fell through to a constant: BP 118/76, HR 72bpm and
// a week of sparklines, rendered as this patient's own vitals during a backend
// outage. The three cases below are the reason that cannot come back.

import { screen, fireEvent, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => true,
  },
}));

// OverviewScreen reads live vitals, which pulls in three things this suite
// would not otherwise need. Predicted in docs/api/inbox_service.md after the
// chat migration hit the identical trio:
//   1. `@/hooks/use-current-user` -> auth-store -> `@/lib/config`, which THROWS
//      at require time under Jest (the landmine AccountMenu.tsx documents).
//   2. `./api` -> `@/lib/api/client` -> the same throw.
//   3. react-query hooks cannot be conditional, so a QueryClientProvider is
//      required even in cases that never exercise a live fetch.
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({
    id: "me",
    displayName: "Ama Mensah",
    email: "ama@example.test",
    avatarUrl: null,
  }),
}));

// `mock`-prefixed so jest's out-of-scope guard permits the factory below.
const mockGetSummary = jest.fn();
const mockListVitals = jest.fn();

jest.mock("../api", () => ({
  ehrApi: {
    getSummary: (...args: unknown[]) => mockGetSummary(...args),
    getBundle: jest.fn(),
    listVitals: (...args: unknown[]) => mockListVitals(...args),
  },
}));

import { OverviewScreen } from "../OverviewScreen";

/** A reading in the shape `toVital` produces. */
function vital(kind: string, value: string, unit: string | null, daysAgo = 0) {
  return {
    id: `${kind}-${daysAgo}`,
    patientId: "p1",
    recordedByUserId: "me",
    kind,
    value,
    unit,
    recordedAtIso: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    note: null,
  };
}

const HEART_RATE = vital("heart_rate", "64", "bpm");

function summaryWith(latestVitals: ReturnType<typeof vital>[]) {
  return { patient: { patientId: "p1", userId: "me", displayName: "Ama" }, latestVitals, activeConsents: [] };
}

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  mockGetSummary.mockReset().mockResolvedValue(summaryWith([HEART_RATE]));
  mockListVitals.mockReset().mockResolvedValue([]);
});

/**
 * Waits for the summary to land.
 *
 * A POSITIVE signal, not "the skeleton went away". `waitFor` on an absence has
 * to burn its whole budget before it can succeed, and on a cold first render
 * under parallel workers that is the difference between a pass and a timeout
 * dressed up as an assertion failure.
 */
async function settle() {
  await waitFor(() => expect(screen.getByText("64")).toBeTruthy());
}

// The chrome renders before any query resolves, so these cases deliberately do
// NOT wait for data — the shell is not what they are about, and waiting only
// buys flake.
describe("OverviewScreen shell", () => {
  it("renders inside PatientShell — canonical bar, no back button on a tab root", async () => {
    render(<OverviewScreen />);
    await settle();

    // The shared bar: logo LEFT, avatar + bell right.
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
    expect(screen.getByLabelText("Ama Mensah")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();

    // `hideBack` defaults to true and this screen must not override it, even
    // though router.canGoBack() is true.
    expect(screen.queryByLabelText("Go back")).toBeNull();

    // The patient tab set, with Overview selected.
    expect(screen.getByLabelText("Home")).toBeTruthy();
    expect(screen.getByLabelText("Overview")).toBeTruthy();
    expect(screen.getByLabelText("Lifestyle")).toBeTruthy();
    expect(screen.getByLabelText("Overview").props.accessibilityState.selected).toBe(true);
  }, 20000);

  it("routes ALL FOUR other tabs, Inbox included, and never grows the stack", () => {
    render(<OverviewScreen />);

    // Inbox is the regression this test exists for: this screen's old inline
    // switch omitted it entirely, so the tab silently did nothing. Home is the
    // second: it went through `router.back()`, which is "wherever I came from",
    // not "Home".
    for (const [label, href] of [
      ["Home", "/(app)"],
      ["Inbox", "/(app)/inbox"],
      ["Community", "/(app)/community"],
      ["Lifestyle", "/(app)/lifestyle"],
    ] as const) {
      mockReplace.mockClear();
      fireEvent.press(screen.getByLabelText(label));
      expect(mockReplace).toHaveBeenCalledWith(href);
    }

    // One semantic: tab switching replaces, so Android back leaves the app
    // rather than walking tab history.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("makes its own tab a no-op — this IS the Overview root", () => {
    render(<OverviewScreen />);

    fireEvent.press(screen.getByLabelText("Overview"));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps the bar's title as the page heading", () => {
    render(<OverviewScreen />);

    expect(screen.getByText("Health Hub")).toBeTruthy();
    expect(screen.getByText("Health Trends")).toBeTruthy();
  });

  it("reserves scroll room for the absolutely-positioned bottom nav", () => {
    render(<OverviewScreen />);

    // PatientShell renders BottomNav as an overlay, so the reserve stays with
    // the screen. Dropping it hides the last card behind the bar.
    const scroll = screen.UNSAFE_getByType(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("react-native").ScrollView,
    );
    expect(scroll.props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingBottom: 140 }),
    );
  });
});

// ---------------------------------------------------------------------------
// The three states that used to be one
// ---------------------------------------------------------------------------

/** Values the deleted TREND_METRICS fallback drew. None may reappear. */
const FABRICATED = ["72", "118", "/76", "7.2", "1.8"];

describe("OverviewScreen query states", () => {
  it("renders a LOADING state, not readings, while the summary is in flight", () => {
    // Never resolves: the screen must be honest about what it does not have yet.
    mockGetSummary.mockImplementation(() => new Promise(() => {}));
    render(<OverviewScreen />);

    expect(screen.getByLabelText("Loading your readings")).toBeTruthy();
    expect(screen.queryByTestId("vitals-error")).toBeNull();
    expect(screen.queryByTestId("vitals-empty")).toBeNull();
    for (const value of FABRICATED) expect(screen.queryByText(value)).toBeNull();
  });

  it("renders an ERROR state, not readings, when the summary fails", async () => {
    mockGetSummary.mockRejectedValue(new Error("500 from ehr_service"));
    render(<OverviewScreen />);

    await waitFor(() => expect(screen.getByTestId("vitals-error")).toBeTruthy());
    expect(screen.getByText("We couldn't load your readings")).toBeTruthy();
    // THE defect: a backend outage used to render confident vitals.
    for (const value of FABRICATED) expect(screen.queryByText(value)).toBeNull();
    expect(screen.queryByTestId("vitals-empty")).toBeNull();
    // …and nothing may be exported out of a failure either.
    expect(screen.getByLabelText("Download your health report as a text file").props
      .accessibilityState.disabled).toBe(true);
  });

  it("retries the summary rather than leaving the user stuck", async () => {
    mockGetSummary.mockRejectedValueOnce(new Error("boom"));
    render(<OverviewScreen />);
    await waitFor(() => expect(screen.getByTestId("vitals-error")).toBeTruthy());

    mockGetSummary.mockResolvedValue(summaryWith([HEART_RATE]));
    fireEvent.press(screen.getByLabelText("Try again"));
    await waitFor(() => expect(screen.getByText("64")).toBeTruthy());
  });

  it("renders an EMPTY state, not readings, when the account has none", async () => {
    mockGetSummary.mockResolvedValue(summaryWith([]));
    render(<OverviewScreen />);

    await waitFor(() => expect(screen.getByTestId("vitals-empty")).toBeTruthy());
    expect(screen.getByText("No readings yet")).toBeTruthy();
    // "Empty" must not be rendered as "lost", and must not be rendered as 72bpm.
    for (const value of FABRICATED) expect(screen.queryByText(value)).toBeNull();
    expect(screen.queryByTestId("vitals-error")).toBeNull();
  });

  it("renders the live reading, exactly as the service returned it", async () => {
    mockGetSummary.mockResolvedValue(
      summaryWith([vital("blood_pressure", "122/80", null), HEART_RATE]),
    );
    render(<OverviewScreen />);

    await waitFor(() => expect(screen.getByText("122/80")).toBeTruthy());
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Blood Pressure")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sparklines come from the timeline, or they do not come at all
// ---------------------------------------------------------------------------

describe("OverviewScreen sparklines", () => {
  // `includeHiddenElements` is REQUIRED here, and leaving it off is a trap
  // rather than a detail: MiniChart is `accessibilityElementsHidden` (it is
  // decoration — the reading itself is the card's accessible content), and
  // RNTL's queries skip hidden subtrees by default. Without the flag the
  // "draws no chart" cases would pass whether or not a chart was drawn.
  const sparklines = () => screen.queryAllByTestId("vital-sparkline", { includeHiddenElements: true });

  it("calls the vitals timeline that api.ts has always exposed", async () => {
    render(<OverviewScreen />);
    await settle();
    // `listVitals()` was written when the client was built and never called;
    // the bars were a static seven-value array even under a LIVE reading.
    expect(mockListVitals).toHaveBeenCalledWith("me");
  });

  it("draws no chart for a reading with fewer than two numeric points", async () => {
    mockListVitals.mockResolvedValue([HEART_RATE]);
    render(<OverviewScreen />);
    await settle();

    // One point is not a trend. The card renders without a footer rather than
    // with a flat or invented strip.
    expect(sparklines()).toHaveLength(0);
  });

  it("draws no chart for a non-numeric reading like 122/80", async () => {
    mockGetSummary.mockResolvedValue(summaryWith([vital("blood_pressure", "122/80", null)]));
    mockListVitals.mockResolvedValue([
      vital("blood_pressure", "122/80", null, 1),
      vital("blood_pressure", "118/76", null, 2),
      vital("blood_pressure", "120/78", null, 3),
    ]);
    render(<OverviewScreen />);
    await waitFor(() => expect(screen.getByText("122/80")).toBeTruthy());

    // `parseFloat("122/80")` is 122 — a systolic-only chart under a label that
    // says "Blood Pressure". Refused rather than drawn.
    expect(sparklines()).toHaveLength(0);
  });

  it("draws one bar per reading in the selected window, and re-derives on change", async () => {
    mockListVitals.mockResolvedValue([
      vital("heart_rate", "60", "bpm", 1),
      vital("heart_rate", "70", "bpm", 2),
      vital("heart_rate", "80", "bpm", 3),
      // Outside 7D, inside 1M.
      vital("heart_rate", "66", "bpm", 20),
      vital("heart_rate", "68", "bpm", 21),
    ]);
    render(<OverviewScreen />);
    await settle();
    await waitFor(() => expect(sparklines()).toHaveLength(1));

    expect(sparklines()[0].props.children).toHaveLength(3);

    // The range control used to be state nothing read.
    fireEvent.press(screen.getByText("1M"));
    await waitFor(() => expect(sparklines()[0].props.children).toHaveLength(5));
  });
});
