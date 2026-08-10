// Locks the drift that motivated DetailShell, not that it renders.
//
// The measured starting point, across the 16 screens that render DetailAppBar:
//   - 11 hardcode `<StatusBar style="dark" />`, 2 pass "auto", 1 renders none,
//     and only 2 resolve it from the active scheme.
//   - 10 pass edges ["top","left","right"], 6 pass all four.
//   - 4 render <BottomNav> under a detail bar, which docs/BRAND.md §App shell
//     forbids outright.
//
// So three of these tests assert against the SOURCE as well as the render. A
// render assertion cannot catch a frozen `style="dark"` — in light mode the
// frozen value is the correct one, and the test passes while dark mode is broken.
// The only shape of test that fails on a re-frozen literal is one that renders
// BOTH modes and asserts they DIFFER.
//
// The fourth guard is the forwarding parity check at the bottom. PractitionerShell
// shipped with `onTabPress` declared and never passed down, so the nav's
// documented escape hatch was unreachable while every caller read as correct. A
// swallowed prop is worse than a missing one, so the bar's prop list is read out
// of DetailAppBar.tsx at test time rather than copied here — a prop added to the
// bar is covered without anyone remembering to update this file.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Text, View } from "react-native";
import { screen, fireEvent } from "@testing-library/react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { renderWithSafeArea as render } from "@/test/safe-area";

const mockBack = jest.fn();
const mockNav = { canGoBack: true };

jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => mockNav.canGoBack,
  },
}));

const mockScheme = { value: "light" as "light" | "dark" };

// nativewind is the single source of the rendered scheme (src/lib/theme.ts reads
// it, src/lib/tokens.ts resolves against it), so this is the seam for exercising
// both modes without a native colour-scheme module.
jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

/**
 * Every props object DetailAppBar was rendered with. The real bar still renders —
 * this is a pass-through spy, not a stub — so the forwarding assertions and the
 * behavioural ones can live in one file.
 */
const mockBarProps: Record<string, unknown>[] = [];

jest.mock("../DetailAppBar", () => {
  const actual = jest.requireActual("../DetailAppBar");
  return {
    ...actual,
    DetailAppBar: (props: Record<string, unknown>) => {
      mockBarProps.push(props);
      return actual.DetailAppBar(props);
    },
  };
});

import { DetailShell, DETAIL_SHELL_EDGES } from "../DetailShell";

const SHELL_SOURCE_PATH = join(__dirname, "..", "DetailShell.tsx");
const BAR_SOURCE_PATH = join(__dirname, "..", "DetailAppBar.tsx");

/**
 * Source with every comment stripped. The file's own prose necessarily names the
 * things these tests ban — `style="dark"`, `BottomNav`, `#00685f` — and prose must
 * neither satisfy nor fail a source assertion.
 */
function stripComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const shellCode = () => stripComments(SHELL_SOURCE_PATH);

/**
 * The keys of `DetailAppBarProps`, read out of DetailAppBar.tsx. Deliberately not
 * a list maintained here: the whole point of the parity test is that it notices a
 * prop nobody told it about.
 */
function barPropKeys(): string[] {
  const src = stripComments(BAR_SOURCE_PATH);
  const start = src.indexOf("export type DetailAppBarProps = {");
  expect(start).toBeGreaterThanOrEqual(0);
  const body = src.slice(start, src.indexOf("\n};", start));
  return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]);
}

function statusBarStyle(): unknown {
  const bars = screen.UNSAFE_queryAllByType(StatusBar);
  expect(bars).toHaveLength(1);
  return bars[0].props.style;
}

/**
 * The edge record the NATIVE safe-area view is actually given. The insets are
 * applied natively (SafeAreaView is a thin wrapper over `NativeSafeAreaView`), so
 * there is no `paddingBottom` in the Jest tree to assert on — this record is the
 * lowest-level observable form of the decision.
 */
function nativeEdges(): Record<string, string> | undefined {
  let found: Record<string, string> | undefined;
  const visit = (node: unknown): void => {
    if (found || !node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object") return;
    const n = node as { props?: { edges?: unknown }; children?: unknown };
    const edges = n.props?.edges;
    if (edges && !Array.isArray(edges) && typeof edges === "object") {
      found = edges as Record<string, string>;
      return;
    }
    visit(n.children);
  };
  visit(screen.toJSON());
  return found;
}

function safeAreaEdges(): unknown {
  const areas = screen.UNSAFE_queryAllByType(SafeAreaView);
  expect(areas).toHaveLength(1);
  return areas[0].props.edges;
}

beforeEach(() => {
  mockBack.mockClear();
  mockNav.canGoBack = true;
  mockScheme.value = "light";
  mockBarProps.length = 0;
});

describe("DetailShell — composition", () => {
  it("renders the detail bar, its title and the body", () => {
    render(
      <DetailShell title="Medication Details">
        <Text>Body content</Text>
      </DetailShell>,
    );
    expect(screen.getByText("Medication Details")).toBeTruthy();
    expect(screen.getByLabelText("Go back")).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();
  });

  it("puts the body BELOW the bar, so the bar cannot be scrolled away", () => {
    render(
      <DetailShell title="Script">
        <Text>Body content</Text>
      </DetailShell>,
    );
    // Same ordering contract as PatientShell/PractitionerShell: chrome first,
    // `flex-1` body second. A body rendered above the bar would still pass every
    // getByText above.
    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered.indexOf("Script")).toBeLessThan(rendered.indexOf("Body content"));
  });
});

// ---------------------------------------------------------------------------
// Drift guard 1 — no bottom nav, and not even a way to ask for one.
// ---------------------------------------------------------------------------
describe("DetailShell — no bottom nav, ever", () => {
  it("renders neither tab set", () => {
    render(
      <DetailShell title="Doctor Profile">
        <Text>Body</Text>
      </DetailShell>,
    );
    for (const label of ["Home", "Overview", "Community", "Lifestyle", "Schedule", "Patients"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("imports no bottom nav and exposes no prop that could turn one on", () => {
    const code = shellCode();
    // PatientShell has `showBottomNav` because it serves tab roots too. This
    // shell serves only detail screens, where the nav's absence is the defining
    // property — so it is structural here, not configurable.
    expect(code).not.toMatch(/BottomNav/);
    expect(code).not.toMatch(/showBottomNav|hideBottomNav|withBottomNav/);
    expect(code).not.toMatch(/activeTab|onTabPress/);
  });
});

// ---------------------------------------------------------------------------
// Drift guard 2 — the status bar follows the scheme instead of being frozen.
// ---------------------------------------------------------------------------
describe("DetailShell — status bar follows the active scheme", () => {
  it("is dark-on-light in LIGHT mode", () => {
    mockScheme.value = "light";
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(statusBarStyle()).toBe("dark");
  });

  it("is light-on-dark in DARK mode — the assertion a frozen value fails", () => {
    mockScheme.value = "dark";
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(statusBarStyle()).toBe("light");
  });

  it("produces a DIFFERENT style in the two modes", () => {
    mockScheme.value = "light";
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    const light = statusBarStyle();
    screen.unmount();

    mockScheme.value = "dark";
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(statusBarStyle()).not.toBe(light);
  });

  it("hardcodes neither `dark` nor `auto`, and takes no status-bar prop", () => {
    const code = shellCode();
    // The 11 frozen `style="dark"` screens, and the 2 that pass "auto" (which
    // follows the OS, not this app's user-set appearance — src/lib/theme.ts).
    expect(code).not.toMatch(/style="(dark|light|auto)"/);
    expect(code).not.toMatch(/statusBarStyle|StatusBarStyle/);
    // The resolution must come from the same hook the other two shells use, not
    // from a second mechanism invented here.
    expect(code).toMatch(/useResolvedScheme/);
  });
});

// ---------------------------------------------------------------------------
// Drift guard 3 — no colour literal. A shell that freezes a hex is the same bug
// as a shell that freezes a status-bar style, and light mode hides both.
// ---------------------------------------------------------------------------
describe("DetailShell — tokens only", () => {
  it("contains no hardcoded colour anywhere outside comments", () => {
    const code = shellCode();
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\s*\(/);
    // BRAND is explicit that white is not exempt.
    expect(code).not.toMatch(/\b(white|black)\b/);
  });

  it("imports no icon library directly — glyphs reach the bar through <Icon />", () => {
    const code = shellCode();
    expect(code).not.toMatch(/@expo\/vector-icons/);
    expect(code).not.toMatch(/react-native-vector-icons/);
  });

  it("casts no shadow — BRAND §Elevation forbids app-bar and shell elevation", () => {
    const code = shellCode();
    expect(code).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(code).not.toMatch(/\belevation\b/);
    expect(code).not.toMatch(/boxShadow/);
  });
});

// ---------------------------------------------------------------------------
// Safe-area edges.
// ---------------------------------------------------------------------------
describe("DetailShell — safe-area edges", () => {
  it("claims all four edges by default, because there is no bottom nav to claim it", () => {
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(safeAreaEdges()).toEqual(["top", "left", "right", "bottom"]);
    expect([...DETAIL_SHELL_EDGES]).toEqual(["top", "left", "right", "bottom"]);
  });

  it("turns the bottom edge ON at the native view, not just in the prop", () => {
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(nativeEdges()).toEqual({
      top: "additive",
      right: "additive",
      bottom: "additive",
      left: "additive",
    });
  });

  it("turns the bottom edge OFF when the screen claims that inset itself", () => {
    render(
      <DetailShell title="Select a time" claimsBottomInset={false}>
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(nativeEdges()).toEqual({
      top: "additive",
      right: "additive",
      bottom: "off",
      left: "additive",
    });
  });

  it("releases the bottom edge for a screen that pins its own footer", () => {
    // SelectTimeSlotScreen (own `<SafeAreaView edges={["bottom"]}>` under a docked
    // action bar), ChatThreadScreen / AiAssistantScreen (composer under a KAV),
    // PractitionerTelehealthProfileScreen (sticky CTA at `absolute bottom`).
    render(
      <DetailShell title="Select a time" claimsBottomInset={false}>
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(safeAreaEdges()).toEqual(["top", "left", "right"]);
  });

  it("exposes a boolean, not an `edges` array — the array is how the split happened", () => {
    expect(shellCode()).not.toMatch(/edges\?:/);
  });
});

// ---------------------------------------------------------------------------
// Keyboard — the shell deliberately does NOT wrap children in a
// KeyboardAvoidingView; the two composer screens keep their own, placed BELOW
// the bar. A shell-level KAV would lift the app bar off the top of the screen.
// ---------------------------------------------------------------------------
describe("DetailShell — keyboard is the screen's", () => {
  it("adds no KeyboardAvoidingView of its own", () => {
    expect(shellCode()).not.toMatch(/KeyboardAvoidingView/);
  });

  it("renders a screen-supplied bottom-pinned composer as the body", () => {
    render(
      <DetailShell title="Dr. Ama" claimsBottomInset={false}>
        <View>
          <Text>Composer</Text>
        </View>
      </DetailShell>,
    );
    expect(screen.getByText("Composer")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Drift guard 4 — prop forwarding parity. See the header.
// ---------------------------------------------------------------------------
describe("DetailShell — forwards every DetailAppBar prop", () => {
  it("reaches the bar with each prop the bar declares", () => {
    const keys = barPropKeys();
    // Sanity: the parse found a real list, not an empty one that trivially passes.
    expect(keys).toEqual(
      expect.arrayContaining([
        "title",
        "subtitle",
        "onBack",
        "showBack",
        "backIcon",
        "backAccessibilityLabel",
        "leading",
        "actions",
        "testID",
      ]),
    );

    const onBack = jest.fn();
    render(
      <DetailShell
        title="Chat"
        subtitle="Online"
        onBack={onBack}
        showBack
        backIcon="close"
        backAccessibilityLabel="Dismiss"
        leading={<Text>LEAD</Text>}
        actions={<Text>ACT</Text>}
        appBarTestID="bar"
      >
        <Text>Body</Text>
      </DetailShell>,
    );

    expect(mockBarProps).toHaveLength(1);
    const received = mockBarProps[0];
    for (const key of keys) {
      // `testID` reaches the bar as `appBarTestID`, so the shell's own testID can
      // land on the root the way it does on the other two shells.
      const source = key === "testID" ? "bar" : received[key];
      expect(source).toBeDefined();
    }
    expect(received.testID).toBe("bar");
  });

  it("lands each forwarded prop on the rendered bar, not just on its props object", () => {
    const onBack = jest.fn();
    render(
      <DetailShell
        title="Chat"
        subtitle="Online"
        onBack={onBack}
        backIcon="close"
        backAccessibilityLabel="Dismiss"
        leading={<Text>LEAD</Text>}
        actions={<Text>ACT</Text>}
      >
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(screen.getByText("Chat")).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByText("LEAD")).toBeTruthy();
    expect(screen.getByText("ACT")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Dismiss"));
    expect(onBack).toHaveBeenCalled();
  });

  it("forwards showBack={false} for a bar with no left button", () => {
    render(
      <DetailShell title="Booking confirmed" showBack={false}>
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(screen.queryByLabelText("Go back")).toBeNull();
    expect(screen.getByText("Booking confirmed")).toBeTruthy();
  });

  it("falls back to router.back() when the screen supplies no onBack", () => {
    render(
      <DetailShell title="Script">
        <Text>Body</Text>
      </DetailShell>,
    );
    fireEvent.press(screen.getByLabelText("Go back"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("puts the shell's own testID on the root, distinct from the bar's", () => {
    render(
      <DetailShell title="Script" testID="shell" appBarTestID="bar">
        <Text>Body</Text>
      </DetailShell>,
    );
    expect(screen.getByTestId("shell")).toBeTruthy();
    expect(screen.getByTestId("bar")).toBeTruthy();
  });

  it("forwards by rest-spread, so the list cannot fall behind the bar", () => {
    // The failure being prevented is PractitionerShell's: a hand-kept list that
    // declares a prop and silently drops it. A rest-spread cannot.
    expect(shellCode()).toMatch(/\.\.\.appBarProps/);
    expect(shellCode()).toMatch(/<DetailAppBar\s*\{\.\.\.appBarProps\}/);
  });
});
