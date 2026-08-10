// Locks the shell migration for the Lifestyle Hub TAB ROOT.
//
// Same three regressions the Overview test guards: (1) the hand-rolled bar
// creeping back, (2) a back button appearing on a tab root, and (3) the
// BottomNav routing being lost when it moved from <BottomNav onTabPress> onto
// <PatientShell onTabPress>. Plus the bottom reserve, which is the one thing a
// shell migration silently breaks — BottomNav is an overlay, so the padding
// must stay with the screen.

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// `useCurrentUser` is mocked rather than the store behind it: importing
// `@/store/auth-store` pulls in `@/lib/api/client` -> `@/lib/config`, which
// throws unless app.config.ts extras are present.
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => null,
}));

// The sleep trend now reads wearable_sync_service, which pulls `@/lib/api/client`
// -> `@/lib/config` and its require-time throw, plus a react-query provider.
// Same trio every migrated screen has needed.
jest.mock("@/features/wearables/api", () => ({
  wearablesApi: { getSummary: jest.fn(async () => ({ recentSamples: [] })) },
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
    // Sleep is the one chart left, and the only one that ever read a service.
    expect(screen.getByText("Sleep Trend")).toBeTruthy();
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

  it("still routes the in-body CTA to the daily log", () => {
    render(<LifestyleHubScreen />);

    fireEvent.press(screen.getByLabelText("Go to daily log"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/lifestyle-manage");
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

// ---------------------------------------------------------------------------
// The constants that were drawn as this patient's week (2026-08-08)
// ---------------------------------------------------------------------------
// Every card here except Sleep was a module-level constant that no action could
// change: log 3.4L of water on the Manage screen and the Hub still read
// "Today: 2.1L". The worst of them was SEED_MEDS — a NAMED PRESCRIPTION LIST
// with an adherence counter and a working "Mark Taken" button, which a patient
// could read as their own regimen.

describe("LifestyleHubScreen shows no fabricated log", () => {
  const code = () =>
    readFileSync(join(__dirname, "..", "LifestyleHubScreen.tsx"), "utf8")
      // Comments stripped: the header names what was deleted, on purpose.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ 	]*\/\/.*$/gm, "");

  it("names no medication and keeps no adherence counter", () => {
    render(<LifestyleHubScreen />);
    expect(screen.queryByText("Daily Medications")).toBeNull();
    expect(screen.queryByText("Lisinopril 10mg")).toBeNull();
    expect(screen.queryByText("2 of 3 taken")).toBeNull();
    expect(screen.queryByLabelText("Mark Multivitamin as taken")).toBeNull();

    const src = code();
    expect(src).not.toMatch(/SEED_MEDS/);
    expect(src).not.toMatch(/Lisinopril|Multivitamin|Vitamin D3/);
    expect(src).not.toMatch(/Mark Taken/);
  });

  it("draws no chart of numbers nothing can change", () => {
    render(<LifestyleHubScreen />);
    for (const gone of ["Daily Nutrient Intake", "Mood Over Time", "Water Trend", "Weekly Active"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    // The literal that gave the game away: a logged 3.4L never moved it.
    expect(screen.queryByText(/Today: 2\.1L/)).toBeNull();

    const src = code();
    expect(src).not.toMatch(/NUTRIENTS|const MOOD|const WATER/);
    expect(src).not.toMatch(/2\.1L|1,850|Vitamin B2/);
  });

  it("keeps the sample-data label on the one fallback that survives", () => {
    // Sleep may fall back, because it SAYS it has. That label is the whole
    // reason the fallback is legitimate here and was not anywhere else.
    render(<LifestyleHubScreen />);
    expect(
      screen.getByText("Sample data — connect a device to see your own sleep."),
    ).toBeTruthy();
  });

  it("carries no frozen colour literal", () => {
    // 22 of them, including two near-black chart labels that were invisible on
    // the dark page.
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(src).not.toMatch(/rgba?\s*\(/);
  });
});
