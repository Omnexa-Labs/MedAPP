// Locks InfoCallout (Figma 756:4361, plus the error tone derived from 756:4586).
//
// The load-bearing assertions: the error tone always renders a glyph beside its
// words (colour is never the only signal), and the callout is not a card and not
// a floating surface.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { Icon } from "../icons/Icon";
import { InfoCallout } from "../InfoCallout";

function code(): string {
  return readFileSync(join(__dirname, "..", "InfoCallout.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const glyph = () => screen.UNSAFE_getAllByType(Icon)[0].props as Record<string, unknown>;

beforeEach(() => {
  mockScheme.value = "light";
});

describe("InfoCallout — tones", () => {
  it("defaults to info: primary-tint plate, primary glyph", () => {
    render(<InfoCallout>Free cancellation until 24 hours before.</InfoCallout>);
    expect(glyph().chrome).toBe("info-outline");
    expect(glyph().color).toBe(tokenColor("primary", "light"));
    expect(screen.getByText("Free cancellation until 24 hours before.")).toBeTruthy();
  });

  it("swaps to the error container pair for the failure states", () => {
    render(<InfoCallout tone="error">MedApp can&apos;t add this to your calendar.</InfoCallout>);
    expect(glyph().chrome).toBe("error-outline");
    expect(glyph().color).toBe(tokenColor("on-error-container", "light"));
  });

  it("pairs each tone's glyph token with its own body token, so the two cannot drift", () => {
    const src = code();
    expect(src).toMatch(/body:\s*"text-on-surface-variant"[\s\S]{0,80}glyph:\s*"primary"/);
    expect(src).toMatch(/body:\s*"text-on-error-container"[\s\S]{0,80}glyph:\s*"on-error-container"/);
  });

  it("re-resolves the glyph per mode", () => {
    mockScheme.value = "dark";
    render(<InfoCallout tone="error">Failed.</InfoCallout>);
    const dark = glyph().color;
    expect(dark).toBe(tokenColor("on-error-container", "dark"));
    expect(dark).not.toBe(tokenColor("on-error-container", "light"));
  });

  it("lets a caller override the glyph without touching the tone", () => {
    render(<InfoCallout icon="lock">Secure.</InfoCallout>);
    expect(glyph().chrome).toBe("lock");
  });
});

describe("InfoCallout — colour is never the only signal", () => {
  it("ALWAYS renders a glyph, including in the error tone with no icon passed", () => {
    // docs/BRAND.md §Colour rules, WCAG 1.4.1: an error that is only a pink box
    // is not an error anyone can read in sunlight.
    render(<InfoCallout tone="error">That slot was just taken.</InfoCallout>);
    expect(screen.UNSAFE_getAllByType(Icon)).toHaveLength(1);
  });

  it("has no way to suppress the glyph", () => {
    // No `icon={null}`, no `showIcon` prop — the signal is structural.
    expect(code()).not.toMatch(/showIcon|hideIcon/);
  });
});

describe("InfoCallout — children", () => {
  it("wraps a string on the body-md ramp", () => {
    render(<InfoCallout>Policy text.</InfoCallout>);
    expect(code()).toMatch(/font-body-md text-body-md/);
    expect(screen.getByText("Policy text.")).toBeTruthy();
  });

  it("passes elements through, for the callout whose last line is an action", () => {
    render(
      <InfoCallout tone="error">
        <Text>No calendar access.</Text>
        <Text>Open Settings</Text>
      </InfoCallout>,
    );
    expect(screen.getByText("No calendar access.")).toBeTruthy();
    expect(screen.getByText("Open Settings")).toBeTruthy();
  });
});

describe("InfoCallout — treatment", () => {
  it("contains no colour literal", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black)\b/);
  });

  it("is NOT a card — no hairline, no radius/24, no 24 inset", () => {
    const src = code();
    expect(src).not.toMatch(/\brounded-card\b/);
    expect(src).not.toMatch(/\bborder\b/);
    expect(src).toMatch(/\brounded-md\b/);
    expect(src).toMatch(/\bp-4\b/);
  });

  it("emits no shadow — a callout is a tint on the page, not a floating surface", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
  });

  it("imports no icon library directly", () => {
    expect(code()).not.toMatch(/@expo\/vector-icons/);
  });
});
