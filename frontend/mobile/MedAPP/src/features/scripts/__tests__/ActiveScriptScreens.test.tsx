// Guard tests for the two Active Script detail screens, added with their
// DetailShell migration.
//
// Both screens rendered a `<BottomNav>` under a `DetailAppBar`, which
// docs/BRAND.md §App shell forbids outright ("Detail screens don't get the
// bottom nav — they get a back button in the app bar instead"). These tests
// exist so the nav cannot come back one screen at a time, and so the scroll
// reserve that used to hold room for it cannot be silently restored.

import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { ActiveScriptShareScreen } from "../ActiveScriptShareScreen";
import { ActiveScriptViewScreen } from "../ActiveScriptViewScreen";

/** Every tab label of BOTH tab sets — none may be reachable on a detail screen. */
const ALL_TAB_LABELS = [
  "Home",
  "Overview",
  "Inbox",
  "Community",
  "Lifestyle",
  "Schedule",
  "Patients",
  "Profile",
];

/**
 * The screen's source with comments stripped.
 *
 * Comments are stripped deliberately: both files now carry a note explaining
 * what the deleted `<BottomNav>` used to be worth (the 80px reserve, the toast
 * offset measured against it). That prose is the reason the numbers below are
 * what they are and must not be deleted to satisfy a grep — so the grep reads
 * CODE only. A test that pushed the explanation out of the file would be the
 * worse outcome.
 */
const source = (file: string) =>
  readFileSync(join(__dirname, "..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

describe.each([
  ["ActiveScriptViewScreen", ActiveScriptViewScreen, "Digital Prescription", "ActiveScriptViewScreen.tsx"],
  ["ActiveScriptShareScreen", ActiveScriptShareScreen, "Share Prescription", "ActiveScriptShareScreen.tsx"],
] as const)("%s", (_name, Screen, title, file) => {
  it("renders exactly one shell app bar, titled", () => {
    render(<Screen />);
    // Two back buttons would mean a hand-rolled bar survived beside the shell's.
    expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
    expect(screen.getByText(title)).toBeTruthy();
  });

  it("shows no tab set — a detail screen gets a back button instead", () => {
    render(<Screen />);
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const tab of ALL_TAB_LABELS) {
      expect(screen.queryByLabelText(tab)).toBeNull();
    }
  });

  it("names no bottom nav in source at all", () => {
    // Structural, not a runtime toggle: the token must be absent, so no
    // condition can put the nav back.
    expect(source(file)).not.toMatch(/BottomNav/);
  });

  it("no longer reserves scroll space for the deleted nav", () => {
    // 140 = the nav's 80 outer height + 60 of real breathing room. Keeping 140
    // after deleting the nav leaves an 80px hole under the content.
    expect(source(file)).toMatch(/const SCROLL_RESERVE = 60;/);
    expect(source(file)).not.toMatch(/paddingBottom: 140/);
  });

  it("lets the shell own the status bar rather than freezing it light-mode", () => {
    const text = source(file);
    expect(text).not.toMatch(/StatusBar/);
    expect(text).not.toMatch(/SafeAreaView/);
  });
});

it("ActiveScriptViewScreen re-derives the toast offset off the deleted nav", () => {
  // `bottom: 110` was 30 above the top edge of the 80px nav; with no nav the
  // toast would float mid-screen.
  const text = source("ActiveScriptViewScreen.tsx");
  expect(text).toMatch(/const TOAST_BOTTOM = 30;/);
  expect(text).not.toMatch(/bottom: 110/);
});
