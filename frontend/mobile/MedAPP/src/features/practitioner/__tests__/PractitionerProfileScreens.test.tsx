// Guard tests for the two practitioner profile screens, added with their
// DetailShell migration.
//
// Both rendered a `<BottomNav>` under a `DetailAppBar` — forbidden by
// docs/BRAND.md §App shell ("Detail screens don't get the bottom nav — they get
// a back button in the app bar instead"). The social profile's nav was the more
// load-bearing of the four in this round: it routed to all five patient tab
// roots. It is still deleted — the back button returns the user to the tab root
// they came from (Explore or Community), which carries the real nav.

import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  // The telehealth profile reads route params to build the waiting-room hand-off. Returning
  // {} exercises the no-params path, which is what these shell/CTA assertions care about.
  useLocalSearchParams: () => ({}),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { PractitionerSocialProfileScreen } from "../PractitionerSocialProfileScreen";
import { PractitionerTelehealthProfileScreen } from "../PractitionerTelehealthProfileScreen";

/**
 * `useSafeAreaInsets` (the telehealth CTA reads it now that it owns the bottom
 * inset) needs a provider with real metrics; the app root supplies one.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (Screen: () => React.JSX.Element) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Screen />
    </SafeAreaProvider>,
  );

const ALL_TAB_LABELS = [
  "Home",
  "Overview",
  "Inbox",
  "Community",
  "Lifestyle",
  "Schedule",
  "Patients",
];

/**
 * The screen's source with comments stripped.
 *
 * Both files keep a note recording what the deleted `<BottomNav>` was worth —
 * the telehealth screen's whole CTA geometry was derived from the nav's 80px
 * height, and that derivation is why the new constants are what they are. The
 * greps below therefore read CODE only, so the explanation can stay in the file
 * instead of being deleted to satisfy a matcher.
 */
const source = (file: string) =>
  readFileSync(join(__dirname, "..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe.each([
  [
    "PractitionerSocialProfileScreen",
    PractitionerSocialProfileScreen,
    "PractitionerSocialProfileScreen.tsx",
    "Provider Profile",
  ],
  [
    "PractitionerTelehealthProfileScreen",
    PractitionerTelehealthProfileScreen,
    "PractitionerTelehealthProfileScreen.tsx",
    "Provider profile",
  ],
] as const)("%s", (_name, Screen, file, title) => {
  it("renders exactly one shell app bar, titled", () => {
    renderScreen(Screen);
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    expect(screen.getByText(title)).toBeTruthy();
  });

  it("shows no tab set — a detail screen gets a back button instead", () => {
    renderScreen(Screen);
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const tab of ALL_TAB_LABELS) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("names no bottom nav in source at all", () => {
    expect(source(file)).not.toMatch(/BottomNav\b/);
  });

  it("lets the shell own the status bar and the safe area edges", () => {
    const text = source(file);
    expect(text).not.toMatch(/StatusBar/);
    // The telehealth screen still imports `useSafeAreaInsets` for its CTA, but
    // neither screen may hand-roll a `<SafeAreaView>` wrapper again.
    expect(text).not.toMatch(/<SafeAreaView/);
  });
});

describe("PractitionerSocialProfileScreen", () => {
  it("keeps the reviews tab bar, which is content and not app navigation", () => {
    // The in-page tabs are `accessibilityRole="tab"` too — deleting the bottom
    // nav must not have taken them with it.
    renderScreen(PractitionerSocialProfileScreen);
    expect(screen.getByLabelText("Reviews").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Certifications")).toBeTruthy();
  });

  it("drops the nav's 80px scroll reserve", () => {
    const text = source("PractitionerSocialProfileScreen.tsx");
    expect(text).toMatch(/const SCROLL_RESERVE = 40;/);
    expect(text).not.toMatch(/paddingBottom: 120/);
  });
});

describe("PractitionerTelehealthProfileScreen", () => {
  it("re-derives the sticky CTA off the bottom inset, not the deleted nav", () => {
    const text = source("PractitionerTelehealthProfileScreen.tsx");
    // `bottom: 82` was the nav's 80 plus a 2px gap; `paddingBottom: 168` was
    // that 82 plus the CTA. Both are meaningless without the nav.
    expect(text).not.toMatch(/bottom: 82/);
    expect(text).not.toMatch(/paddingBottom: 168/);
    expect(text).toMatch(/const ctaBottom = CTA_EDGE_GAP \+ insets\.bottom;/);
    // The screen claims the inset itself, so the shell must not also claim it.
    expect(text).toMatch(/claimsBottomInset=\{false\}/);
  });

  it("drops the z-index that only meant anything against the nav", () => {
    expect(source("PractitionerTelehealthProfileScreen.tsx")).not.toMatch(/zIndex: 30/);
  });

  it("keeps the Book Appointment CTA reachable", () => {
    renderScreen(PractitionerTelehealthProfileScreen);
    expect(screen.getByLabelText("Book appointment")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Colour-literal drift guard (dark-mode pass).
//
// PractitionerTelehealthProfileScreen was on the "does not flip" list too, and
// dark-32 shows it flipping correctly: it is pure composition over DetailShell,
// Card, SectionHeader, InfoCallout, DockedActionBar and ProviderIdentity, and
// even its loading skeleton uses `bg-surface-container-low` rather than a grey.
// Locked here so it stays that way.
//
// Scoped to the telehealth profile deliberately: PractitionerSocialProfileScreen
// still carries literals (including a `text-white` follow button) and belongs to
// a different batch — asserting on it here would fail on someone else's file.
// ---------------------------------------------------------------------------
describe("PractitionerTelehealthProfileScreen — holds no colour of its own", () => {
  const source = readFileSync(
    join(__dirname, "..", "PractitionerTelehealthProfileScreen.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("contains no hex, no rgb()/rgba(), and no CSS colour word", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/);
    expect(source).not.toMatch(/\b(white|black)\b/);
  });

  it("uses no Tailwind default palette class", () => {
    expect(source).not.toMatch(
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
  });
});
