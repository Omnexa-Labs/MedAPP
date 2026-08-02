// Locks the DetailShell migration for LifestyleManageScreen.
//
// Three things a shell migration can break on this screen:
//   1. The `close` affordance. This is a task/modal flow, so the bar's left
//      button is a ✕, not a chevron — `backIcon="close"` must reach the bar
//      through the shell, and its label must stay "Close".
//   2. The bottom reserve. `paddingBottom: 120` exists for the sticky
//      "Save & Close" FAB, NOT for a bottom nav (this screen never had one), so
//      it must survive — dropping it hides the Mindset card behind the FAB.
//   3. The FAB's inset. It is absolutely positioned and renders no
//      `<SafeAreaView edges={["bottom"]}>` of its own, so it must NOT ask the
//      shell to release the bottom inset.
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

describe("LifestyleManageScreen — the sticky FAB and its reserve", () => {
  it("lets the SHELL claim the bottom inset, because the FAB does not", () => {
    render(<LifestyleManageScreen />);
    const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
    expect(areas).toHaveLength(1);
    // The old wrapper passed ["top","left","right"] with no bottom nav in that
    // space, so `bottom-6` measured from the raw screen edge and the FAB sat in
    // the gesture bar. Nothing here claims the inset itself.
    expect(areas[0].props.edges).toEqual(["top", "left", "right", "bottom"]);
    expect(code()).not.toMatch(/claimsBottomInset/);
  });

  it("keeps the 120px reserve the sticky FAB needs", () => {
    render(<LifestyleManageScreen />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.contentContainerStyle).toEqual({
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 120,
      gap: 24,
    });
  });

  it("still saves and closes", () => {
    render(<LifestyleManageScreen />);
    fireEvent.press(screen.getByLabelText("Save and close"));
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

    // Manual ingredient
    fireEvent.changeText(screen.getByLabelText("Add ingredient manually"), "Lentils");
    fireEvent.press(screen.getByLabelText("Add ingredient"));
    expect(screen.getByText("Lentils")).toBeTruthy();

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

  it("reveals the AI recommendation and saves from it", () => {
    render(<LifestyleManageScreen />);
    expect(screen.queryByText("Grilled Salmon & Quinoa")).toBeNull();
    fireEvent.press(screen.getByLabelText("Generate meal with AI"));
    expect(screen.getByText("Grilled Salmon & Quinoa")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Save meal and close"));
    expect(mockBack).toHaveBeenCalled();
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

  it("gives the glyphs that sit ON `bg-primary` the `on-primary` pair", () => {
    expect(code()).toMatch(/useTokenColor\("on-primary"\)/);
  });
});
