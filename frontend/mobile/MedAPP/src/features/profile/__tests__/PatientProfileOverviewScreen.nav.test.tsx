// Locks the navigation out of patient-profile-overview.
//
// Two things:
//   1. The bottom nav. No tab maps to Profile, so this pushed screen borrows
//      the Home highlight — `isTabRoot={false}`, and Home must still navigate.
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

  it("routes ALL FIVE tabs, Home included, from a screen that is not a tab root", () => {
    render(<PatientProfileOverviewScreen />);

    for (const [label, href] of [
      ["Home", "/(app)"],
      ["Overview", "/(app)/overview"],
      ["Inbox", "/(app)/inbox"],
      ["Community", "/(app)/community"],
      ["Lifestyle", "/(app)/lifestyle"],
    ] as const) {
      mockReplace.mockClear();
      fireEvent.press(screen.getByLabelText(label));
      expect(mockReplace).toHaveBeenCalledWith(href);
    }

    // Home used to be `router.back()` and the rest `push`. One semantic now.
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("sends Book Appointment to the directory, not to a parameterless slot picker", () => {
    render(<PatientProfileOverviewScreen />);

    fireEvent.press(screen.getByLabelText("Book appointment"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/find-care");
    expect(mockPush).not.toHaveBeenCalledWith("/(app)/select-time-slot");
  });
});
