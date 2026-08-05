// Locks the navigation out of patient-profile-overview.
//
// Two things:
//   1. The CHROME. This screen is a detail screen (PO ruling 2026-08-05, and the
//      one frame 261:387 has drawn all along — it has no tab bar instance), so:
//      no tab bar, no logo, one back button. The assertion here used to be the
//      opposite — that all five tabs route from this screen — and that premise is
//      what the ruling overturned. The tab-map contract itself still holds and is
//      tested where it belongs, on the tab roots: PatientShell.test.tsx.
//   2. The "Book Appointment" CTA. It pushed `/(app)/select-time-slot` with NO
//      params; that screen resolves its slot grid from `params.practitionerId`,
//      so the CTA reliably landed on the empty state. It now goes to the
//      directory: pick a provider, then a slot.

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

jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => null,
}));

import { PatientProfileOverviewScreen } from "../PatientProfileOverviewScreen";

describe("PatientProfileOverviewScreen navigation", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("wears detail chrome: no tab bar, no logo, one back button", () => {
    render(<PatientProfileOverviewScreen />);

    // Both tab sets — the failure being locked out is "a detail screen grew a tab
    // bar", and which bar it grew does not matter.
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
    // `Detail AppBar 193:120`: "No logo — the logo belongs only on tab-root
    // screens." <Logo /> carries accessibilityLabel="MedApp".
    expect(screen.queryByLabelText("MedApp")).toBeNull();
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
  });

  it("backs out to the tab root the account menu was opened from", () => {
    // The account menu reaches this screen with `navigate`, which pushes when the
    // route is not already in history — so `back()` is the return path. Not a
    // hardcoded href: every tab root can open the menu, so there is no single up.
    render(<PatientProfileOverviewScreen />);

    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends Book Appointment to the directory, not to a parameterless slot picker", () => {
    render(<PatientProfileOverviewScreen />);

    fireEvent.press(screen.getByLabelText("Book appointment"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/find-care");
    expect(mockPush).not.toHaveBeenCalledWith("/(app)/select-time-slot");
  });
});
