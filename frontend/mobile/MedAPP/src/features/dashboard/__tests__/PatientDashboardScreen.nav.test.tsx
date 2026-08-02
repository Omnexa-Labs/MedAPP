// Locks the BOTTOM-NAV wiring for patient-dashboard.
//
// This screen was the worst case in the audit: it rendered the five-tab bar and
// passed no `onTabPress` at all, so every tab was inert — a bar that looks like
// navigation and is not. It is also NOT the Home tab (it is a parallel
// dashboard cut at its own route) even though it renders `activeTab="home"`,
// so `isTabRoot={false}` and Home must navigate like the rest.

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

jest.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ user: null }),
}));

import { PatientDashboardScreen } from "../PatientDashboardScreen";

describe("PatientDashboardScreen bottom nav", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("routes ALL FIVE tabs — every one of them was inert before", () => {
    render(<PatientDashboardScreen />);

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

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("does not swallow Home just because Home is the highlighted tab", () => {
    // The `isTabRoot={false}` contract. Highlight is cosmetic here; this screen
    // is not /(app), so Home is a real destination.
    render(<PatientDashboardScreen />);
    expect(screen.getByLabelText("Home").props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByLabelText("Home"));
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
  });
});
