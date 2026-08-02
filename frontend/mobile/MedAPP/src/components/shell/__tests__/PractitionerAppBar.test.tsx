// Locks the practitioner app bar's behaviour (Figma 656:850).
//
// The unread badge is asserted here because the SCREEN can't demonstrate it —
// nothing in the app models notification counts yet, so onboarding_status passes
// no count and the badge never renders in the running build. These tests are the
// evidence that the treatment exists and is correct for the day a notifications
// store lands, and that it stays absent (rather than showing a fabricated "3")
// until then.

import { render, screen, fireEvent } from "@testing-library/react-native";

// `mock`-prefixed so Jest's out-of-scope-variable guard allows the factory to
// close over them (see the babel-plugin-jest-hoist rule).
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNav = { canGoBack: true };

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: () => mockBack(),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => mockNav.canGoBack,
  },
}));

import { PractitionerAppBar } from "../PractitionerAppBar";

describe("PractitionerAppBar", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockReplace.mockClear();
    mockNav.canGoBack = true;
  });

  it("renders back, the logo and the bell", () => {
    render(<PractitionerAppBar />);
    expect(screen.getByLabelText("Go back")).toBeTruthy();
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("pops the stack on back", () => {
    render(<PractitionerAppBar />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("hides back when there is nothing to pop and no fallback", () => {
    mockNav.canGoBack = false;
    render(<PractitionerAppBar />);
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("hides back for a tab root even when navigation can pop", () => {
    mockNav.canGoBack = true;
    render(<PractitionerAppBar hideBack />);
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("falls back to a given href when there is nothing to pop", () => {
    mockNav.canGoBack = false;
    render(<PractitionerAppBar backFallbackHref={"/(app)/index" as never} />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(app)/index");
  });

  it("shows no unread badge when no count is supplied", () => {
    render(<PractitionerAppBar />);
    // The count is part of the accessible name, so its absence is observable.
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("shows no unread badge at zero", () => {
    render(<PractitionerAppBar unreadCount={0} />);
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("renders the unread count and announces it", () => {
    render(<PractitionerAppBar unreadCount={3} />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByLabelText("Notifications, 3 unread")).toBeTruthy();
  });

  it("clamps a large unread count", () => {
    render(<PractitionerAppBar unreadCount={1204} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("says the bell is unavailable until a handler is wired", () => {
    render(<PractitionerAppBar />);
    expect(screen.getByLabelText("Notifications").props.accessibilityHint).toBe(
      "Not available yet",
    );
  });
});
