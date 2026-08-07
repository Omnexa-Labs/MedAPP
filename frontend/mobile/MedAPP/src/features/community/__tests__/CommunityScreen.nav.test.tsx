// Locks the BOTTOM-NAV wiring for the Community TAB ROOT.
//
// Before this pass Community's inline `onTabPress` covered three of five: it
// routed Home, Overview and Lifestyle and let `inbox` fall through with a
// comment calling the route "still a stub" — /(app)/inbox had already shipped,
// so the tab was simply dead. The switch is gone; PatientShell owns the map.
//
// Named `.nav` so it stays out of the way of a future full-screen test.

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

// The store is mocked rather than exercised: importing `@/store/auth-store`
// for real pulls in `@/lib/api/client` -> `@/lib/config`, which throws unless
// app.config.ts extras are present. Same reason LifestyleHubScreen's test
// mocks `useCurrentUser`.
jest.mock("@/store/auth-store", () => ({
  useAuthStore: () => ({ user: null }),
}));

// CommunityScreen now reads the live feed, which pulls in the trio every
// migrated screen has needed: `./api` and `@/store/auth-store` both reach
// `@/lib/config`, whose readExtra() throws at require time under Jest, and
// react-query hooks cannot be conditional so a provider is mandatory.
jest.mock("../api", () => ({
  communityApi: {
    listFeed: jest.fn(async () => []),
    listQA: jest.fn(async () => []),
  },
}));

import { CommunityScreen } from "../CommunityScreen";

describe("CommunityScreen bottom nav", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it("marks Community active and shows no back button on a tab root", () => {
    render(<CommunityScreen />);
    expect(screen.getByLabelText("Community").props.accessibilityState.selected).toBe(true);
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("routes ALL FOUR other tabs, Inbox included, and never grows the stack", () => {
    render(<CommunityScreen />);

    for (const [label, href] of [
      ["Home", "/(app)"],
      ["Overview", "/(app)/overview"],
      ["Inbox", "/(app)/inbox"],
      ["Lifestyle", "/(app)/lifestyle"],
    ] as const) {
      mockReplace.mockClear();
      fireEvent.press(screen.getByLabelText(label));
      expect(mockReplace).toHaveBeenCalledWith(href);
    }

    // One semantic everywhere: replace, so Android back exits rather than
    // walking tab history.
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("makes its own tab a no-op — this IS the Community root", () => {
    render(<CommunityScreen />);
    fireEvent.press(screen.getByLabelText("Community"));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
