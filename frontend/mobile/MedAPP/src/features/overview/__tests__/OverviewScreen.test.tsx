// Locks the shell migration for the Overview TAB ROOT.
//
// The three things most likely to regress here are (1) the hand-rolled bar
// creeping back, (2) a back button appearing on a tab root, and (3) the
// BottomNav routing being lost when it moved from <BottomNav onTabPress> onto
// <PatientShell onTabPress>. Each has an assertion below.

import { screen, fireEvent } from "@testing-library/react-native";
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

// OverviewScreen now reads live vitals, which pulls in three things this suite
// did not previously need. Predicted in docs/api/inbox_service.md after the
// chat migration hit the identical trio:
//   1. `@/hooks/use-current-user` -> auth-store -> `@/lib/config`, which THROWS
//      at require time under Jest (the landmine AccountMenu.tsx documents).
//   2. `./api` -> `@/lib/api/client` -> the same throw.
//   3. react-query hooks cannot be conditional, so a QueryClientProvider is
//      required even though these cases never exercise a live fetch.
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "me", displayName: "Ama Mensah", avatarUrl: null }),
}));
jest.mock("../api", () => ({
  ehrApi: {
    getSummary: jest.fn(async () => ({ patient: null, latestVitals: [], activeConsents: [] })),
    getBundle: jest.fn(async () => ({ patient: null, vitals: [], consents: [] })),
    listVitals: jest.fn(async () => []),
  },
}));

import { OverviewScreen } from "../OverviewScreen";

describe("OverviewScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("renders inside PatientShell — canonical bar, no back button on a tab root", () => {
    render(<OverviewScreen />);

    // The shared bar: logo LEFT, avatar + bell right.
    expect(screen.getByLabelText("MedApp")).toBeTruthy();
    expect(screen.getByLabelText("Your profile photo")).toBeTruthy();
    expect(screen.getByLabelText("Notifications")).toBeTruthy();

    // `hideBack` defaults to true and this screen must not override it, even
    // though router.canGoBack() is true.
    expect(screen.queryByLabelText("Go back")).toBeNull();

    // The patient tab set, with Overview selected.
    expect(screen.getByLabelText("Home")).toBeTruthy();
    expect(screen.getByLabelText("Overview")).toBeTruthy();
    expect(screen.getByLabelText("Lifestyle")).toBeTruthy();
    expect(screen.getByLabelText("Overview").props.accessibilityState.selected).toBe(true);
  });

  it("keeps the bar's title as the page heading and the body content intact", () => {
    render(<OverviewScreen />);

    expect(screen.getByText("Health Hub")).toBeTruthy();
    expect(screen.getByText("Health Trends")).toBeTruthy();
    expect(screen.getByText("Clinical Milestones")).toBeTruthy();
    expect(screen.getByText("Active Scripts")).toBeTruthy();
  });

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

  it("still routes the in-body script and medication actions", () => {
    render(<OverviewScreen />);

    fireEvent.press(screen.getByLabelText("View active medications"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/active-medications");

    fireEvent.press(screen.getAllByLabelText("View Rx")[0]);
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/(app)/active-script-view" }),
    );
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
