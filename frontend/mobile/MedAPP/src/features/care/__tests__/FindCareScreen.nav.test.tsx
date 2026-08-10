// Locks find-care's CHROME to DetailShell.
//
// This file used to assert the OPPOSITE — that all five bottom tabs route from
// this screen — and that premise is what the PO overturned. The device report
// was verbatim: "the logo is off and it has the bottom nav with Home tab
// active... is a bit confusing." Find Care is not one of the five patient tabs,
// so a tab bar here could only render a lie, and `Detail AppBar 193:120`'s own
// description says the logo "belongs only on tab-root screens".
//
// The old assertions are not deleted quietly. The behaviour they locked — five
// working tabs instead of the two the inline switch once handled — was a real
// fix, and it is still correct for the tab roots that kept PatientShell (see
// PatientShell.test.tsx, which is where that contract now lives alone). What
// changed is that this screen is not one of them.
//
// SCOPE: chrome only. Provider-card routing is FindCareScreen.routing.test.tsx
// and the wrapping chip rows are FindCareScreen.layout.test.tsx, so the
// directory is mocked away to a settled empty result here.

import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";

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

jest.mock("@/features/care/hooks/use-directory", () => ({
  useDirectory: () => ({ entries: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

import { FindCareScreen } from "../FindCareScreen";

describe("FindCareScreen chrome", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("shows NO bottom tab bar — neither patient nor practitioner", () => {
    render(<FindCareScreen />);

    // The patient five plus the practitioner three. Both sets, because the
    // failure mode being locked out is "a detail screen grew a tab bar", and it
    // does not matter which one.
    for (const tab of [
      "Home",
      "Overview",
      "Inbox",
      "Community",
      "Lifestyle",
      "Schedule",
      "Patients",
      "Profile",
    ]) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("shows NO logo — it belongs only on tab-root screens", () => {
    // Half of the device report, and the half that is easiest to reintroduce by
    // accident: <Logo /> carries accessibilityLabel="MedApp".
    render(<FindCareScreen />);
    expect(screen.queryByLabelText("MedApp")).toBeNull();
  });

  it("has exactly one back affordance, and it pops the stack", () => {
    // The affordance the 2026-07-30 FLAG recorded as MISSING. Both inbound paths
    // push (Home's Find Care tile, Appointments' "Book new"), so `router.back()`
    // is always the right destination.
    render(<FindCareScreen />);

    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    // Not a hardcoded href: `replace("/(app)")` would send a user who arrived
    // from Appointments to Home instead of back to Appointments.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("names the screen ONCE, in the bar", () => {
    // The 28px body heading is gone; two identical headings stacked would
    // announce "Find Care, heading. Find Care."
    render(<FindCareScreen />);
    expect(screen.getAllByText("Find Care")).toHaveLength(1);
  });
});
