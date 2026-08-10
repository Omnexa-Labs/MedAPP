// Locks SectionHeader (Figma 756:4413) against the two things it replaces:
// an 11px uppercase caption (under docs/BRAND.md's 12sp floor) and a heading
// drawn INSIDE the card it names.
//
// Following ChoiceChip.test.tsx: class-level facts are asserted against the
// SOURCE, because a wrong type ramp renders as a style that is brittle to assert
// on; props, geometry and behaviour are asserted on the rendered tree.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Icon } from "../icons/Icon";
import { SectionHeader } from "../SectionHeader";

/** Source with comments stripped — the prose quotes the values it replaced. */
function code(): string {
  return readFileSync(join(__dirname, "..", "SectionHeader.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

function flat(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style,
  ) as Record<string, unknown>;
}

beforeEach(() => {
  mockScheme.value = "light";
});

describe("SectionHeader — the 12sp floor", () => {
  it("sets the title on the headline-md ramp, never an arbitrary size", () => {
    const src = code();
    expect(src).toMatch(/font-headline-md text-headline-md/);
    // The exact defect: `fontSize: 11` on ReviewAppointmentScreen's SectionCard.
    expect(src).not.toMatch(/fontSize/);
    expect(src).not.toMatch(/text-\[\d+px\]/);
  });

  it("does not uppercase or track the title — that was the caption treatment", () => {
    const src = code();
    expect(src).not.toMatch(/uppercase/);
    expect(src).not.toMatch(/tracking-/);
    expect(src).not.toMatch(/textTransform/);
  });

  it("renders the title as a heading, so a screen reader's rotor can reach it", () => {
    render(<SectionHeader title="Available Slots" />);
    expect(screen.getByRole("header", { name: "Available Slots" })).toBeTruthy();
  });
});

describe("SectionHeader — theme safety", () => {
  it("contains no colour literal of any kind", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black)\b/);
  });

  it("imports no icon library directly", () => {
    expect(code()).not.toMatch(/@expo\/vector-icons/);
  });

  it("re-resolves the leading glyph per mode", () => {
    render(<SectionHeader title="Before your appointment" icon="lightbulb" />);
    expect(screen.UNSAFE_getAllByType(Icon)[0].props.color).toBe(tokenColor("on-surface", "light"));

    mockScheme.value = "dark";
    render(<SectionHeader title="Before your appointment" icon="lightbulb" />);
    const dark = screen.UNSAFE_getAllByType(Icon)[0].props.color;
    expect(dark).toBe(tokenColor("on-surface", "dark"));
    expect(dark).not.toBe(tokenColor("on-surface", "light"));
  });
});

describe("SectionHeader — icon slot", () => {
  it("renders no glyph when none is asked for", () => {
    render(<SectionHeader title="Location" />);
    expect(screen.UNSAFE_queryAllByType(Icon)).toHaveLength(0);
  });

  it("routes a clinical name to `name` and a chrome name to `chrome`", () => {
    render(<SectionHeader title="Vitals" icon="stethoscope" />);
    expect(screen.UNSAFE_getAllByType(Icon)[0].props.name).toBe("stethoscope");

    render(<SectionHeader title="Tips" icon="lightbulb" />);
    expect(screen.UNSAFE_getAllByType(Icon)[0].props.chrome).toBe("lightbulb");
  });

  it("draws the glyph at the dense-row size and hides it from assistive tech", () => {
    render(<SectionHeader title="Tips" icon="lightbulb" />);
    const g = screen.UNSAFE_getAllByType(Icon)[0].props;
    expect(g.size).toBe(20);
    // Decorative — the title beside it says the same thing.
    expect(g.label).toBeUndefined();
  });
});

describe("SectionHeader — action slot", () => {
  it("renders no action by default", () => {
    render(<SectionHeader title="Available Slots" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls back and takes the FULL 44pt row height as its target", () => {
    const onPress = jest.fn();
    render(
      <SectionHeader
        title="Select Date"
        action={{ label: "See Calendar", onPress }}
        testID="header"
      />,
    );
    const action = screen.getByRole("button", { name: "See Calendar" });
    // The target is the visible row, not a 17pt strip of text inside it.
    expect(StyleSheet.flatten(action.props.style).minHeight).toBe(44);
    fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("reports disabled and swallows the press", () => {
    const onPress = jest.fn();
    render(
      <SectionHeader
        title="Select Date"
        action={{ label: "See Calendar", onPress, disabled: true }}
      />,
    );
    const action = screen.getByRole("button", { name: "See Calendar" });
    expect(action.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(action);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("SectionHeader — geometry", () => {
  it("is 44 tall as a FLOOR, so a large font scale can grow it", () => {
    render(<SectionHeader title="Location" testID="header" />);
    const style = flat("header");
    expect(style.minHeight).toBe(44);
    expect(style.height).toBeUndefined();
  });

  it("emits no shadow — a heading is not a surface", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
  });

  it("draws no card treatment — the heading sits OUTSIDE the card it names", () => {
    const src = code();
    expect(src).not.toMatch(/\brounded-card\b/);
    expect(src).not.toMatch(/\bbg-card-surface\b/);
    expect(src).not.toMatch(/\bborder\b/);
  });

  it("exposes no className or style escape hatch", () => {
    const src = code();
    expect(src).not.toMatch(/className\?:/);
    expect(src).not.toMatch(/style\?:/);
  });
});
