// Locks SuccessMedallion (Figma 756:4753).
//
// The reason this suite exists at all is the `heroShadow` that shipped behind it
// on BookingConfirmedScreen. A medallion is not one of docs/BRAND.md's sanctioned
// floating roles (sheet, menu, dialog, toast) — it is a flat mark on the page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Icon } from "../icons/Icon";
import { SuccessMedallion } from "../SuccessMedallion";

function code(): string {
  return readFileSync(join(__dirname, "..", "SuccessMedallion.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

beforeEach(() => {
  mockScheme.value = "light";
});

describe("SuccessMedallion", () => {
  it("is a 96 circle with a 48 check", () => {
    render(<SuccessMedallion testID="medallion" />);
    const style = StyleSheet.flatten(screen.getByTestId("medallion").props.style) as Record<
      string,
      unknown
    >;
    expect(style.width).toBe(96);
    expect(style.height).toBe(96);
    const glyph = screen.UNSAFE_getAllByType(Icon)[0].props;
    expect(glyph.chrome).toBe("check");
    expect(glyph.size).toBe(48);
  });

  it("tints the glyph `on-primary` on its `primary` fill, per mode", () => {
    render(<SuccessMedallion />);
    expect(screen.UNSAFE_getAllByType(Icon)[0].props.color).toBe(tokenColor("on-primary", "light"));

    mockScheme.value = "dark";
    render(<SuccessMedallion />);
    const dark = screen.UNSAFE_getAllByType(Icon)[0].props.color;
    expect(dark).toBe(tokenColor("on-primary", "dark"));
    expect(dark).not.toBe(tokenColor("on-primary", "light"));
  });

  it("ANNOUNCES the outcome — it is not decorative", () => {
    // Without a label a screen reader lands on an unannounced 96px shape at the
    // top of a terminal screen.
    render(<SuccessMedallion />);
    expect(screen.getByLabelText("Confirmed")).toBeTruthy();
  });

  it("lets a caller change the announced word", () => {
    render(<SuccessMedallion label="Booking confirmed" />);
    expect(screen.getByLabelText("Booking confirmed")).toBeTruthy();
  });

  it("emits NO shadow — the heroShadow this replaces was the whole point", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
    render(<SuccessMedallion testID="medallion" />);
    const style = (StyleSheet.flatten(screen.getByTestId("medallion").props.style) ??
      {}) as Record<string, unknown>;
    for (const key of ["shadowColor", "shadowOpacity", "shadowRadius", "shadowOffset", "elevation"]) {
      expect(style[key]).toBeUndefined();
    }
  });

  it("contains no colour literal and imports no icon library", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black)\b/);
    expect(src).not.toMatch(/@expo\/vector-icons/);
  });
});
