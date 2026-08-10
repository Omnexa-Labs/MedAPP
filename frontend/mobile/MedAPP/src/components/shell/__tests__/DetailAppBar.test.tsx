// Locks the detail app bar (Figma 193:120).
//
// These tests exist to catch the SPECIFIC drift that motivated the component, not
// to prove it renders. Eleven-plus screens hand-rolled this bar and all of them
// broke the same two rules, so both are asserted against the SOURCE as well as
// against the render — a render assertion cannot catch a frozen light-mode
// literal, because the light value it produces is correct:
//
//  1. `appBarShadow`. docs/BRAND.md §Elevation forbids app-bar elevation and
//     193:120 carries no effects.
//  2. A hardcoded back-glyph tint. `#00685f` (the LIGHT value of color/primary)
//     in four files, `#3d4947` in a fifth. The dark-mode branch is asserted to
//     resolve to a DIFFERENT value, which is the only shape of test that fails on
//     a re-frozen literal.
//
// The third guard is structural: the component exposes no `style`/`className`, so
// a screen cannot smuggle a private variant in. Card.tsx learned this the hard
// way — PatientDashboardScreen passed a `Platform.select({ ios: { shadowColor… }})`
// through `style` and shipped a shadowed card while the primitive and its tests
// both looked clean. Here the hatch simply does not exist, and this asserts it
// stays that way.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet, Text, View } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Icon } from "@/components/ui";
import { tokenColor } from "@/lib/tokens";

const mockBack = jest.fn();
const mockNav = { canGoBack: true };

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => mockNav.canGoBack,
  },
}));

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

import { DetailAppBar, DETAIL_APP_BAR_HEIGHT } from "../DetailAppBar";

const SOURCE_PATH = join(__dirname, "..", "DetailAppBar.tsx");

/**
 * Source with every comment stripped, so the prose in the file (which necessarily
 * quotes the banned literals and the banned `appBarShadow`) can neither satisfy
 * nor fail these assertions.
 */
function barCode(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** Every `<Icon />` the bar rendered, with the props it was given. */
function glyphs() {
  // query, not get: `showBack={false}` legitimately renders zero glyphs, and a
  // getter throws on an empty result rather than returning [].
  return screen.UNSAFE_queryAllByType(Icon).map((n) => n.props as Record<string, unknown>);
}

function styleOf(node: { props: { style?: unknown } }) {
  return StyleSheet.flatten(node.props.style) as {
    width?: number;
    height?: number;
    minWidth?: number;
    marginRight?: number;
    lineHeight?: number;
  };
}

beforeEach(() => {
  mockBack.mockClear();
  mockNav.canGoBack = true;
  mockScheme.value = "light";
});

describe("DetailAppBar — theme safety (drift guard 1 and 2)", () => {
  it("contains no hardcoded colour anywhere outside comments", () => {
    const code = barCode();
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\s*\(/);
    // Named CSS colours are the other way a literal sneaks in (`text-white`,
    // `color: "white"`), and BRAND is explicit that white is not exempt.
    expect(code).not.toMatch(/\b(white|black)\b/);
  });

  it("emits no shadow — 193:120 has no effects and BRAND forbids app-bar elevation", () => {
    const code = barCode();
    expect(code).not.toMatch(/appBarShadow/i);
    expect(code).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(code).not.toMatch(/\belevation\b/);
    expect(code).not.toMatch(/boxShadow/);
    // The token helper that legitimately makes a sheet/dialog shadow. A detail
    // app bar is not one of those roles, so it must not be reached for here.
    expect(code).not.toMatch(/useTokenShadow|tokenShadow/);
  });

  it("imports no icon library directly — glyphs go through the shared <Icon />", () => {
    expect(barCode()).not.toMatch(/@expo\/vector-icons/);
    expect(barCode()).not.toMatch(/react-native-vector-icons/);
  });

  it("resolves the back glyph from color/primary in LIGHT mode", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    expect(glyphs()[0].color).toBe(tokenColor("primary", "light"));
  });

  it("re-resolves the back glyph in DARK mode — the actual hardcoded-#00685f bug", () => {
    mockScheme.value = "dark";
    render(<DetailAppBar title="Doctor Profile" />);
    const color = glyphs()[0].color as string;
    expect(color).toBe(tokenColor("primary", "dark"));
    // The regression itself: the hand-rolled bars produced the LIGHT value here.
    expect(color).not.toBe(tokenColor("primary", "light"));
  });
});

describe("DetailAppBar — structural guard (no private variants)", () => {
  it("exposes no style or className prop for a screen to smuggle chrome through", () => {
    const code = barCode();
    // Props on the exported type, not the internal `className=` usages.
    expect(code).not.toMatch(/\bstyle\?:/);
    expect(code).not.toMatch(/\bclassName\?:/);
    // It also must not spread arbitrary ViewProps, which reopens the same hatch.
    expect(code).not.toMatch(/\.\.\.rest/);
    expect(code).not.toMatch(/extends ViewProps/);
  });

  it("renders no logo — 193:120's description forbids one on a detail bar", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    expect(screen.queryByLabelText("MedApp")).toBeNull();
    expect(barCode()).not.toMatch(/\bLogo\b/);
  });

  it("publishes its height as a constant so screens stop re-measuring 64", () => {
    expect(DETAIL_APP_BAR_HEIGHT).toBe(64);
    render(<DetailAppBar title="Doctor Profile" testID="bar" />);
    expect(styleOf(screen.getByTestId("bar")).height).toBe(DETAIL_APP_BAR_HEIGHT);
  });
});

describe("DetailAppBar — 193:120 geometry and touch targets", () => {
  it("gives the back button the frame's 44x44 target", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    const style = styleOf(screen.getByLabelText("Go back"));
    // 44 is BRAND's floor (docs/MOBILE_UX.md §Accessibility) and 193:115's size.
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
  });

  it("enforces the 44pt action target on the BAR, not on the caller's child", () => {
    render(
      <DetailAppBar
        title="Doctor Profile"
        testID="bar"
        // A bare 24px glyph — exactly what a screen would pass, and exactly what
        // used to ship as a 24pt tap area.
        actions={<Icon chrome="ios-share" size={24} label="Share" />}
      />,
    );
    const slot = screen.getByTestId("bar").children.at(-1) as Parameters<typeof styleOf>[0];
    const style = styleOf(slot);
    expect(style.height).toBe(44);
    // minWidth, not width: a two-glyph action group must not be squeezed to 44.
    expect(style.minWidth).toBe(44);
  });

  it("draws the back glyph at 24 — the size of the frame's icon", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    expect(glyphs()[0].size).toBe(24);
  });

  it("titles at headline-md — Manrope SemiBold 20 on on-surface, per 193:117", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    const className = screen.getByText("Doctor Profile").props.className as string;
    expect(className).toContain("font-headline-md");
    expect(className).toContain("text-headline-md");
    expect(className).toContain("text-on-surface");
    // A wrapping title would overflow the fixed 64 bar.
    expect(screen.getByText("Doctor Profile").props.numberOfLines).toBe(1);
  });

  it("keeps the action slot at the right gutter even with no title", () => {
    render(<DetailAppBar testID="bar" actions={<Text>Skip</Text>} />);
    // back button, flex-1 spacer, action slot — the spacer must survive so the
    // action does not slide left against the back button.
    expect(screen.getByTestId("bar").children).toHaveLength(3);
    expect(screen.getByText("Skip")).toBeTruthy();
  });
});

describe("DetailAppBar — back behaviour", () => {
  it("pops the stack by default", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("prefers the caller's handler over router.back()", () => {
    const onBack = jest.fn();
    render(<DetailAppBar title="Doctor Profile" onBack={onBack} />);
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(onBack).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("does not throw on a deep link with nothing to pop", () => {
    mockNav.canGoBack = false;
    render(<DetailAppBar title="Doctor Profile" />);
    expect(() => fireEvent.press(screen.getByLabelText("Go back"))).not.toThrow();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("omits the left button entirely for showBack={false}", () => {
    render(<DetailAppBar title="Doctor Profile" showBack={false} />);
    expect(screen.queryByLabelText("Go back")).toBeNull();
    expect(glyphs()).toHaveLength(0);
  });

  it("uses the frame's chevron by default, not an arrow", () => {
    render(<DetailAppBar title="Doctor Profile" />);
    expect(glyphs()[0].chrome).toBe("chevron-left");
  });

  it("relabels itself for a dismiss-only bar", () => {
    render(<DetailAppBar title="Doctor Profile" backIcon="close" />);
    expect(screen.getByLabelText("Close")).toBeTruthy();
    expect(glyphs()[0].chrome).toBe("close");
    // Still primary-tinted and still a 44 target — a close bar is not a variant.
    expect(glyphs()[0].color).toBe(tokenColor("primary", "light"));
    expect(styleOf(screen.getByLabelText("Close")).width).toBe(44);
  });

  it("lets a screen override the announced label", () => {
    render(<DetailAppBar title="Doctor Profile" backAccessibilityLabel="Back to chats" />);
    expect(screen.getByLabelText("Back to chats")).toBeTruthy();
  });
});

describe("DetailAppBar — slots (FLAGGED extensions beyond 193:120)", () => {
  it("stacks a subtitle at label-sm on-surface-variant", () => {
    render(<DetailAppBar title="Dr Ama Mensah" subtitle="Online now" />);
    const node = screen.getByText("Online now");
    const className = node.props.className as string;
    expect(className).toContain("font-label-sm");
    expect(className).toContain("text-label-sm");
    expect(className).toContain("text-on-surface-variant");
    // 12px at the ramp's 1.3 leading — a lineHeight of 1 clips descenders on
    // Android, which docs/MOBILE_UX.md lists as a shipped mistake.
    expect(styleOf(node).lineHeight).toBe(16);
  });

  it("renders no subtitle node when none is given", () => {
    render(<DetailAppBar title="Dr Ama Mensah" />);
    expect(screen.queryByText("Online now")).toBeNull();
  });

  it("insets a leading slot from the title by one spacing step", () => {
    render(<DetailAppBar title="Dr Ama Mensah" testID="bar" leading={<View testID="avatar" />} />);
    // back button, leading wrapper, flex-1 title column.
    const children = screen.getByTestId("bar").children;
    expect(children).toHaveLength(3);
    const wrapper = children[1] as Parameters<typeof styleOf>[0];
    expect(styleOf(wrapper).marginRight).toBe(12);
    expect(screen.getByTestId("avatar")).toBeTruthy();
  });

  it("announces itself as the screen heading", () => {
    render(<DetailAppBar title="Doctor Profile" testID="bar" />);
    expect(screen.getByTestId("bar").props.accessibilityRole).toBe("header");
  });
});
