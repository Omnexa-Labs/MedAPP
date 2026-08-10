// Locks KeyValueRow (Figma 756:4282 / 756:4356 / 756:4760).
//
// The two things worth asserting hardest:
//  - the trailing slot is badge XOR action, structurally (a union, not two
//    optional props), because no frame draws both and a row that carries both
//    collapses on a 393pt canvas;
//  - the action reaches the 44pt floor via hitSlop rather than by inflating the
//    row, which would break the card's 16pt row rhythm on three screens.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react-native";

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { KeyValueRow } from "../KeyValueRow";

function code(): string {
  return readFileSync(join(__dirname, "..", "KeyValueRow.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

describe("KeyValueRow — the fact", () => {
  it("renders label and value", () => {
    render(<KeyValueRow label="Date" value="Tuesday, 13 May 2025" />);
    expect(screen.getByText("Date")).toBeTruthy();
    expect(screen.getByText("Tuesday, 13 May 2025")).toBeTruthy();
  });

  it("renders a second value line when given one", () => {
    render(
      <KeyValueRow
        label="Date & Time"
        value="Tuesday, 13 May 2025"
        secondaryValue="10:00 – 10:45 AM · EDT · Boston"
      />,
    );
    expect(screen.getByText("10:00 – 10:45 AM · EDT · Boston")).toBeTruthy();
  });

  it("renders no second line when none is given", () => {
    render(<KeyValueRow label="Date" value="Tuesday, 13 May 2025" />);
    expect(screen.queryByText(/EDT/)).toBeNull();
  });

  it("announces the fact as ONE node, not two disconnected fragments", () => {
    render(<KeyValueRow label="Date" value="Tuesday, 13 May 2025" />);
    expect(screen.getByLabelText("Date, Tuesday, 13 May 2025")).toBeTruthy();
  });

  it("folds a badge into the announcement, so provenance is spoken too", () => {
    render(
      <KeyValueRow label="Duration" value="45 Minutes" badge={{ label: "From provider" }} />,
    );
    expect(screen.getByLabelText("Duration, 45 Minutes, From provider")).toBeTruthy();
  });
});

describe("KeyValueRow — trailing slot is badge XOR action", () => {
  it("renders the badge when given one", () => {
    render(
      <KeyValueRow label="Time" value="10:00 – 10:45 AM" badge={{ label: "EDT · Boston" }} />,
    );
    expect(screen.getByText("EDT · Boston")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the action as a button when given one", () => {
    const onPress = jest.fn();
    render(
      <KeyValueRow
        label="MedApp Cardiology Center"
        value="1 Seaport Blvd, Boston, MA 02210"
        action={{ label: "Directions", onPress }}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Directions" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders neither by default", () => {
    render(<KeyValueRow label="Consultation type" value="Follow-up Visit" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("makes badge+action a TYPE error rather than a layout bug found on device", () => {
    // The rule is enforced by the discriminated union in the props type; this
    // asserts the union still exists, since deleting it would silently re-admit
    // the combination that no frame draws.
    expect(code()).toMatch(/action\?:\s*never/);
    expect(code()).toMatch(/badge\?:\s*never/);
  });
});

describe("KeyValueRow — the action reaches 44pt without a 44pt row", () => {
  it("carries a hitSlop that clears the floor on both axes", () => {
    render(
      <KeyValueRow label="Reference" value="MED-9F2K-4471" action={{ label: "Copy", onPress: () => {} }} />,
    );
    // ~20pt of label + 12 top + 12 bottom clears 44 vertically; 8 each side
    // clears it horizontally on a label this short.
    expect(screen.getByRole("button", { name: "Copy" }).props.hitSlop).toEqual({
      top: 12,
      bottom: 12,
      left: 8,
      right: 8,
    });
  });

  it("does not inflate the row to get there", () => {
    // A 44 minHeight here would break the 16pt row rhythm inside the cards.
    expect(code()).not.toMatch(/minHeight/);
  });

  it("reports disabled and swallows the press", () => {
    const onPress = jest.fn();
    render(
      <KeyValueRow
        label="Reference"
        value="MED-9F2K-4471"
        action={{ label: "Copy", onPress, disabled: true }}
      />,
    );
    const action = screen.getByRole("button", { name: "Copy" });
    expect(action.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(action);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("KeyValueRow — treatment", () => {
  it("contains no colour literal", () => {
    const src = code();
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\s*\(/);
    expect(src).not.toMatch(/\b(white|black)\b/);
  });

  it("sets label and value on the ramp, nothing under 12sp", () => {
    const src = code();
    expect(src).toMatch(/font-label-md text-label-md text-on-surface\b/);
    expect(src).toMatch(/font-label-sm text-label-sm text-on-surface-variant/);
    expect(src).not.toMatch(/text-\[\d+px\]/);
    expect(src).not.toMatch(/fontSize/);
  });

  it("aligns to the FIRST line, so a two-line value does not drift the trailing slot", () => {
    expect(code()).toMatch(/items-start/);
    expect(code()).not.toMatch(/items-center/);
  });

  it("exposes no className or style escape hatch", () => {
    const src = code();
    expect(src).not.toMatch(/className\?:/);
    expect(src).not.toMatch(/style\?:/);
  });
});
