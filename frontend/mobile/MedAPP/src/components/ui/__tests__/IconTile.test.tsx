// Locks IconTile (Figma 756:4255 / 756:5246).
//
// This is the booking flow's worst offender for frozen colour: the three screens
// draw this one tile with `#d5e3fc`, `#d8e2ff`, `rgba(33,112,228,0.12)` and
// `rgba(0,88,190,0.05)` under `#0058be` glyphs — four fills and a blue that
// appears in no frame and in no token. Every assertion about colour here exists
// to fail if any of that comes back.

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
import { IconTile } from "../IconTile";

function code(): string {
  return readFileSync(join(__dirname, "..", "IconTile.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const glyph = () => screen.UNSAFE_getAllByType(Icon)[0].props as Record<string, unknown>;

beforeEach(() => {
  mockScheme.value = "light";
});

describe("IconTile — the blue is gone", () => {
  it("contains no colour literal at all", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black|blue)\b/);
  });

  it("has exactly ONE fill, and it is primary-tint", () => {
    // Four competing fills is what made this component necessary.
    expect(code().match(/\bbg-[a-z0-9-/]+/g)).toEqual(["bg-primary-tint"]);
  });

  it("tints the glyph `primary`, re-resolved per mode", () => {
    render(<IconTile icon="calendar-today" />);
    expect(glyph().color).toBe(tokenColor("primary", "light"));

    mockScheme.value = "dark";
    render(<IconTile icon="calendar-today" />);
    const dark = glyph().color;
    expect(dark).toBe(tokenColor("primary", "dark"));
    // The shipped bug: `#0058be` stayed the same in both modes.
    expect(dark).not.toBe(tokenColor("primary", "light"));
  });

  it("imports no icon library directly", () => {
    expect(code()).not.toMatch(/@expo\/vector-icons/);
  });
});

describe("IconTile — 756:4255 / 756:5246 geometry", () => {
  it("is a 40 square with a 20 glyph by default", () => {
    render(<IconTile icon="schedule" testID="tile" />);
    const style = StyleSheet.flatten(screen.getByTestId("tile").props.style) as Record<
      string,
      unknown
    >;
    expect(style.width).toBe(40);
    expect(style.height).toBe(40);
    expect(glyph().size).toBe(20);
  });

  it("is a 32 square with an 18 glyph at the checklist size", () => {
    render(<IconTile icon="schedule" size={32} testID="tile" />);
    const style = StyleSheet.flatten(screen.getByTestId("tile").props.style) as Record<
      string,
      unknown
    >;
    expect(style.width).toBe(32);
    expect(style.height).toBe(32);
    expect(glyph().size).toBe(18);
  });

  it("uses radius/12 and only radius/12", () => {
    const src = code();
    expect(src).toMatch(/\brounded-md\b/);
    expect(src).not.toMatch(/\brounded-(full|lg|xl|xs|card|tile)\b/);
  });

  it("emits no shadow — a tile is not a floating surface", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
  });
});

describe("IconTile — accessibility", () => {
  it("is decorative by default: the KeyValueRow beside it carries the meaning", () => {
    render(<IconTile icon="calendar-today" />);
    expect(glyph().label).toBeUndefined();
  });

  it("announces a label when the glyph IS the row's only differentiator", () => {
    // The confirmation checklist (756:5246): three otherwise identical plates.
    render(<IconTile icon="credential" size={32} label="Bring photo ID" />);
    expect(screen.getByLabelText("Bring photo ID")).toBeTruthy();
  });

  it("is not pressable — a tile is not a target and carries no 44pt claim", () => {
    render(<IconTile icon="schedule" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("IconTile — icon gate", () => {
  it("routes a clinical name to `name` (Health Icons wins the collision)", () => {
    render(<IconTile icon="stethoscope" />);
    expect(glyph().name).toBe("stethoscope");
    expect(glyph().chrome).toBeUndefined();
  });

  it("routes a chrome name to `chrome`", () => {
    render(<IconTile icon="location-on" />);
    expect(glyph().chrome).toBe("location-on");
    expect(glyph().name).toBeUndefined();
  });
});
