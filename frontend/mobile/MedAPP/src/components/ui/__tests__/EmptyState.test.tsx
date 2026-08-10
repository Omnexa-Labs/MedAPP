// Locks EmptyState (Figma 517:1773) — both containers, both Action states.
//
// The load-bearing assertions: the plate glyph takes the plate's OWN on- pair in
// both modes (a glyph left on `on-primary` is white on a pale tint, i.e. gone),
// the type comes from the ramp per container, and Action=No is the ABSENCE of
// `action` rather than a boolean that can draw a button with no handler.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { tokenColor } from "@/lib/tokens";

const mockScheme = { value: "light" as "light" | "dark" };
jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: mockScheme.value, setColorScheme: jest.fn() }),
}));

import { EmptyState } from "../EmptyState";
import { Icon } from "../icons/Icon";

function code(): string {
  return ["EmptyState.tsx", "StatePanelShell.tsx"]
    .map((f) => readFileSync(join(__dirname, "..", f), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

const glyph = () => screen.UNSAFE_getAllByType(Icon)[0].props as Record<string, unknown>;

beforeEach(() => {
  mockScheme.value = "light";
});

describe("EmptyState — anatomy", () => {
  it("renders plate, title and body, and defaults to the frame's search-off", () => {
    render(<EmptyState title="Nothing here yet" body="When there is something to show, it will appear here." />);
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByText("When there is something to show, it will appear here.")).toBeTruthy();
    expect(glyph().chrome).toBe("search-off");
  });

  it("gives the title the header role, so the state is never colour alone", () => {
    render(<EmptyState title="No matches" />);
    expect(screen.getByRole("header", { name: "No matches" })).toBeTruthy();
  });

  it("omits the body when there is none — the frame's showSupportingText=false", () => {
    const { rerender } = render(<EmptyState title="No matches" />);
    const titleOnly = screen.root.findAllByType(Text).length;
    rerender(<EmptyState title="No matches" body="Try a different filter." />);
    expect(screen.getByText("Try a different filter.")).toBeTruthy();
    // Exactly one more Text node, so the slot is absent rather than empty — an
    // empty <Text> still occupies its line box and shifts the action down.
    expect(screen.root.findAllByType(Text).length).toBe(titleOnly + 1);
  });

  it("takes a clinical glyph as well as chrome — LabResults needs lab-sample", () => {
    render(<EmptyState title="No lab results yet" icon="lab-sample" />);
    expect(glyph().name).toBe("lab-sample");
    expect(glyph().chrome).toBeUndefined();
  });
});

describe("EmptyState — the plate pair cannot drift", () => {
  it("paints the glyph with on-surface-variant, the primary-tint plate's own pair", () => {
    render(<EmptyState title="Nothing here yet" />);
    expect(glyph().color).toBe(tokenColor("on-surface-variant", "light"));
  });

  it("re-resolves per mode rather than freezing a light-mode value", () => {
    mockScheme.value = "dark";
    render(<EmptyState title="Nothing here yet" />);
    expect(glyph().color).toBe(tokenColor("on-surface-variant", "dark"));
    expect(glyph().color).not.toBe(tokenColor("on-surface-variant", "light"));
  });

  it("binds each plate fill to its glyph token in one place", () => {
    const src = code();
    expect(src).toMatch(/empty:\s*\{\s*fill:\s*"bg-primary-tint",\s*glyph:\s*"on-surface-variant"\s*\}/);
    // Never an interpolated class: Tailwind scans source text, so `bg-${token}`
    // is dropped silently and the plate renders with no fill at all.
    expect(src).not.toMatch(/bg-\$\{/);
  });
});

describe("EmptyState — Container=Card | Inline", () => {
  it("defaults to Card: the panel IS the surface", () => {
    render(<EmptyState title="Nothing here yet" testID="es" />);
    expect(screen.getByTestId("es")).toBeTruthy();
    expect(code()).toMatch(/container = "card"/);
  });

  it("renders Inline without a card shell, so a section never nests a card", () => {
    render(<EmptyState container="inline" title="Nothing here yet" testID="es" />);
    expect(screen.getByTestId("es")).toBeTruthy();
    const src = code();
    // Inline is a plain View at radius/12 and 16 inset — no Card, no hairline.
    expect(src).toMatch(/items-center gap-3 rounded-md p-4/);
  });

  it("takes type from the ramp per container — Card 20/16, Inline 16/12", () => {
    const src = code();
    expect(src).toMatch(
      /card:\s*\{\s*title:\s*"font-headline-md text-headline-md text-on-surface",\s*body:\s*"font-body-md text-body-md text-on-surface-variant",/,
    );
    expect(src).toMatch(
      /inline:\s*\{\s*title:\s*"font-body-md text-body-md text-on-surface",\s*body:\s*"font-label-sm text-label-sm text-on-surface-variant",/,
    );
    // Three of the copies hardcoded `fontSize: 18`, a step the ramp has no entry
    // for. Nothing here may set a font size in px.
    expect(src).not.toMatch(/fontSize:/);
  });

  it("sizes the plate 56 in Card and 48 in Inline, with a 24 glyph in both", () => {
    expect(code()).toMatch(/PLATE = \{ card: 56, inline: 48 \}/);
    render(<EmptyState container="inline" title="x" />);
    expect(glyph().size).toBe(24);
  });
});

describe("EmptyState — Action=Yes | No", () => {
  it("draws the action and fires it", () => {
    const onPress = jest.fn();
    render(<EmptyState title="No upcoming appointments" action={{ label: "Find a clinician", onPress }} />);
    fireEvent.press(screen.getByRole("button", { name: "Find a clinician" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("draws no action at all when there is none to draw", () => {
    render(<EmptyState title="No active medications" body="Nothing to show." />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("has no boolean that could draw a button with no handler", () => {
    const src = code();
    expect(src).not.toMatch(/action\??: boolean/);
    expect(src).not.toMatch(/showAction/);
    // `onPress` is required inside the action object, so `action` cannot be
    // supplied as a label alone.
    expect(src).toMatch(/label: string;\s*onPress: \(\) => void;/);
  });

  it("carries the frame's trailing arrow by default", () => {
    render(<EmptyState title="x" action={{ label: "Get started", onPress: jest.fn() }} />);
    const icons = screen.UNSAFE_getAllByType(Icon);
    expect(icons.map((i) => i.props.chrome)).toContain("arrow-forward");
  });

  it("lets a caller drop the arrow when the action does not go anywhere", () => {
    render(
      <EmptyState title="x" action={{ label: "Clear filters", onPress: jest.fn(), trailingIcon: undefined }} />,
    );
    const icons = screen.UNSAFE_getAllByType(Icon);
    expect(icons.map((i) => i.props.chrome)).not.toContain("arrow-forward");
  });

  it("uses the shared Button at the 56 docked height, not a bare text link", () => {
    const src = code();
    expect(src).toMatch(/size="docked"/);
    expect(src).toMatch(/variant=\{container === "card" \? "primary" : "outline"\}/);
    expect(src).not.toMatch(/<Pressable/);
  });

  it("labels the action for assistive tech, defaulting to its own label", () => {
    render(
      <EmptyState
        title="x"
        action={{ label: "Clear filters", accessibilityLabel: "Clear all filters", onPress: jest.fn() }}
      />,
    );
    expect(screen.getByLabelText("Clear all filters")).toBeTruthy();
  });
});
