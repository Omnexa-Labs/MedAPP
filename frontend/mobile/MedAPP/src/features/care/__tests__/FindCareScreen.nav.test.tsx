// Locks the BOTTOM-NAV wiring for find-care.
//
// SCOPE: tab wiring only. The provider-card routing on this screen is another
// agent's work this round, so this file deliberately asserts nothing about the
// cards and mocks the directory away to an empty result.
//
// find-care is the case the shared default had to be designed around: it is a
// PUSHED screen that borrows the Home highlight, not a tab root. Its old inline
// switch covered TWO of five (home via `router.back()`, inbox via push) —
// Overview, Community and Lifestyle silently did nothing.

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

// The real hook reaches @tanstack/react-query and the care API. This test is
// about the tab bar, so the directory is stubbed to a settled empty state.
jest.mock("@/features/care/hooks/use-directory", () => ({
  useDirectory: () => ({ entries: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

import { FindCareScreen } from "../FindCareScreen";

describe("FindCareScreen bottom nav", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("routes ALL FIVE tabs from a pushed screen — three of them did nothing before", () => {
    render(<FindCareScreen />);

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
  });

  it("sends Home to Home, not to wherever the user came from", () => {
    // The old handler called `router.back()`. Find Care is reachable from more
    // than one place, so "back" and "Home" are different destinations and only
    // one of them is what the Home tab promises.
    render(<FindCareScreen />);

    fireEvent.press(screen.getByLabelText("Home"));
    expect(mockReplace).toHaveBeenCalledWith("/(app)");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
