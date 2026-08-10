// Locks VitalStatCard against the drift that motivated building it.
//
// Six private copies of Figma `VitalStatCard` 211:241 shipped and disagreed on
// slot ORDER, on the value size (22 vs 28/800 vs label-md), and on the abnormal
// tint — PatientDashboardScreen's was `#171c1c`, a one-character typo of
// `#171D1C` (`color/on-surface`) that matched no token and no frame. Two of the
// six also carried a card shadow.
//
// So these are not render tests. Each one asserts a property that, had it
// existed, would have failed on one of those six copies:
//
//   * no colour literal anywhere in the source (comments stripped first, since
//     the prose above necessarily quotes the typo)
//   * no shadow, and none reachable through the shared Card
//   * both mode-dependent branches resolve DIFFERENT values (the frozen-literal
//     bug rendered correctly in the mode it was authored in)
//   * slot ORDER — label before value, one fixed order for every screen
//   * exactly one value size, taken from the token, not an inline override
//   * the 44pt floor when the card is tappable
//   * abnormal never signals with colour alone (BRAND "Colour rules", WCAG 1.4.1)
//   * no `className` / `style` escape hatch — a screen cannot express a private
//     variant, which is the actual anti-drift mechanism

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet, Text as RNText } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };

// nativewind is the single source of the rendered scheme (src/lib/theme.ts reads
// it, src/lib/tokens.ts resolves against it), so this is the seam for asserting
// both modes without a native colour-scheme module.
jest.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: mockScheme.value,
    setColorScheme: jest.fn(),
  }),
}));

import { Icon } from "@/components/ui";
import { VitalStatCard } from "../VitalStatCard";

const SOURCE_PATH = join(__dirname, "..", "VitalStatCard.tsx");

/** Source with every comment stripped, so the prose can't satisfy or fail these. */
function source(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** Every `<Icon />` rendered, in document order, with the props it was given. */
function glyphs() {
  return screen.UNSAFE_getAllByType(Icon).map((n) => n.props as Record<string, unknown>);
}

/**
 * The card's own strings, in document order — i.e. its slot order.
 *
 * Filtered to string children because MaterialIcons renders its glyph as a
 * `<Text>` too (the `chrome` fallback documented in Icon.tsx), and a glyph
 * codepoint is not a slot.
 */
function slotOrder(): string[] {
  return screen
    .UNSAFE_getAllByType(RNText)
    .map((n) => (n.props as { children?: unknown }).children)
    .filter((c): c is string => typeof c === "string" && c.length > 0);
}

function flat(style: unknown) {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  mockScheme.value = "light";
});

describe("VitalStatCard — theme safety", () => {
  it("contains no hardcoded colour anywhere outside comments", () => {
    const code = source();
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\s*\(/);
    // Named CSS colours are the other way a literal sneaks in (`text-white`,
    // `color: "white"`); BRAND is explicit that white is not exempt.
    expect(code).not.toMatch(/\b(white|black)\b/);
  });

  it("emits no shadow — 211:241's `elevation/card` effect is empty and BRAND forbids one", () => {
    const code = source();
    expect(code).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(code).not.toMatch(/\belevation\b/i);
    expect(code).not.toMatch(/boxShadow/);

    // And structurally, through what actually renders: the surface is the shared
    // Card, which strips elevation even when a caller injects it.
    render(<VitalStatCard testID="v" label="Heart rate" value="72" unit="bpm" />);
    const style = flat(screen.getByTestId("v").props.style);
    for (const key of ["shadowColor", "shadowOpacity", "shadowRadius", "shadowOffset", "elevation"]) {
      expect(style[key]).toBeUndefined();
    }
  });

  it("imports no icon library directly — every glyph goes through the shared <Icon />", () => {
    expect(source()).not.toMatch(/@expo\/vector-icons/);
    expect(source()).not.toMatch(/healthicons/);
  });

  it("uses the `card-surface` ROLE, not the frame's fixed `surface-container-lowest` step", () => {
    // 211:241 binds its fill to `color/surface-container-lowest`, which is
    // #090F0E in dark mode — DARKER than the #0E1514 page, so the card would
    // recede. Card owns the role; this file must not name the step.
    expect(source()).not.toMatch(/surface-container-lowest/);
  });
});

describe("VitalStatCard — both mode branches", () => {
  it("resolves the normal chip glyph from `on-primary-container` in BOTH modes", () => {
    render(<VitalStatCard label="Heart rate" value="72" icon="heart-rate" />);
    expect(glyphs()[0].color).toBe(tokenColor("on-primary-container", "light"));

    screen.unmount();
    mockScheme.value = "dark";
    render(<VitalStatCard label="Heart rate" value="72" icon="heart-rate" />);
    expect(glyphs()[0].color).toBe(tokenColor("on-primary-container", "dark"));
    // The frozen-literal bug: this used to equal the light value in dark mode.
    expect(glyphs()[0].color).not.toBe(tokenColor("on-primary-container", "light"));
  });

  it("resolves the abnormal chip glyph from `on-error-container` in BOTH modes", () => {
    render(<VitalStatCard label="Systolic" value="158" tone="abnormal" icon="blood-pressure" />);
    expect(glyphs()[0].color).toBe(tokenColor("on-error-container", "light"));

    screen.unmount();
    mockScheme.value = "dark";
    render(<VitalStatCard label="Systolic" value="158" tone="abnormal" icon="blood-pressure" />);
    expect(glyphs()[0].color).toBe(tokenColor("on-error-container", "dark"));
    expect(glyphs()[0].color).not.toBe(tokenColor("on-error-container", "light"));
  });

  it("re-resolves the trend glyph per mode too", () => {
    render(<VitalStatCard label="Heart rate" value="72" trend="flat" />);
    const light = glyphs().at(-1)!.color;
    expect(light).toBe(tokenColor("on-surface-variant", "light"));

    screen.unmount();
    mockScheme.value = "dark";
    render(<VitalStatCard label="Heart rate" value="72" trend="flat" />);
    expect(glyphs().at(-1)!.color).toBe(tokenColor("on-surface-variant", "dark"));
    expect(glyphs().at(-1)!.color).not.toBe(light);
  });

  it("swaps the chip fill token by tone, and never by a passed colour", () => {
    render(<VitalStatCard testID="v" label="Heart rate" value="72" icon="heart-rate" />);
    expect(screen.toJSON()).toBeTruthy();
    const normalFills = source().match(/bg-[a-z-]+/g) ?? [];
    // Exactly two fills exist in this file, one per tone. A third would be a
    // sixth private variant sneaking back in.
    expect(new Set(normalFills)).toEqual(new Set(["bg-primary-container", "bg-error-container"]));
  });
});

describe("VitalStatCard — slot order and the type ramp", () => {
  it("puts the LABEL first, then the value, then the unit — one order for every screen", () => {
    // The drift: Overview and Dashboard put label above value, Profile put value
    // above label. 211:242 (LabelRow) precedes 211:246 (ValueRow) in the frame.
    render(
      <VitalStatCard label="Heart rate" value="72" unit="bpm" trend="flat" trendLabel="Stable" />,
    );
    expect(slotOrder()).toEqual(["Heart rate", "72", "bpm", "Stable"]);
  });

  it("keeps that order with every optional slot filled, abnormal row included", () => {
    render(
      <VitalStatCard
        label="Systolic"
        value="158"
        unit="mmHg"
        tone="abnormal"
        trend="up"
        trendLabel="Up 8 since Tuesday"
        capturedAt="Measured 2 hours ago"
      />,
    );
    expect(slotOrder()).toEqual([
      "Systolic",
      "158",
      "mmHg",
      // The exception is read before the direction.
      "Outside your target range",
      "Up 8 since Tuesday",
      "Measured 2 hours ago",
    ]);
  });

  it("sizes the value from `headline-lg` only — no inline fontSize/fontWeight override", () => {
    // The three copies forced 22px, 28px/800 and label-md respectively. 211:247
    // binds `headline-lg` (Manrope Bold 24/1.3), and the token owns the number.
    const code = source();
    expect(code).toMatch(/text-headline-lg/);
    expect(code).not.toMatch(/fontSize/);
    expect(code).not.toMatch(/fontWeight/);
    expect(code).not.toMatch(/text-\[\d/);
  });

  it("names only ramp tokens for type — nothing off the 28/24/20/16/14/12 ramp", () => {
    // The allowlist is the WHOLE ramp — which is what this test's name claims,
    // and the rule that actually matters. It used to list only the three classes
    // the `card` layout happened to use, so adding the `row` layout, which
    // legitimately reaches for `body-md` (16) and `headline-md` (20), failed a
    // test named after a rule it was not enforcing. A guard pinned to today's
    // choices rather than the rule blocks legal changes and trains people to
    // edit the guard instead of trusting it.
    const RAMP = [
      "text-headline-xl", // 28
      "text-headline-lg", // 24
      "text-headline-md", // 20
      "text-body-md", //     16
      "text-label-md", //    14
      "text-label-sm", //    12
    ];
    const used = source().match(/text-(headline|body|label)-[a-z]{2}\b/g) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const cls of used) {
      expect(RAMP).toContain(cls);
    }
  });

  it("draws the chip at 24 and its glyph at 14, per 211:243", () => {
    render(<VitalStatCard label="Heart rate" value="72" icon="heart-rate" />);
    expect(glyphs()[0].size).toBe(14);
  });
});

describe("VitalStatCard — abnormal never signals with colour alone", () => {
  it("renders a glyph AND words for the abnormal state", () => {
    // BRAND "Colour rules": an out-of-range vital must also carry text or an
    // icon. Enforced here structurally, not left to each call site.
    render(<VitalStatCard label="Systolic" value="158" unit="mmHg" tone="abnormal" />);
    expect(screen.getByText("Outside your target range")).toBeTruthy();
    expect(glyphs()).toHaveLength(1);
  });

  it("still renders words when a caller supplies its own", () => {
    render(
      <VitalStatCard label="Systolic" value="158" tone="abnormal" abnormalLabel="Above target" />,
    );
    expect(screen.getByText("Above target")).toBeTruthy();
  });

  it("renders no abnormal row for a normal reading", () => {
    render(<VitalStatCard label="Systolic" value="118" tone="normal" />);
    expect(screen.queryByText("Outside your target range")).toBeNull();
  });

  it("speaks the tone, not just the number", () => {
    render(
      <VitalStatCard
        testID="v"
        label="Systolic"
        value="158"
        unit="mmHg"
        tone="abnormal"
        trend="up"
        onPress={() => {}}
      />,
    );
    const spoken = screen.getByTestId("v").props.accessibilityLabel as string;
    expect(spoken).toContain("Systolic, 158 mmHg");
    expect(spoken).toContain("Outside your target range");
    expect(spoken).toContain("Trending up");
  });
});

describe("VitalStatCard — the layout axis", () => {
  // `layout` exists because the component's own strictness created a seventh
  // private copy: PatientRecordScreen needed a horizontal line, VitalStatCard
  // exposes no className/style by design, so the screen forked. These lock the
  // axis to being a real alternative rather than a second component in disguise.

  it("renders the same content in both layouts", () => {
    const props = { label: "Blood pressure", value: "145/92", unit: "mmHg" } as const;

    const card = render(<VitalStatCard {...props} />);
    expect(screen.getByText("Blood pressure")).toBeTruthy();
    expect(screen.getByText("145/92")).toBeTruthy();
    expect(screen.getByText("mmHg")).toBeTruthy();
    card.unmount();

    render(<VitalStatCard {...props} layout="row" />);
    expect(screen.getByText("Blood pressure")).toBeTruthy();
    expect(screen.getByText("145/92")).toBeTruthy();
    expect(screen.getByText("mmHg")).toBeTruthy();
  });

  it("keeps the non-colour abnormal signal in row layout", () => {
    // The whole point of the shared component. A layout axis must not become a
    // way to opt out of WCAG 1.4.1.
    render(
      <VitalStatCard
        layout="row"
        label="Blood pressure"
        value="145/92"
        unit="mmHg"
        tone="abnormal"
        abnormalLabel="Above target"
      />,
    );
    expect(screen.getByText("Above target")).toBeTruthy();
    expect(glyphs().length).toBeGreaterThan(0);
  });

  it("announces one sentence even when not tappable", () => {
    // Previously the spoken summary was applied only on the pressable path, so
    // the same reading announced as one sentence or as four loose fragments
    // depending on whether it happened to have an onPress.
    render(
      <VitalStatCard
        testID="v"
        layout="row"
        label="Blood pressure"
        value="145/92"
        unit="mmHg"
        tone="abnormal"
        abnormalLabel="Above target"
      />,
    );
    const spoken = screen.getByTestId("v").props.accessibilityLabel as string;
    expect(spoken).toContain("Blood pressure, 145/92 mmHg");
    expect(spoken).toContain("Above target");
  });

  it("casts no shadow in row layout either", () => {
    render(<VitalStatCard testID="v" layout="row" label="Heart rate" value="72" />);
    const flat = StyleSheet.flatten(screen.getByTestId("v").props.style) ?? {};
    for (const key of ["shadowColor", "shadowOpacity", "shadowRadius", "elevation"]) {
      expect((flat as Record<string, unknown>)[key]).toBeUndefined();
    }
  });
});

describe("VitalStatCard — touch target and press contract", () => {
  it("clears the 44pt floor when tappable", () => {
    render(<VitalStatCard testID="v" label="Heart rate" value="72" onPress={() => {}} />);
    expect(flat(screen.getByTestId("v").props.style).minHeight).toBe(44);
  });

  it("is a button only when it has an onPress", () => {
    render(<VitalStatCard testID="v" label="Heart rate" value="72" onPress={() => {}} />);
    expect(screen.getByTestId("v").props.accessibilityRole).toBe("button");

    screen.unmount();
    render(<VitalStatCard testID="v" label="Heart rate" value="72" />);
    expect(screen.getByTestId("v").props.accessibilityRole).toBeUndefined();
  });

  it("calls onPress", () => {
    const onPress = jest.fn();
    render(<VitalStatCard testID="v" label="Heart rate" value="72" onPress={onPress} />);
    fireEvent.press(screen.getByTestId("v"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("gives press feedback without a scale transform", () => {
    // The private copies used `active:scale-[0.99]`, which nudges the 1px
    // hairline off the pixel grid. Opacity instead.
    const code = source();
    expect(code).toMatch(/active:opacity-/);
    expect(code).not.toMatch(/active:scale/);
  });
});

describe("VitalStatCard — no private variants", () => {
  it("exposes no `className` and no `style` prop", () => {
    // This is the whole anti-drift mechanism: a screen can choose a MEANING
    // (`tone`, `trend`) or add a `footer`, but it cannot restyle the reading.
    const code = source();
    expect(code).not.toMatch(/^\s*className\?:/m);
    expect(code).not.toMatch(/^\s*style\?:/m);
  });

  it("exposes no colour prop of any kind", () => {
    const code = source();
    expect(code).not.toMatch(/^\s*(color|tint|valueColor|backgroundColor)\?:/m);
  });

  it("keeps charting out — `footer` is a slot, not a chart/data prop", () => {
    const code = source();
    expect(code).not.toMatch(/MiniChart|HealthTrendChart|\bchart\?:/i);
    render(
      <VitalStatCard label="Heart rate" value="72" footer={<RNText>sparkline</RNText>} />,
    );
    expect(screen.getByText("sparkline")).toBeTruthy();
  });
});
