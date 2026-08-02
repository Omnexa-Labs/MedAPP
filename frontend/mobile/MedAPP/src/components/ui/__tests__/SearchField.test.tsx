// Locks the search-row contract, i.e. the drift that made this component
// necessary. Five screens had each hand-rolled this row and each got a different
// subset of it wrong, so the assertions here are deliberately about the FAILURES
// rather than about rendering:
//
//  1. FROZEN LIGHT-MODE LITERALS. FindCare/Inbox shipped `#6d7a77`, Explore
//     `#6d7a7799`, CommunityHub `#3d4947`, and all four typed `#171d1c` — so in
//     dark mode the user typed near-black on a dark field. A render assertion
//     would not have caught this, because the LIGHT values were right. So the
//     source is asserted to contain no colour literal at all, AND the resolved
//     glyph/placeholder/value colours are asserted to differ between modes.
//  2. GEOMETRY RE-DERIVED INSTEAD OF INHERITED. The copies grew their height out
//     of `paddingVertical: 14` or `py-sm` instead of Input's fixed 52, and filled
//     themselves with `surface-container-lowest` instead of the recessed
//     `field-surface` role, so field and card came out the same colour. The fix
//     is composition, so the test asserts this file DECLARES no field geometry —
//     no height, no fill, no radius, no border, no gutter. That is what makes a
//     private variant impossible rather than merely discouraged.
//  3. A 36pt CLEAR BUTTON. Figma names the node "clear-button (44x44)" and
//     docs/MOBILE_UX.md forbids shipping a smaller tap area, so the target is
//     asserted at 44 — and asserted not to be shrunk by the -12 pull that
//     reconciles Figma's `pr-4` with Input's `px-4`.
//  4. AN ILLEGAL CARD SHADOW. FindCare's row carried one; BRAND's "Elevation"
//     allows a shadow only on sheets/menus/dialogs/toasts/FABs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet, TextInput, View } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };

// nativewind is the single source of the rendered scheme (src/lib/theme.ts reads
// it, src/lib/tokens.ts resolves against it), so this is the seam for asserting
// both modes without a native colour-scheme module.
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Icon } from "../icons/Icon";
import { Input } from "../Input";
import { SearchField } from "../SearchField";

const SOURCE_PATH = join(__dirname, "..", "SearchField.tsx");

/**
 * Source with every comment stripped. The prose in SearchField.tsx necessarily
 * quotes the removed literals (`#6d7a77`, `surface-container-lowest`) and the
 * removed classes, so comments must not be able to fail — or satisfy — these
 * assertions.
 */
function code(): string {
  return readFileSync(SOURCE_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

function flat(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

/** The TextInput Input renders — one per SearchField. */
function textInput() {
  return screen.UNSAFE_getByType(TextInput);
}

/** Input's own bordered container: the only View in the tree with a borderWidth. */
function fieldBox() {
  const box = screen.UNSAFE_getAllByType(View).find((n) => flat(n.props.style).borderWidth);
  if (!box) throw new Error("no bordered field container rendered");
  return box;
}

/** Every `<Icon />` rendered, with the props it was given. */
function glyphs() {
  return screen.UNSAFE_getAllByType(Icon).map((n) => n.props as Record<string, unknown>);
}

const noop = () => {};

describe("SearchField — theme safety (the frozen-literal drift)", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("contains no hardcoded colour anywhere outside comments", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    // Named CSS colours are the other way a literal sneaks in, and BRAND is
    // explicit that white is not exempt.
    expect(src).not.toMatch(/\b(white|black)\b/);
  });

  it("emits no shadow — 396:538 has no effect and BRAND forbids one on a field", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
    expect(src).not.toMatch(/boxShadow/);
  });

  it("imports no icon library directly — glyphs go through the shared <Icon />", () => {
    expect(code()).not.toMatch(/@expo\/vector-icons/);
    expect(code()).not.toMatch(/react-native-vector-icons|healthicons/);
  });

  it("resolves glyph, placeholder and typed-value colours from tokens in LIGHT mode", () => {
    render(<SearchField value="Cardiologist" onChangeText={noop} onClear={noop} />);
    const variant = tokenColor("on-surface-variant", "light");
    // Leading search glyph and the clear glyph both take the variant pair.
    expect(glyphs().map((p) => p.color)).toEqual([variant, variant]);
    expect(textInput().props.placeholderTextColor).toBe(variant);
    expect(flat(textInput().props.style).color).toBe(tokenColor("on-surface", "light"));
  });

  it("RE-RESOLVES them in DARK mode — the actual bug in all five hand-rolls", () => {
    mockScheme.value = "dark";
    render(<SearchField value="Cardiologist" onChangeText={noop} onClear={noop} />);
    const variantDark = tokenColor("on-surface-variant", "dark");
    const onSurfaceDark = tokenColor("on-surface", "dark");

    expect(glyphs().map((p) => p.color)).toEqual([variantDark, variantDark]);
    expect(textInput().props.placeholderTextColor).toBe(variantDark);
    expect(flat(textInput().props.style).color).toBe(onSurfaceDark);

    // The regression itself: these used to equal the light values in dark mode,
    // i.e. near-black text on a dark field.
    expect(variantDark).not.toBe(tokenColor("on-surface-variant", "light"));
    expect(onSurfaceDark).not.toBe(tokenColor("on-surface", "light"));
  });

  it("re-resolves the border per mode too, which none of the copies had at all", () => {
    render(<SearchField value="" onChangeText={noop} />);
    expect(flat(fieldBox().props.style).borderColor).toBe(tokenColor("outline-variant", "light"));

    screen.unmount();
    mockScheme.value = "dark";
    render(<SearchField value="" onChangeText={noop} />);
    expect(flat(fieldBox().props.style).borderColor).toBe(tokenColor("outline-variant", "dark"));
    expect(tokenColor("outline-variant", "dark")).not.toBe(tokenColor("outline-variant", "light"));
  });

  it("takes the error border and marks the field invalid to assistive tech", () => {
    render(<SearchField value="x" onChangeText={noop} hasError />);
    expect(flat(fieldBox().props.style).borderColor).toBe(tokenColor("error", "light"));
    expect(textInput().props["aria-invalid"]).toBe(true);
  });
});

describe("SearchField — composition over Input, not a copy of it", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("renders the shared Input rather than a bare TextInput row", () => {
    render(<SearchField value="" onChangeText={noop} />);
    expect(screen.UNSAFE_getByType(Input)).toBeTruthy();
  });

  // The load-bearing assertion. Every field metric must come from Input by
  // import; the moment this file declares its own height, fill, radius, border or
  // gutter it has become the sixth private variant.
  it("declares NO field geometry of its own — height, fill, radius, border, gutter", () => {
    const src = code();
    expect(src).not.toMatch(/paddingVertical|paddingHorizontal/);
    expect(src).not.toMatch(/\bheight:\s*52\b/);
    expect(src).not.toMatch(/h-\[|\bh-\d/);
    expect(src).not.toMatch(/\bbg-[a-z]/);
    expect(src).not.toMatch(/rounded-/);
    expect(src).not.toMatch(/\bborder\b|borderWidth|borderColor/);
    expect(src).not.toMatch(/\bpx-\d|\bpy-\d|\bpx-[a-z]|\bpy-[a-z]/);
    expect(src).not.toMatch(/fontSize|lineHeight|font-\w/);
  });

  it("inherits Input's 52pt height and body-md metrics through that composition", () => {
    render(<SearchField value="" onChangeText={noop} />);
    // Input's own inline text metrics — body-md 16 x 1.4 leading.
    const style = flat(textInput().props.style);
    expect(style.fontSize).toBe(16);
    expect(style.lineHeight).toBeCloseTo(22.4);
    // 1px resting hairline, widening to 2 on focus — Input's contract.
    expect(flat(fieldBox().props.style).borderWidth).toBe(1);
  });

  it("uses the frame's chrome-search glyph at 20, not a Health Icon", () => {
    render(<SearchField value="" onChangeText={noop} />);
    const [leading] = glyphs();
    expect(leading.chrome).toBe("search");
    expect(leading.name).toBeUndefined();
    expect(leading.size).toBe(20);
  });
});

describe("SearchField — State=Has query (396:530)", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("shows no clear affordance on the empty Default state", () => {
    render(<SearchField value="" onChangeText={noop} onClear={noop} />);
    expect(screen.queryByLabelText("Clear search")).toBeNull();
    expect(glyphs()).toHaveLength(1);
  });

  it("shows it as soon as there is a query, with the frame's close glyph at 20", () => {
    render(<SearchField value="Cardiologist" onChangeText={noop} onClear={noop} />);
    expect(screen.getByLabelText("Clear search")).toBeTruthy();
    expect(glyphs()[1].chrome).toBe("close");
    expect(glyphs()[1].size).toBe(20);
  });

  it("gives the clear button a 44x44 target — the frame's size and the a11y floor", () => {
    render(<SearchField value="Cardiologist" onChangeText={noop} onClear={noop} />);
    const style = flat(screen.getByLabelText("Clear search").props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    // The -12 pull reconciles Figma's pr-4 with Input's px-4. It must move the
    // box, never shrink it — a negative padding or a smaller box would put us
    // back at the 36pt target the hand-rolls shipped.
    expect(style.marginRight).toBe(-12);
    expect(style.padding).toBeUndefined();
  });

  it("clears through onChangeText when the caller passed no onClear", () => {
    const onChangeText = jest.fn();
    render(<SearchField value="Cardiologist" onChangeText={onChangeText} />);
    fireEvent.press(screen.getByLabelText("Clear search"));
    expect(onChangeText).toHaveBeenCalledWith("");
  });

  it("hands clearing to the caller when onClear is passed", () => {
    const onClear = jest.fn();
    const onChangeText = jest.fn();
    render(<SearchField value="Cardiologist" onChangeText={onChangeText} onClear={onClear} />);
    fireEvent.press(screen.getByLabelText("Clear search"));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it("submits on the keyboard's search key", () => {
    const onSubmit = jest.fn();
    render(<SearchField value="Cardiologist" onChangeText={noop} onSubmit={onSubmit} />);
    expect(textInput().props.returnKeyType).toBe("search");
    fireEvent(textInput(), "submitEditing");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("suppresses the iOS native clear button, so one field can't get two", () => {
    render(<SearchField value="Cardiologist" onChangeText={noop} />);
    expect(textInput().props.clearButtonMode).toBe("never");
  });
});

describe("SearchField — trigger mode (the search entry point)", () => {
  beforeEach(() => {
    mockScheme.value = "light";
  });

  it("presses as one button and does not accept typing", () => {
    const onPress = jest.fn();
    render(
      <SearchField
        value=""
        onChangeText={noop}
        editable={false}
        onPress={onPress}
        accessibilityLabel="Search the care directory"
        testID="trigger"
      />,
    );
    const trigger = screen.getByTestId("trigger");
    expect(trigger.props.accessibilityRole).toBe("button");
    expect(trigger.props.accessibilityLabel).toBe("Search the care directory");
    fireEvent.press(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(textInput().props.editable).toBe(false);
  });

  it("draws no clear button even with a value — a trigger has nothing to clear", () => {
    render(<SearchField value="Cardiologist" onChangeText={noop} editable={false} />);
    expect(screen.queryByLabelText("Clear search")).toBeNull();
  });

  it("keeps the inner field out of the accessibility tree, so there is ONE node", () => {
    render(<SearchField value="" onChangeText={noop} editable={false} testID="trigger" />);
    expect(textInput().props.importantForAccessibility).toBe("no-hide-descendants");
    expect(textInput().props.focusable).toBe(false);
  });

  it("stays a real field in the default (editable) mode", () => {
    render(<SearchField value="" onChangeText={noop} testID="field" />);
    expect(screen.getByTestId("field").props.editable).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
