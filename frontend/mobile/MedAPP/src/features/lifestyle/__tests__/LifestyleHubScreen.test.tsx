// Locks the shell migration for the Lifestyle Hub TAB ROOT.
//
// Same three regressions the Overview test guards: (1) the hand-rolled bar
// creeping back, (2) a back button appearing on a tab root, and (3) the
// BottomNav routing being lost when it moved from <BottomNav onTabPress> onto
// <PatientShell onTabPress>. Plus the bottom reserve, which is the one thing a
// shell migration silently breaks — BottomNav is an overlay, so the padding
// must stay with the screen.

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

// `useCurrentUser` is mocked rather than the store behind it: importing
// `@/store/auth-store` pulls in `@/lib/api/client` -> `@/lib/config`, which
// throws unless app.config.ts extras are present.
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => null,
}));

import { LifestyleHubScreen } from "../LifestyleHubScreen";

describe("LifestyleHubScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("renders inside PatientShell — canonical bar, no back button on a tab root", () => {
    render(<LifestyleHubScreen />);

    // The shared bar: logo LEFT, avatar + bell right. None of these existed
    // before the migration — the screen drew a title and a silhouette plate.
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
    expect(screen.getByLabelText("Your profile")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();

    // `hideBack` defaults to true and this screen must not override it, even
    // though router.canGoBack() is true.
    expect(screen.queryByLabelText("Go back")).toBeNull();

    // The patient tab set, with Lifestyle selected.
    expect(screen.getByLabelText("Lifestyle").props.accessibilityState.selected).toBe(true);
  });

  it("keeps the bar's title as the page heading and the body content intact", () => {
    render(<LifestyleHubScreen />);

    expect(screen.getByText("Lifestyle Hub")).toBeTruthy();
    expect(screen.getByText("Your Wellness Path")).toBeTruthy();
    expect(screen.getByText("Daily Medications")).toBeTruthy();
    expect(screen.getByText("Daily Nutrient Intake")).toBeTruthy();
    expect(screen.getByText("Sleep Trend")).toBeTruthy();
    expect(screen.getByText("Mood Over Time")).toBeTruthy();
  });

  it("routes ALL FOUR other tabs, Inbox included, and never grows the stack", () => {
    render(<LifestyleHubScreen />);

    // Inbox is the regression this test exists for: this screen's old inline
    // switch omitted it entirely, so the tab silently did nothing.
    for (const [label, href] of [
      ["Home", "/(app)"],
      ["Overview", "/(app)/overview"],
      ["Inbox", "/(app)/inbox"],
      ["Community", "/(app)/community"],
    ] as const) {
      mockReplace.mockClear();
      fireEvent.press(screen.getByLabelText(label));
      expect(mockReplace).toHaveBeenCalledWith(href);
    }

    // One semantic: tab switching replaces, so Android back leaves the app
    // rather than walking tab history.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("makes its own tab a no-op — this IS the Lifestyle root", () => {
    render(<LifestyleHubScreen />);

    fireEvent.press(screen.getByLabelText("Lifestyle"));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("still routes the in-body CTAs and keeps the medication state local", () => {
    render(<LifestyleHubScreen />);

    fireEvent.press(screen.getByLabelText("Go to daily log"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/lifestyle-manage");

    fireEvent.press(screen.getByLabelText("View full medication schedule"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/lifestyle-manage");

    expect(screen.getByText("2 of 3 taken")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Mark Multivitamin as taken"));
    expect(screen.getByText("3 of 3 taken")).toBeTruthy();
  });

  it("reserves scroll room for the absolutely-positioned bottom nav", () => {
    render(<LifestyleHubScreen />);

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
