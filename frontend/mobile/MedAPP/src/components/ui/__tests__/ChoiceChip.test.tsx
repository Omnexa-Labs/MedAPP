// Locks ChoiceChip (Figma 11:104) against the drift that made it necessary.
//
// Ten private chip implementations across eight screens disagreed about fill,
// emphasis, radius, label token, glyph size, glyph colour and height. This suite
// is written to fail on each of those specifically, so the shared component
// cannot quietly re-acquire them:
//
//   - frozen light-mode literals   -> SOURCE has no colour literal, and the
//                                     resolved glyph colour differs per mode
//   - competing unselected fills   -> exactly ONE bg-* class exists in the file
//   - primary-container emphasis   -> that token may never appear
//   - three different radii        -> rounded-md only
//   - four sub-44pt heights        -> minHeight AND minWidth are 44
//   - colour-only selection        -> the check glyph renders when selected
//   - a duplicated a11y affordance -> one role/state contract, asserted per role
//
// Following PatientBottomNav.test.tsx: class-level facts are asserted against
// the SOURCE (a wrong fill renders as a style that is tedious and brittle to
// assert on, and a literal can be CORRECT in light mode and still be the bug),
// while props, geometry, resolved colours and behaviour are asserted on the
// rendered tree.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
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

import { Icon } from "../icons/Icon";
import { ChoiceChip, ChoiceChipRow } from "../ChoiceChip";

const SOURCE_PATH = join(__dirname, "..", "ChoiceChip.tsx");

/**
 * Source with every comment stripped. The prose in ChoiceChip.tsx necessarily
 * QUOTES the literals and the rejected tokens it replaced (`#ffffff`,
 * `bg-surface-container`, `bg-primary-container`, `rounded-full`), so an
 * unstripped read would fail every one of these assertions for the wrong reason.
 */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** Every `<Icon />` the chip rendered, with the props it was given. */
function glyphs() {
  return screen.UNSAFE_getAllByType(Icon).map((n) => n.props as Record<string, unknown>);
}

/** The chip's own style, with the Pressable style-callback resolved unpressed. */
function chipStyle(testID = "chip") {
  const node = screen.getByTestId(testID);
  const style = node.props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style,
  ) as Record<string, unknown>;
}

beforeEach(() => {
  mockScheme.value = "light";
});

describe("ChoiceChip — theme safety", () => {
  it("contains no hardcoded colour anywhere outside comments", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    // The four literals FindCare's chips actually shipped were `#ffffff`,
    // `#3d4947`, `#00685f` and `#6d7a77` — passed straight into an icon colour.
    // Named CSS colours are the other way a literal sneaks in, and BRAND is
    // explicit that white is not exempt.
    expect(src).not.toMatch(/\b(white|black)\b/);
  });

  it("imports no icon library directly — glyphs go through the shared <Icon />", () => {
    expect(code()).not.toMatch(/@expo\/vector-icons/);
    expect(code()).not.toMatch(/healthicons/);
  });

  it("resolves the glyph colours from tokens for the LIGHT mode", () => {
    render(<ChoiceChip label="Cardiology" icon="filter-list" selected onPress={() => {}} />);
    for (const g of glyphs()) {
      expect(g.color).toBe(tokenColor("on-primary", "light"));
    }
  });

  it("re-resolves the glyph colours in DARK mode — the actual shipped bug", () => {
    mockScheme.value = "dark";
    render(<ChoiceChip label="Cardiology" icon="filter-list" selected onPress={() => {}} />);
    for (const g of glyphs()) {
      expect(g.color).toBe(tokenColor("on-primary", "dark"));
      // The regression itself: FindCare passed `#ffffff`, which stayed white on
      // a light-teal dark-mode fill.
      expect(g.color).not.toBe(tokenColor("on-primary", "light"));
    }
  });

  it("re-resolves the UNSELECTED glyph per mode too, not just the filled state", () => {
    render(<ChoiceChip label="Cardiology" icon="filter-list" onPress={() => {}} />);
    expect(glyphs()[0].color).toBe(tokenColor("on-surface", "light"));

    mockScheme.value = "dark";
    render(<ChoiceChip label="Cardiology" icon="filter-list" onPress={() => {}} />);
    const dark = glyphs()[0].color;
    expect(dark).toBe(tokenColor("on-surface", "dark"));
    expect(dark).not.toBe(tokenColor("on-surface", "light"));
  });

  it("pairs every glyph token with its own label token, so the two cannot drift", () => {
    // The Badge shipped a dark-teal icon beside a bright label because `icon`
    // and `text` were allowed to name different tokens. Asserted as a pairing.
    const src = code();
    expect(src).toMatch(/label:\s*"text-on-surface"[\s\S]{0,80}content:\s*"on-surface"/);
    expect(src).toMatch(/label:\s*"text-on-primary"[\s\S]{0,80}content:\s*"on-primary"/);
  });
});

describe("ChoiceChip — 11:104 treatment", () => {
  it("fills ONLY the selected state, with primary — no competing surface fills", () => {
    const src = code();
    // Frame `State=Default` has no fill; `State=Selected` fills with
    // color/primary. One bg class in the whole file is the structural form of
    // that. The three fills this replaces were bg-surface-container,
    // bg-surface-container-lowest and bg-surface.
    expect(src.match(/\bbg-[a-z0-9-/]+/g)).toEqual(["bg-primary"]);
  });

  it("never drops to the low-emphasis primary-container selection", () => {
    // LifestyleManage's chip used bg-primary-container/on-primary-container
    // while CommunityHub and Explore used bg-primary/on-primary. Same component,
    // two different EMPHASIS levels — the semantic half of the drift.
    expect(code()).not.toMatch(/primary-container/);
  });

  it("uses radius/12 and only radius/12", () => {
    const src = code();
    // BRAND: 12 is the chip radius. The call sites used all three of
    // rounded-full (pill), rounded-lg (legacy 8px) and rounded-md.
    expect(src).toMatch(/\brounded-md\b/);
    expect(src).not.toMatch(/\brounded-(full|lg|xl|xs|card|tile)\b/);
  });

  it("sets the label on the label-md ramp step — Inter SemiBold 14 in the frame", () => {
    const src = code();
    expect(src).toMatch(/font-label-md text-label-md/);
    // Nothing under 12sp, and no arbitrary type size at all.
    expect(src).not.toMatch(/text-\[\d+px\]/);
    expect(src).not.toMatch(/text-label-sm|text-body/);
  });

  it("draws both glyphs at the sanctioned dense-row size, not the shipped 18/16", () => {
    render(<ChoiceChip label="Cardiology" icon="filter-list" selected onPress={() => {}} />);
    expect(glyphs().map((g) => g.size)).toEqual([20, 20]);
  });

  it("keeps a border in BOTH states so selection causes no layout shift", () => {
    // Figma strokes are inset and cost no layout; an RN border does. Dropping it
    // on selection would shrink the content box 2pt per axis and make a row of
    // chips twitch as the user taps through them.
    const src = code();
    expect(src).toMatch(/\bborder\b/);
    expect(src).toMatch(/border-outline-variant/);
    expect(src).toMatch(/border-primary/);
  });

  it("emits no shadow — 11:104 carries no effect and a chip is not a floating surface", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
    render(<ChoiceChip label="All" onPress={() => {}} testID="chip" />);
    const style = chipStyle();
    for (const key of ["shadowColor", "shadowOpacity", "shadowRadius", "elevation"]) {
      expect(style[key]).toBeUndefined();
    }
  });
});

describe("ChoiceChip — the 44pt floor", () => {
  it("clears 44pt on BOTH axes, which every implementation it replaces failed", () => {
    render(<ChoiceChip label="All" onPress={() => {}} testID="chip" />);
    const style = chipStyle();
    expect(style.minHeight).toBe(44);
    // A two-character label measures ~40pt wide at label-md + 32pt inset, so the
    // cross axis needs the floor asserted independently — this is the amount the
    // eight screens each missed by a different number.
    expect(style.minWidth).toBe(44);
  });

  it("uses MIN height, not a fixed height, so a large font scale can grow it", () => {
    render(<ChoiceChip label="All" onPress={() => {}} testID="chip" />);
    const style = chipStyle();
    expect(style.height).toBeUndefined();
    expect(style.width).toBeUndefined();
  });

  it("keeps the floor in the selected state too", () => {
    render(<ChoiceChip label="All" selected onPress={() => {}} testID="chip" />);
    expect(chipStyle().minHeight).toBe(44);
  });
});

describe("ChoiceChip — selection is never colour-only", () => {
  it("renders the check glyph when selected", () => {
    render(<ChoiceChip label="Available now" selected onPress={() => {}} />);
    expect(glyphs().map((g) => g.chrome)).toEqual(["check"]);
  });

  it("renders no check when unselected", () => {
    render(<ChoiceChip label="Available now" onPress={() => {}} />);
    expect(screen.UNSAFE_queryAllByType(Icon)).toHaveLength(0);
  });

  it("puts the check AFTER the label and the leading icon BEFORE it", () => {
    render(<ChoiceChip label="Nearest" icon="filter-list" selected onPress={() => {}} />);
    const [leading, trailing] = glyphs();
    expect(leading.chrome).toBe("filter-list");
    expect(trailing.chrome).toBe("check");
  });

  it("lets a row that carries its own non-colour signal suppress the check", () => {
    // FindCare's facet chips use a trailing chevron to mean "opens a picker";
    // a tick there would collide with it.
    render(<ChoiceChip label="Specialty" selected showSelectedCheck={false} onPress={() => {}} />);
    expect(screen.UNSAFE_queryAllByType(Icon)).toHaveLength(0);
  });

  it("hides both glyphs from assistive tech — the label already names the chip", () => {
    render(<ChoiceChip label="Nearest" icon="filter-list" selected onPress={() => {}} />);
    for (const g of glyphs()) {
      expect(g.label).toBeUndefined();
    }
  });
});

describe("ChoiceChip — icon gate", () => {
  it("routes a Health Icons name to `name` (the clinical set wins)", () => {
    render(<ChoiceChip label="Doctors" icon="doctor" onPress={() => {}} />);
    const [g] = glyphs();
    expect(g.name).toBe("doctor");
    expect(g.chrome).toBeUndefined();
  });

  it("routes a chrome name to `chrome`", () => {
    render(<ChoiceChip label="Filters" icon="filter-list" onPress={() => {}} />);
    const [g] = glyphs();
    expect(g.chrome).toBe("filter-list");
    expect(g.name).toBeUndefined();
  });

  it("renders no glyph slot at all when no icon is passed", () => {
    render(<ChoiceChip label="All" onPress={() => {}} />);
    expect(screen.UNSAFE_queryAllByType(Icon)).toHaveLength(0);
  });
});

describe("ChoiceChip — accessibility contract", () => {
  it("is a button reporting `selected` for a filter chip", () => {
    render(<ChoiceChip label="Available now" selected onPress={() => {}} />);
    const chip = screen.getByRole("button", { name: "Available now" });
    expect(chip.props.accessibilityState.selected).toBe(true);
  });

  it("is a radio reporting BOTH selected and checked for a one-of-N group", () => {
    // SignUpStep2's gender row. Android's radio mapping reads `checked`.
    render(<ChoiceChip label="Female" selected role="radio" onPress={() => {}} />);
    const chip = screen.getByRole("radio", { name: "Female" });
    expect(chip.props.accessibilityState.selected).toBe(true);
    expect(chip.props.accessibilityState.checked).toBe(true);
  });

  it("does not leak `checked` onto a filter chip, which is not a checkable", () => {
    render(<ChoiceChip label="Available now" onPress={() => {}} />);
    expect(screen.getByRole("button").props.accessibilityState.checked).toBeUndefined();
  });

  it("lets a caller override the announced name without changing the visible label", () => {
    render(
      <ChoiceChip label="24h" accessibilityLabel="Within 24 hours" onPress={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Within 24 hours" })).toBeTruthy();
    expect(screen.getByText("24h")).toBeTruthy();
  });

  it("reports disabled, dims, and swallows the press", () => {
    const onPress = jest.fn();
    render(<ChoiceChip label="Cardiology" disabled onPress={onPress} testID="chip" />);
    const chip = screen.getByTestId("chip");
    expect(chip.props.accessibilityState.disabled).toBe(true);
    expect(chipStyle().opacity).toBe(0.6);
    fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("calls back on press when enabled", () => {
    const onPress = jest.fn();
    render(<ChoiceChip label="Cardiology" onPress={onPress} testID="chip" />);
    fireEvent.press(screen.getByTestId("chip"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ChoiceChip — pressed state", () => {
  /**
   * Puts the chip into its pressed state and returns the style it then carries.
   *
   * It has to go through the responder system: the Pressable's style CALLBACK is
   * not reachable from the rendered host node (NativeWind has already resolved
   * it for the resting state by the time it lands there), and `fireEvent(node,
   * "pressIn")` finds no handler because Pressable exposes
   * `onResponderGrant`/`onResponderRelease` on the host View, not `onPressIn`.
   * Granting the responder is what actually flips `pressed`, so this asserts the
   * behaviour rather than re-running the callback by hand.
   */
  function pressedStyle(testID: string) {
    fireEvent(screen.getByTestId(testID), "responderGrant", {
      nativeEvent: { touches: [], changedTouches: [], identifier: 1, locationX: 0, locationY: 0 },
      currentTarget: 1,
      target: 1,
      persist: () => {},
      dispatchConfig: {},
    });
    return StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, string>;
  }

  it("actually enters a pressed state — guards the mechanism the two tests below use", () => {
    // Without this, "no pressed background" below would pass vacuously if the
    // responder grant silently stopped flipping `pressed`.
    render(<ChoiceChip label="Cardiology" selected onPress={() => {}} testID="chip" />);
    expect(chipStyle("chip").backgroundColor).toBeUndefined();
    expect(pressedStyle("chip").backgroundColor).toBeDefined();
  });

  it("darkens the FILLED chip through the token layer, per mode", () => {
    render(<ChoiceChip label="Cardiology" selected onPress={() => {}} testID="chip" />);
    const light = pressedStyle("chip").backgroundColor;
    expect(light).toMatch(/^rgb\(/);
    // Not the resting fill, and not a literal frozen in one mode.
    expect(light).not.toBe(tokenColor("primary", "light"));

    mockScheme.value = "dark";
    render(<ChoiceChip label="Cardiology" selected onPress={() => {}} testID="chip2" />);
    const dark = pressedStyle("chip2").backgroundColor;
    expect(dark).toMatch(/^rgb\(/);
    // The regression this guards: a hand-picked pressed hex would be identical
    // in both modes.
    expect(dark).not.toBe(light);
  });

  it("leaves an UNSELECTED chip transparent when pressed, so the parent shows through", () => {
    // BRAND: "Never use a raw white/black fill on an icon container or tab item.
    // Leave those transparent so the parent surface shows through."
    render(<ChoiceChip label="Cardiology" onPress={() => {}} testID="chip" />);
    expect(pressedStyle("chip").backgroundColor).toBeUndefined();
  });
});

describe("ChoiceChip — Layout axis (11:104 756:4205 / 756:4207)", () => {
  /** The chip's classes, before NativeWind resolves them. */
  function chipClasses(testID = "chip") {
    return String(screen.getByTestId(testID).props.className ?? "");
  }

  it("hugs its label by default, so a filter row does not stretch it", () => {
    render(<ChoiceChip label="Video" onPress={() => {}} testID="chip" />);
    expect(chipClasses()).toContain("self-start");
    expect(chipClasses()).not.toContain("w-full");
  });

  it("fills its grid cell when layout=fill — the axis the FLAGGED comment asked for", () => {
    // SelectTimeSlotScreen's slot grid and date strip each shipped a PRIVATE chip
    // because this axis did not exist. It exists now; the private copies go.
    render(<ChoiceChip label="10:00 AM" layout="fill" onPress={() => {}} testID="chip" />);
    expect(chipClasses()).toContain("w-full");
    expect(chipClasses()).not.toContain("self-start");
  });

  it("keeps the 44pt floor in both layouts", () => {
    render(<ChoiceChip label="10:00 AM" layout="fill" onPress={() => {}} testID="chip" />);
    expect(chipStyle().minHeight).toBe(44);
  });
});

describe("ChoiceChip — unavailable is not colour-only", () => {
  /** The content wrapper — the node the 0.38 dim lands on, and NOT the border. */
  function contentOpacity(testID = "chip") {
    const style = StyleSheet.flatten(
      screen.getByTestId(`${testID}-content`).props.style,
    ) as Record<string, unknown>;
    return style.opacity as number;
  }

  it("draws a DASHED hairline, which is the non-colour signal", () => {
    // BRAND §Colour rules: a paler chip among twelve chips, in sunlight, on a
    // low-density screen, is not a signal. Do not simplify the dash to a tint.
    const src = code();
    expect(src).toMatch(/container:\s*"border-dashed border-outline-variant"/);
  });

  it("dims the CONTENT to 0.38 and leaves the border at full strength", () => {
    render(<ChoiceChip label="09:30 AM" unavailable onPress={() => {}} testID="chip" />);
    // The chip's own style must NOT carry the disabled dim — that would fade the
    // dashed border away with it.
    expect(chipStyle().opacity).toBe(1);
    expect(contentOpacity()).toBe(0.38);
  });

  it("is not pressable, and reports disabled", () => {
    const onPress = jest.fn();
    render(<ChoiceChip label="09:30 AM" unavailable onPress={onPress} testID="chip" />);
    expect(screen.getByTestId("chip").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId("chip"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("ANNOUNCES the state, so it reaches a screen reader and not only an eye", () => {
    render(<ChoiceChip label="09:30 AM" unavailable onPress={() => {}} />);
    expect(screen.getByLabelText("09:30 AM, unavailable")).toBeTruthy();
  });

  it("stops reading as selected when a chosen slot becomes unavailable", () => {
    // The confirm-failed case: the slot the user picked was taken while they were
    // reviewing. It must not still render as their choice.
    render(<ChoiceChip label="10:00 AM" selected unavailable onPress={() => {}} testID="chip" />);
    expect(screen.getByTestId("chip").props.accessibilityState.selected).toBe(false);
    // …and no check glyph either — the chip renders no glyph at all.
    expect(screen.UNSAFE_queryAllByType(Icon)).toHaveLength(0);
  });

  it("keeps a plain `disabled` chip on the 0.6 whole-control dim, unchanged", () => {
    // `disabled` (the control is off) and `unavailable` (the data says no) are
    // different states with different treatments; collapsing them loses the dash.
    render(<ChoiceChip label="Cardiology" disabled onPress={() => {}} testID="chip" />);
    expect(chipStyle().opacity).toBe(0.6);
  });
});

describe("ChoiceChipRow", () => {
  it("wraps by default, with the 8pt scale gap", () => {
    render(
      <ChoiceChipRow testID="row">
        <ChoiceChip label="Female" role="radio" onPress={() => {}} />
        <ChoiceChip label="Male" role="radio" onPress={() => {}} />
      </ChoiceChipRow>,
    );
    const style = StyleSheet.flatten(screen.getByTestId("row").props.style) as Record<
      string,
      unknown
    >;
    expect(style.gap).toBe(8);
    // A wrapping row inherits the parent's gutter; adding its own would
    // double-inset the chips to 32.
    expect(style.paddingHorizontal).toBeUndefined();
  });

  it("applies the 16pt gutter as a CONTENT inset when scrollable, leading AND trailing", () => {
    // BRAND §Horizontal strips: "a trailing inset matching the leading gutter".
    // One symmetric paddingHorizontal is that, and it is the derivation each
    // screen was repeating (and getting wrong) by hand.
    render(
      <ChoiceChipRow scrollable testID="row">
        <ChoiceChip label="All" onPress={() => {}} />
      </ChoiceChipRow>,
    );
    const inner = StyleSheet.flatten(
      screen.getByTestId("row").props.contentContainerStyle,
    ) as Record<string, unknown>;
    expect(inner.paddingHorizontal).toBe(16);
    expect(inner.gap).toBe(8);
  });

  it("hides the horizontal scrollbar, which the frames do not draw", () => {
    render(
      <ChoiceChipRow scrollable testID="row">
        <ChoiceChip label="All" onPress={() => {}} />
      </ChoiceChipRow>,
    );
    expect(screen.getByTestId("row").props.showsHorizontalScrollIndicator).toBe(false);
  });

  it("renders its chips in either mode", () => {
    render(
      <ChoiceChipRow scrollable testID="row">
        <ChoiceChip label="All" selected onPress={() => {}} />
        <ChoiceChip label="Doctors" onPress={() => {}} />
      </ChoiceChipRow>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
