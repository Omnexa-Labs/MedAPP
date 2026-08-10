// Locks the DetailShell migration for LifestyleManageScreen.
//
// Three things a shell migration can break on this screen:
//   1. The `close` affordance. This is a task/modal flow, so the bar's left
//      button is a ✕, not a chevron — `backIcon="close"` must reach the bar
//      through the shell, and its label must stay "Close".
//   2. The bottom reserve, which went from 120 to 32 when the sticky FAB was
//      deleted (see below) — 120 over no FAB is ~90px of dead space.
//   3. The bottom inset, which the SHELL claims. Nothing on this screen is
//      pinned to the bottom edge any more.
//
// Plus the frozen `<StatusBar style="dark" />`, asserted across both modes
// because a single-mode render cannot tell a resolved value from a frozen one.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScrollView } from "react-native";
import { screen, fireEvent } from "@testing-library/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
  },
}));

const mockScheme = { value: "light" as "light" | "dark" };

jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

import { LifestyleManageScreen } from "../LifestyleManageScreen";

const SOURCE_PATH = join(__dirname, "..", "LifestyleManageScreen.tsx");

function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

beforeEach(() => {
  mockBack.mockClear();
  mockScheme.value = "light";
});

describe("LifestyleManageScreen — renders through DetailShell", () => {
  it("keeps the title and the task screen's CLOSE affordance, not a back chevron", () => {
    render(<LifestyleManageScreen />);
    expect(screen.getByText("Lifestyle Management")).toBeTruthy();
    // DetailAppBar's default label for `backIcon="close"`.
    expect(screen.getByLabelText("Close")).toBeTruthy();
    expect(screen.queryByLabelText("Go back")).toBeNull();
  });

  it("still dismisses to the Hub", () => {
    render(<LifestyleManageScreen />);
    fireEvent.press(screen.getByLabelText("Close"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("renders no bottom nav — a detail screen must not have one", () => {
    render(<LifestyleManageScreen />);
    for (const label of ["Home", "Overview", "Inbox", "Community", "Lifestyle"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    expect(code()).not.toMatch(/BottomNav/);
  });

  it("hand-rolls no wrapper of its own any more", () => {
    const src = code();
    expect(src).not.toMatch(/SafeAreaView/);
    expect(src).not.toMatch(/\bStatusBar\b/);
    expect(src).not.toMatch(/style="dark"/);
    expect(src).toMatch(/DetailShell/);
    expect(src).not.toMatch(/<DetailAppBar/);
  });
});

describe("LifestyleManageScreen — status bar follows the scheme", () => {
  const statusBarStyle = () => {
    const bars = screen.UNSAFE_queryAllByType(StatusBar);
    expect(bars).toHaveLength(1);
    return bars[0].props.style;
  };

  it("produces a DIFFERENT style in the two modes — the frozen `dark` fails this", () => {
    mockScheme.value = "light";
    render(<LifestyleManageScreen />);
    const light = statusBarStyle();
    expect(light).toBe("dark");
    screen.unmount();

    mockScheme.value = "dark";
    render(<LifestyleManageScreen />);
    expect(statusBarStyle()).toBe("light");
    expect(statusBarStyle()).not.toBe(light);
  });
});

describe("LifestyleManageScreen — the bottom edge", () => {
  it("lets the SHELL claim the bottom inset", () => {
    render(<LifestyleManageScreen />);
    const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
    expect(areas).toHaveLength(1);
    // The old wrapper passed ["top","left","right"] with no bottom nav in that
    // space, so the FAB's `bottom-6` measured from the raw screen edge and sat
    // in the gesture bar. The FAB is gone and nothing claims the inset itself.
    expect(areas[0].props.edges).toEqual(["top", "left", "right", "bottom"]);
    expect(code()).not.toMatch(/claimsBottomInset/);
  });

  it("drops the 120px reserve along with the FAB it was reserved for", () => {
    render(<LifestyleManageScreen />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.contentContainerStyle).toEqual({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 32,
      gap: 24,
    });
  });

  // ---------------------------------------------------------------------
  // "Save & Close" saved nothing (2026-08-08)
  // ---------------------------------------------------------------------
  // The sticky extended FAB read "Save & Close" over a `task-alt` tick and its
  // whole implementation was `router.back()`. Sleep, water, workout, mood and
  // stress lived in `useState` and were discarded on dismiss; there is no
  // lifestyle API and no device-storage write anywhere in the repo. A control
  // shaped, labelled and glyphed like a save IS a claim that the data was
  // recorded.
  it("offers no control that claims to save", () => {
    render(<LifestyleManageScreen />);
    expect(screen.queryByLabelText("Save and close")).toBeNull();
    expect(screen.queryByText("Save & Close")).toBeNull();
    expect(screen.queryByLabelText("Save meal and close")).toBeNull();

    const src = code();
    expect(src).not.toMatch(/Save/);
    expect(src).not.toMatch(/task-alt/);
  });

  it("says plainly that nothing is stored, before the user types anything", () => {
    render(<LifestyleManageScreen />);
    expect(screen.getByTestId("lifestyle-not-stored")).toBeTruthy();
    expect(screen.getByText(/Nothing you enter here is stored yet/)).toBeTruthy();
  });

  it("still dismisses — the bar's close is the only exit, and it works", () => {
    render(<LifestyleManageScreen />);
    fireEvent.press(screen.getByLabelText("Close"));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe("LifestyleManageScreen — body behaviour is untouched", () => {
  it("keeps the logging state, the pickers and the ingredient chips working", () => {
    render(<LifestyleManageScreen />);

    // Stepper
    expect(screen.getByText("07:30")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Increase Sleep Duration"));
    expect(screen.getByText("08:00")).toBeTruthy();

    // Mood + stress
    fireEvent.press(screen.getByLabelText("Mood: Great"));
    expect(screen.getByLabelText("Mood: Great").props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText("Set stress to 9"));
    expect(screen.getByText("High")).toBeTruthy();

    // The workout picker Modal still opens (it moved inside the shell body; a
    // Modal renders into its own host window, so the tree position is inert).
    expect(screen.getAllByText("Workout Plan")).toHaveLength(1); // the field label only
    fireEvent.press(
      screen.getByLabelText("Workout plan: Active Recovery (Walk/Yoga). Tap to change"),
    );
    // Now the label AND the sheet's heading.
    expect(screen.getAllByText("Workout Plan")).toHaveLength(2);
    fireEvent.press(screen.getByText("Rest Day"));
    expect(screen.getByText("Rest Day")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // The AI meal planner fabricated dietary advice about a workout that never
  // happened (2026-08-08)
  // -------------------------------------------------------------------------
  // "Generate with AI" revealed a hardcoded recommendation whose "AI Reasoning"
  // read "Based on your intense morning workout, your muscles require
  // high-quality protein…". There was no model, no request, and no workout —
  // this app has never recorded one. "Upload Food Photo" beneath it had no
  // `onPress` at all, under the caption "AI will identify ingredients
  // automatically".
  it("generates no meal, and claims no analysis of the patient", () => {
    render(<LifestyleManageScreen />);
    expect(screen.queryByLabelText("Generate meal with AI")).toBeNull();
    expect(screen.queryByText("Grilled Salmon & Quinoa")).toBeNull();
    expect(screen.queryByLabelText("Upload food photo")).toBeNull();

    const src = code();
    expect(src).not.toMatch(/RECOMMENDATION/);
    expect(src).not.toMatch(/AI Reasoning/);
    expect(src).not.toMatch(/intense morning workout/);
    expect(src).not.toMatch(/Generate with AI/);
    expect(src).not.toMatch(/Upload Food Photo/);
  });
});

// ---------------------------------------------------------------------------
// Colour-literal drift guard (dark-mode pass).
//
// The dark capture showed this screen half-flipped: the card, the page and the
// labels were tokenised, but "Generate with AI" drew a `#ffffff` bolt on
// `bg-primary` (mint in dark mode) and the sticky FAB did the same with its
// check glyph. The stress track was worse than a wrong colour — BOTH halves
// were frozen (`#00685f` on / `#e4e9e7` off), so in dark mode a filled step and
// an empty step were the same two light-mode values on a near-black page and
// the control read as decoration.
// ---------------------------------------------------------------------------
describe("LifestyleManageScreen — no literal colours survive", () => {
  it("contains no hex anywhere outside comments", () => {
    expect(code()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("contains no raw rgb()/rgba()", () => {
    expect(code()).not.toMatch(/\brgba?\s*\(/);
  });

  it("names no CSS colour word — `border-white/60` was the last one here", () => {
    expect(code()).not.toMatch(/\b(white|black)\b/);
  });

  it("uses no Tailwind default palette class", () => {
    expect(code()).not.toMatch(
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    );
  });

  // The two `#ffffff` glyphs this case was written for — the "Generate with AI"
  // bolt and the FAB's check — went with the controls themselves. What is left
  // to assert is the rule: every colour here comes from the token map.
  it("resolves every glyph colour by token name", () => {
    expect(code()).toMatch(/useTokenColor\("/);
  });
});
