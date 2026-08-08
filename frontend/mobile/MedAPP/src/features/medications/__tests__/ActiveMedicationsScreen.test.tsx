// The medication list, and the one defect it must never be able to have again.
//
// The load-bearing case in this file is "a failed fetch renders an ERROR, never
// the empty state". The screen used to compute its list, its loading flag and
// its error flag from three unrelated pieces of state, and render
// `EmptyMedications` whenever the list was empty and loading was false. Wiring a
// query to it — the obvious one-line change — would have made a 500 render
//
//     "No active medications. Ask your clinician to share a prescription."
//
// That sentence is actionable and wrong, and the patient acts on it. So the
// mapping is asserted at the derivation (`deriveMedicationsState`, where the
// decision actually lives) AND at the render (`MedicationsList`, where the
// consequence lands), because either one alone can drift.

import { fireEvent, render, screen, within } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// @/lib/share is mocked at the module boundary: it imports expo-sharing and
// expo-file-system, neither of which has a native module under Jest. The
// mechanism itself is covered in src/lib/__tests__/share.test.ts — here the
// question is only whether the button calls it, and with what.
const mockShareTextFile = jest.fn(() => Promise.resolve("shared" as const));
jest.mock("@/lib/share", () => ({
  shareTextFile: (...args: unknown[]) => mockShareTextFile(...(args as [])),
}));

import { router } from "expo-router";
import { ApiError } from "@/types/api";
import { ActiveMedicationsScreen, MedicationsList } from "../ActiveMedicationsScreen";
import { deriveMedicationsState } from "../state";
import { SAMPLE_MEDICATIONS } from "../sample-data";

beforeEach(() => {
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

describe("deriveMedicationsState", () => {
  it("maps a failed fetch to ERROR — never to empty", () => {
    const state = deriveMedicationsState({
      isPending: false,
      isError: true,
      error: new ApiError("boom", 500),
      data: undefined,
    });
    expect(state.kind).toBe("error");
  });

  it("maps a failed fetch that still holds data to ERROR, not to that data", () => {
    // A retry, a background refetch, or `placeholderData` can leave stale rows
    // on a query that has since failed. Rendering them would present an old
    // medication list as current.
    const state = deriveMedicationsState({
      isPending: false,
      isError: true,
      error: new ApiError("boom", 500),
      data: SAMPLE_MEDICATIONS,
    });
    expect(state.kind).toBe("error");
  });

  it("marks a network failure offline without changing the state kind", () => {
    // status 0 is NETWORK_ERROR from lib/api/client.ts. It changes the WORDS.
    // It must not change whether a list is shown.
    const state = deriveMedicationsState({
      isPending: false,
      isError: true,
      error: new ApiError("offline", 0),
      data: undefined,
    });
    expect(state).toEqual({ kind: "error", offline: true });
  });

  it("treats a settled query with no data as an error, not an empty list", () => {
    const state = deriveMedicationsState({
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
    });
    expect(state.kind).toBe("error");
  });

  it("maps an ANSWERED empty list to empty", () => {
    // The only route to the empty state: the service replied, with nothing.
    const state = deriveMedicationsState({
      isPending: false,
      isError: false,
      error: null,
      data: [],
    });
    expect(state.kind).toBe("empty");
  });

  it("maps a pending query to loading", () => {
    expect(
      deriveMedicationsState({ isPending: true, isError: false, error: null, data: undefined }).kind,
    ).toBe("loading");
  });

  it("maps rows to ready", () => {
    const state = deriveMedicationsState({
      isPending: false,
      isError: false,
      error: null,
      data: SAMPLE_MEDICATIONS,
    });
    expect(state).toEqual({ kind: "ready", medications: SAMPLE_MEDICATIONS });
  });
});

// ---------------------------------------------------------------------------
// The render
// ---------------------------------------------------------------------------

describe("MedicationsList states", () => {
  it("an error renders an error and NEVER the 'no medications' copy", () => {
    render(<MedicationsList state={{ kind: "error", offline: false }} />);

    expect(screen.getByTestId("medications-error")).toBeTruthy();
    expect(screen.getByText("Couldn’t load your medications")).toBeTruthy();
    // The exact sentence that would have shipped. It must be unreachable.
    expect(screen.queryByText("No active medications")).toBeNull();
    expect(screen.queryByText("Ask your clinician to share a prescription.")).toBeNull();
    expect(screen.queryByTestId("medications-empty")).toBeNull();
    // ...and it does not claim a cached list is being shown, because there is
    // no cache. The old offline branch said "Showing your last saved list"
    // under a fixed "Updated 12 Jul at 09:42".
    expect(screen.queryByText(/last saved list/i)).toBeNull();
    expect(screen.queryByText(/12 Jul/)).toBeNull();
  });

  it("an offline failure is still an error state, worded differently", () => {
    render(<MedicationsList state={{ kind: "error", offline: true }} />);
    expect(screen.getByText("You’re offline")).toBeTruthy();
    expect(screen.queryByText("No active medications")).toBeNull();
  });

  it("only an ANSWERED empty list renders the empty state", () => {
    render(<MedicationsList state={{ kind: "empty" }} />);
    expect(screen.getByTestId("medications-empty")).toBeTruthy();
    expect(screen.getByText("No active medications")).toBeTruthy();
    // "Add a medication" opened an Alert saying medication entry was
    // unavailable. A control whose whole behaviour is an apology.
    expect(screen.queryByLabelText("Add a medication")).toBeNull();
  });

  it("loading shows a labelled skeleton and no empty state", () => {
    render(<MedicationsList state={{ kind: "loading" }} />);
    expect(screen.getByLabelText("Loading medications")).toBeTruthy();
    expect(screen.queryByTestId("medications-empty")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The screen as shipped
// ---------------------------------------------------------------------------

describe("ActiveMedicationsScreen", () => {
  it("labels the list as sample data, unmissably and in words", () => {
    render(<ActiveMedicationsScreen />);
    expect(screen.getByTestId("medications-sample-notice")).toBeTruthy();
    expect(screen.getByText(/Sample data — these are not your medications/)).toBeTruthy();
    expect(screen.getByText(/no medication record has been loaded/)).toBeTruthy();
    // Per card too, so a scrolled-past callout is not the only signal.
    expect(screen.getAllByText("Sample").length).toBe(SAMPLE_MEDICATIONS.length);
  });

  it("renders the sample records and routes to the detail screen", () => {
    render(<ActiveMedicationsScreen />);

    expect(screen.getByText("Your current medications")).toBeTruthy();
    expect(screen.getByText("Metformin")).toBeTruthy();
    expect(screen.getByText("Take 1 tablet with breakfast and dinner.")).toBeTruthy();
    expect(screen.getByText("Metformin").props.numberOfLines).toBe(2);

    fireEvent.press(screen.getByLabelText("View details for Metformin"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/medication-details",
      params: { id: "metformin-500" },
    });
  });

  // -------------------------------------------------------------------------
  // Removed controls. Each of these reported success or promised a capability
  // with nothing behind it; a regression is a returning lie, not a returning
  // button, so they are asserted absent by name.
  // -------------------------------------------------------------------------
  it("offers no refill request, because nothing would receive one", () => {
    render(<ActiveMedicationsScreen />);
    expect(screen.queryByLabelText("Request refill for Metformin")).toBeNull();
    expect(screen.queryByText("Request refill")).toBeNull();
    expect(screen.queryByText("Request sent")).toBeNull();
    expect(screen.queryByText(/We'll notify you once it's ready/)).toBeNull();
    expect(screen.queryByText("Pending review")).toBeNull();
  });

  it("renders no fill dates or refill counts it has no field for", () => {
    render(<ActiveMedicationsScreen />);
    // "Last filled 12 Jul · 14 days left" was one literal under all three
    // medications — two fabricated clinical facts, three times over.
    expect(screen.queryByText(/Last filled/i)).toBeNull();
    expect(screen.queryByText(/days left/i)).toBeNull();
    expect(screen.queryByText(/Refill available/i)).toBeNull();
  });

  it("offers no dead retry, because there is nothing to refetch", () => {
    render(<ActiveMedicationsScreen />);
    expect(screen.queryByLabelText("Try loading medications again")).toBeNull();
    expect(screen.queryByLabelText("Retry refreshing medications")).toBeNull();
  });

  it("keeps only the action that works", () => {
    render(<ActiveMedicationsScreen />);
    const actions = within(screen.getByTestId("medication-actions-metformin-500"));
    expect(actions.getByText("View details")).toBeTruthy();
    expect(actions.queryByText("Request refill")).toBeNull();
  });

  it("is a detail screen: one shell bar with the share action, no tab set", () => {
    render(<ActiveMedicationsScreen />);
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    expect(screen.getByText("Active medications")).toBeTruthy();
    expect(screen.getByLabelText("Share medication list")).toBeTruthy();
    for (const tab of [
      "Home",
      "Overview",
      "Community",
      "Lifestyle",
      "Schedule",
      "Patients",
      "Profile",
    ]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  // -------------------------------------------------------------------------
  // Share — the capability is real; only the data is sample, so the file says so.
  // -------------------------------------------------------------------------
  it("shares a file that declares itself sample data", () => {
    render(<ActiveMedicationsScreen />);
    fireEvent.press(screen.getByLabelText("Share medication list"));

    expect(mockShareTextFile).toHaveBeenCalledTimes(1);
    const [args] = mockShareTextFile.mock.calls[0] as unknown as [
      { filename: string; body: string },
    ];
    expect(args.filename).toBe("medapp-medications.txt");
    expect(args.body).toContain("Metformin");
    expect(args.body).toContain("Take 1 tablet with breakfast and dinner.");
    // The statement is in the FILE, which is the part that leaves the app.
    expect(args.body.split("\n")[0]).toMatch(/^SAMPLE DATA —/);
    // Nothing fabricated escapes: the card's deleted fill line was never a field.
    expect(args.body).not.toMatch(/Last filled|days left/i);
  });

  it("opens no share sheet over an empty list", () => {
    render(<MedicationsList state={{ kind: "empty" }} />);
    fireEvent.press(screen.getByLabelText("Share medication list"));
    expect(mockShareTextFile).not.toHaveBeenCalled();
  });

  it("uses Overview as a safe back fallback for deep links", () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    render(<ActiveMedicationsScreen />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(router.replace).toHaveBeenCalledWith("/(app)/overview");
  });
});
