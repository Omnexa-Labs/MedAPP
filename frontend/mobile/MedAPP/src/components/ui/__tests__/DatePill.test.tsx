// Locks DatePill (Figma 756:4424…756:4439).
//
// Two things this suite is really guarding:
//  1. THREE lines. The private tile drew two, and the screen then string-concatenated
//     a hardcoded "May" to make a human date — a booking screen asserting a month
//     it was never given. The third line is real data, and the props type is what
//     makes the literal impossible.
//  2. UNAVAILABLE IS NOT A COLOUR. Dashed hairline at FULL strength, content at
//     0.38, not pressable, announced. docs/BRAND.md §Colour rules.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { DatePill } from "../DatePill";

function code(): string {
  return readFileSync(join(__dirname, "..", "DatePill.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

function pillStyle(testID = "pill") {
  const style = screen.getByTestId(testID).props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style,
  ) as Record<string, unknown>;
}

/** The content wrapper's opacity — the node the unavailable dim lands on. */
function contentOpacity(testID = "pill") {
  const style = StyleSheet.flatten(
    screen.getByTestId(`${testID}-content`).props.style,
  ) as Record<string, unknown>;
  return style.opacity as number;
}

const props = { day: "Tue", date: "13", month: "May", onPress: () => {} };

describe("DatePill — three lines, and the third is real data", () => {
  it("renders Day, Date and Month", () => {
    render(<DatePill {...props} />);
    expect(screen.getByText("Tue")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    expect(screen.getByText("May")).toBeTruthy();
  });

  it("takes the month as a REQUIRED prop, so no call site can hardcode one", () => {
    // `month: string` with no default is what removes `` `${d.day}, May ${d.date}` ``.
    expect(code()).toMatch(/month:\s*string;/);
    expect(code()).not.toMatch(/"May"|'May'/);
  });

  it("announces all three lines as one date", () => {
    render(<DatePill {...props} />);
    expect(screen.getByLabelText("Tue 13 May")).toBeTruthy();
  });
});

describe("DatePill — states", () => {
  it("default: card surface, full-strength hairline, on-surface date", () => {
    const src = code();
    expect(src).toMatch(/container:\s*"border-outline-variant bg-card-surface"/);
  });

  it("selected: primary fill, on-primary lines, and reports selected + checked", () => {
    render(<DatePill {...props} selected testID="pill" />);
    const pill = screen.getByTestId("pill");
    expect(pill.props.accessibilityState.selected).toBe(true);
    // Android's radio mapping reads `checked`, not `selected`.
    expect(pill.props.accessibilityState.checked).toBe(true);
    expect(code()).toMatch(/container:\s*"border-primary bg-primary"/);
  });

  it("keeps a border in EVERY state, so selection causes no layout shift", () => {
    // Figma strokes are inset and cost no layout; an RN border does. Dropping it
    // on selection shrinks the pill 2pt per axis and the strip twitches.
    const src = code();
    expect(src.match(/container:\s*"[^"]*"/g)?.every((c) => /border/.test(c))).toBe(true);
  });

  it("calls back on press", () => {
    const onPress = jest.fn();
    render(<DatePill {...props} onPress={onPress} testID="pill" />);
    fireEvent.press(screen.getByTestId("pill"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("DatePill — unavailable is not colour-only", () => {
  it("draws a DASHED hairline, which is the non-colour signal", () => {
    expect(code()).toMatch(/container:\s*"border-dashed border-outline-variant"/);
  });

  it("dims the CONTENT to 0.38 and leaves the border at full strength", () => {
    render(<DatePill {...props} unavailable testID="pill" />);
    // Fading the border too would erase the signal and leave a blank rectangle.
    expect(pillStyle().opacity).toBeUndefined();
    expect(contentOpacity()).toBe(0.38);
  });

  it("is not pressable, and reports disabled", () => {
    const onPress = jest.fn();
    render(<DatePill {...props} unavailable onPress={onPress} testID="pill" />);
    expect(screen.getByTestId("pill").props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId("pill"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("ANNOUNCES the state, so it reaches a screen reader and not only an eye", () => {
    render(<DatePill {...props} day="Thu" date="15" unavailable />);
    expect(screen.getByLabelText("Thu 15 May, unavailable")).toBeTruthy();
  });
});

describe("DatePill — geometry and treatment", () => {
  it("is 60 wide with an 80 FLOOR, clearing 44pt on both axes", () => {
    render(<DatePill {...props} testID="pill" />);
    const style = pillStyle();
    expect(style.width).toBe(60);
    expect(style.minHeight).toBe(80);
    // A floor, not a fixed height, so a large font scale can grow it.
    expect(style.height).toBeUndefined();
  });

  it("uses radius/12 and only radius/12", () => {
    const src = code();
    expect(src).toMatch(/\brounded-md\b/);
    expect(src).not.toMatch(/\brounded-(full|lg|xl|xs|card|tile)\b/);
  });

  it("sets all three lines on the ramp, nothing under 12sp", () => {
    const src = code();
    expect(src).toMatch(/font-label-sm text-label-sm/);
    expect(src).toMatch(/font-headline-md text-headline-md/);
    expect(src).not.toMatch(/text-\[\d+px\]/);
    expect(src).not.toMatch(/fontSize/);
  });

  it("contains no colour literal and emits no shadow", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black)\b/);
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
  });
});
