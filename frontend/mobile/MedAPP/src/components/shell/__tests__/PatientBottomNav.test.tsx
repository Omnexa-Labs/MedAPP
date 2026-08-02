// Locks the PATIENT bottom nav (Figma 101:143), which lives at
// src/features/home/components/BottomNav.tsx. The spec sits here, next to
// PatientShell and the practitioner nav's spec, because the bar is shell chrome
// and this is where the shell contract is asserted — features/home just happens
// to be where the file was first written.
//
// Two separate regressions are guarded here, and both need SOURCE assertions
// rather than render assertions alone:
//
//  1. Frozen light-mode literals. The bar once shipped `shadowColor: "#475569"`,
//     `#f4fffc` and `#3d4947`, so the SHARED nav rendered identically in dark
//     mode. A render assertion would not have caught it — the light values were
//     correct — so the source itself is asserted to contain no colour literal and
//     no shadow, and the resolved glyph colours are asserted to differ per mode.
//
//  2. The active PILL. 101:143 now carries the practitioner treatment: the five
//     "Icon Backing" ellipses are deleted, the TabItem frames are `fills: []`,
//     and the active state is colour alone (`primary` on icon AND label). The
//     bar previously drew a filled `primary-container` pill with
//     `on-primary-container` contents, disclosed as a deliberate deviation. The
//     product owner ruled for Figma, so the absence of any fill on a tab item is
//     asserted structurally — a pill can be reintroduced with one class, and
//     `bg-primary-container` renders as a style that is tedious to assert on.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithSafeArea as render } from "@/test/safe-area";
import { Icon } from "@/components/ui";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };

// nativewind is the only source of the rendered scheme (src/lib/theme.ts reads
// it, src/lib/tokens.ts resolves against it), so this is the seam for asserting
// both modes without a native colour-scheme module.
jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

import { BottomNav } from "@/features/home/components/BottomNav";

const SOURCE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "features",
  "home",
  "components",
  "BottomNav.tsx",
);

/**
 * Source with every comment stripped, so the prose above (which necessarily
 * quotes the removed literals and the removed pill tokens) can't satisfy or fail
 * these assertions.
 */
function bottomNavCode(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const PATIENT_TABS = ["Home", "Overview", "Inbox", "Community", "Lifestyle"];
/** The practitioner set — none of these may ever appear in this component. */
const PRACTITIONER_ONLY_TABS = ["Schedule", "Patients", "Profile"];

/** Every `<Icon />` the bar rendered, in tab order, with the props it was given. */
function glyphs() {
  return screen.UNSAFE_getAllByType(Icon).map((n) => n.props as Record<string, unknown>);
}

function glyphColors() {
  return glyphs().map((p) => p.color as string);
}

describe("BottomNav (patient) — theme safety", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("contains no hardcoded colour anywhere outside comments", () => {
    const code = bottomNavCode();
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\s*\(/);
    // Named CSS colours are the other way a literal sneaks in (`text-white`,
    // `color: "white"`), and BRAND is explicit that white is not exempt.
    expect(code).not.toMatch(/\b(white|black)\b/);
  });

  it("emits no shadow — Figma 101:143 has no effects and BRAND forbids inventing one", () => {
    const code = bottomNavCode();
    expect(code).not.toMatch(/shadowColor/);
    expect(code).not.toMatch(/shadowOpacity|shadowRadius|shadowOffset/);
    expect(code).not.toMatch(/\belevation\b/);
  });

  it("imports no icon library directly — glyphs go through the shared <Icon />", () => {
    expect(bottomNavCode()).not.toMatch(/@expo\/vector-icons/);
  });

  it("resolves the glyph colours from tokens for the LIGHT mode", () => {
    render(<BottomNav active="home" />);
    const colors = glyphColors();
    expect(colors[0]).toBe(tokenColor("primary", "light"));
    expect(colors[1]).toBe(tokenColor("on-surface-variant", "light"));
  });

  it("re-resolves the glyph colours in DARK mode — the actual bug", () => {
    mockScheme.value = "dark";
    render(<BottomNav active="home" />);
    const colors = glyphColors();
    expect(colors[0]).toBe(tokenColor("primary", "dark"));
    expect(colors[1]).toBe(tokenColor("on-surface-variant", "dark"));
    // The regression itself: these used to equal the light values in dark mode.
    expect(colors[0]).not.toBe(tokenColor("primary", "light"));
    expect(colors[1]).not.toBe(tokenColor("on-surface-variant", "light"));
  });
});

describe("BottomNav (patient) — 101:143 treatment (no pill)", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("fills nothing but the bar itself — no active pill, no inactive backing plate", () => {
    const code = bottomNavCode();
    // The bar's own `surface` fill is the only background in the file.
    expect(code.match(/\bbg-[a-z0-9-]+/g)).toEqual(["bg-surface"]);
    // The pill was `bg-primary-container` + `rounded-full` on the tab Pressable.
    expect(code).not.toMatch(/primary-container/);
    expect(code).not.toMatch(/rounded-full/);
  });

  it("carries the active state on colour alone — primary on icon AND label", () => {
    const code = bottomNavCode();
    expect(code).toMatch(/text-primary\b/);
    expect(code).toMatch(/text-on-surface-variant\b/);
    expect(code).not.toMatch(/text-on-primary/);

    render(<BottomNav active="community" />);
    const colors = glyphColors();
    // Community is index 3; every other tab reads the inactive token.
    expect(colors[3]).toBe(tokenColor("primary", "light"));
    expect(colors.filter((c) => c === tokenColor("on-surface-variant", "light"))).toHaveLength(4);
  });

  it("draws every glyph at 24, the size of the Figma icon frames", () => {
    render(<BottomNav active="home" />);
    expect(glyphs().map((p) => p.size)).toEqual([24, 24, 24, 24, 24]);
  });

  it("uses the Figma glyph set — Health Icons for four tabs, one chrome fallback", () => {
    render(<BottomNav active="home" />);
    // icon/home, icon/overview, icon/message, icon/community, icon/chrome-sparkle
    expect(glyphs().map((p) => p.name)).toEqual([
      "home",
      "overview",
      "message",
      "community",
      undefined,
    ]);
    expect(glyphs().map((p) => p.chrome)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      "auto-awesome",
    ]);
  });

  it("gives every tab the frame's 48pt height and 4px icon/label gap", () => {
    render(<BottomNav active="home" />);
    for (const label of PATIENT_TABS) {
      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style) as {
        height?: number;
        gap?: number;
      };
      // 48 clears the 44pt floor in docs/MOBILE_UX.md §Accessibility.
      expect(style.height).toBe(48);
      expect(style.gap).toBe(4);
    }
  });
});

describe("BottomNav (patient) — tab contract", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("renders the patient tab set, in order, and no practitioner tabs", () => {
    render(<BottomNav />);
    const rendered = screen.getAllByRole("tab").map((n) => n.props.accessibilityLabel as string);
    expect(rendered).toEqual(PATIENT_TABS);
    for (const label of PRACTITIONER_ONLY_TABS) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("marks only the active tab as selected", () => {
    render(<BottomNav active="overview" />);
    expect(screen.getByLabelText("Overview").props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText("Home").props.accessibilityState.selected).toBe(false);
  });

  it("defaults to Home", () => {
    render(<BottomNav />);
    expect(screen.getByLabelText("Home").props.accessibilityState.selected).toBe(true);
  });

  it("reports the pressed tab's key to the caller, which owns routing", () => {
    const onTabPress = jest.fn();
    render(<BottomNav active="home" onTabPress={onTabPress} />);
    fireEvent.press(screen.getByLabelText("Lifestyle"));
    expect(onTabPress).toHaveBeenCalledWith("lifestyle");
  });

  it("does not throw when a screen passes no handler", () => {
    render(<BottomNav active="home" />);
    expect(() => fireEvent.press(screen.getByLabelText("Inbox"))).not.toThrow();
  });

  it("draws a glyph on every tab — no bare tab, no bare backing disc", () => {
    render(<BottomNav active="home" />);
    expect(glyphs()).toHaveLength(PATIENT_TABS.length);
  });
});
