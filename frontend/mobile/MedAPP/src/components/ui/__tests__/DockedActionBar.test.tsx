// Locks DockedActionBar (Figma 781:2291).
//
// What it is guarding, in order of how badly it went wrong:
//  1. ONE geometry. The flow shipped `borderRadius: 999`, `borderRadius: 12` at
//     ~48 tall, and `borderRadius: 16` at 56 — three answers for one control.
//     Every button here is radius/12 at a 56 floor, so the 44pt rule is met by
//     construction rather than by each screen remembering it.
//  2. The trust line belongs to the BAR (781:2287), not to the scroll body, where
//     it scrolls away from the button it reassures about.
//  3. The bar claims the bottom inset itself, which is why its screens pass
//     `claimsBottomInset={false}`. If both claimed it the padding doubles.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { screen, fireEvent } from "@testing-library/react-native";
import { renderWithSafeArea } from "@/test/safe-area";

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { Button } from "../Button";
import { Icon } from "../icons/Icon";
import { DockedActionBar } from "../DockedActionBar";

function code(): string {
  return readFileSync(join(__dirname, "..", "DockedActionBar.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** A button's resolved style, with the Pressable style callback run unpressed. */
function buttonStyle(name: string) {
  const style = screen.getByRole("button", { name }).props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style,
  ) as Record<string, unknown>;
}

const PRIMARY = { label: "Confirm Booking", onPress: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("DockedActionBar — Buttons=Single", () => {
  it("renders exactly one button and calls back", () => {
    const onPress = jest.fn();
    renderWithSafeArea(<DockedActionBar primary={{ label: "Book Now", onPress }} />);
    expect(screen.UNSAFE_getAllByType(Button)).toHaveLength(1);
    fireEvent.press(screen.getByRole("button", { name: "Book Now" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("forwards disabled, and the disabled button swallows the press", () => {
    const onPress = jest.fn();
    renderWithSafeArea(<DockedActionBar primary={{ label: "Book Now", onPress, disabled: true }} />);
    const button = screen.getByRole("button", { name: "Book Now" });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("forwards loading as busy, which is how 'Confirming…' is rendered", () => {
    renderWithSafeArea(
      <DockedActionBar primary={{ label: "Confirming…", onPress: jest.fn(), loading: true }} />,
    );
    const button = screen.getByRole("button", { name: "Confirming…" });
    expect(button.props.accessibilityState.busy).toBe(true);
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it("forwards a trailing icon", () => {
    renderWithSafeArea(
      <DockedActionBar
        primary={{ label: "Book Now", onPress: jest.fn(), trailingIcon: "chevron-right" }}
      />,
    );
    expect(
      screen.UNSAFE_getAllByType(Icon).some((n) => n.props.chrome === "chevron-right"),
    ).toBe(true);
  });
});

describe("DockedActionBar — Buttons=Pair", () => {
  it("renders secondary on the LEFT and primary on the right", () => {
    renderWithSafeArea(
      <DockedActionBar primary={PRIMARY} secondary={{ label: "Edit", onPress: jest.fn() }} />,
    );
    const labels = screen.UNSAFE_getAllByType(Button).map((n) => n.props.label);
    expect(labels).toEqual(["Edit", "Confirm Booking"]);
  });

  it("makes the secondary an outline and the primary filled", () => {
    renderWithSafeArea(
      <DockedActionBar primary={PRIMARY} secondary={{ label: "Edit", onPress: jest.fn() }} />,
    );
    const [secondary, primary] = screen.UNSAFE_getAllByType(Button);
    expect(secondary.props.variant).toBe("outline");
    expect(primary.props.variant).toBe("primary");
  });

  it("disables the secondary independently — the submitting state needs exactly this", () => {
    const onEdit = jest.fn();
    renderWithSafeArea(
      <DockedActionBar
        primary={{ label: "Confirming…", onPress: jest.fn(), loading: true }}
        secondary={{ label: "Edit", onPress: onEdit, disabled: true }}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("DockedActionBar — one geometry, not three", () => {
  it("gives every button the 56 floor", () => {
    renderWithSafeArea(
      <DockedActionBar primary={PRIMARY} secondary={{ label: "Edit", onPress: jest.fn() }} />,
    );
    expect(buttonStyle("Edit").minHeight).toBe(56);
    expect(buttonStyle("Confirm Booking").minHeight).toBe(56);
  });

  it("uses radius/12, never the pill the flow shipped on screen 1", () => {
    renderWithSafeArea(<DockedActionBar primary={PRIMARY} />);
    for (const button of screen.UNSAFE_getAllByType(Button)) {
      expect(button.props.pill).toBe(false);
      expect(button.props.size).toBe("docked");
    }
    expect(code()).not.toMatch(/borderRadius/);
  });

  it("clears the 44pt floor by construction — 56 is the smallest thing in the bar", () => {
    renderWithSafeArea(<DockedActionBar primary={PRIMARY} />);
    expect(buttonStyle("Confirm Booking").minHeight).toBeGreaterThanOrEqual(44);
  });
});

describe("DockedActionBar — the trust line belongs to the bar", () => {
  it("renders no footnote by default", () => {
    renderWithSafeArea(<DockedActionBar primary={PRIMARY} />);
    expect(screen.queryByText(/Secure/)).toBeNull();
  });

  it("renders the footnote with a lock glyph, inside the bar", () => {
    renderWithSafeArea(
      <DockedActionBar primary={PRIMARY} footnote={{ label: "Secure encrypted checkout" }} />,
    );
    expect(screen.getByText("Secure encrypted checkout")).toBeTruthy();
    const lock = screen.UNSAFE_getAllByType(Icon).find((n) => n.props.chrome === "lock");
    expect(lock?.props.size).toBe(14);
    // Decorative — the words beside it say the same thing.
    expect(lock?.props.label).toBeUndefined();
  });

  it("sets the footnote on the label-sm ramp, at the 12sp floor and not below", () => {
    const src = code();
    expect(src).toMatch(/font-label-sm text-label-sm text-on-surface-variant/);
    expect(src).not.toMatch(/text-\[\d+px\]/);
    expect(src).not.toMatch(/fontSize/);
  });
});

describe("DockedActionBar — the bottom inset", () => {
  it("claims the bottom edge itself, so its screen passes claimsBottomInset={false}", () => {
    renderWithSafeArea(<DockedActionBar primary={PRIMARY} />);
    expect(screen.UNSAFE_getAllByType(SafeAreaView)[0].props.edges).toEqual(["bottom"]);
  });

  it("puts the 20pt bottom padding on an INNER view, so the two add", () => {
    // SafeAreaView applies the inset to itself; a pb-5 on the same node would be
    // overwritten by it and the buttons would sit on the gesture bar.
    const src = code();
    expect(src).toMatch(/<SafeAreaView[\s\S]*?<View className="px-4 pb-5 pt-3">/);
  });
});

describe("DockedActionBar — treatment", () => {
  it("emits NO shadow — a bar is chrome on an edge, not a floating surface", () => {
    const src = code();
    expect(src).not.toMatch(/shadowColor|shadowOpacity|shadowRadius|shadowOffset/);
    expect(src).not.toMatch(/\belevation\b/);
    expect(src).not.toMatch(/useTokenShadow|tokenShadow/);
  });

  it("separates with a full-strength top hairline, the way a card does", () => {
    expect(code()).toMatch(/border-t border-outline-variant/);
  });

  it("contains no colour literal and imports no icon library", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black)\b/);
    expect(src).not.toMatch(/@expo\/vector-icons/);
  });
});
