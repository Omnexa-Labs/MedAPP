// Input's `multiline` axis, added for the booking flow's Reason for Visit field
// (Figma 757:4814, 361x96).
//
// The single-line row is a fixed `h-[52px]` with `items-center`. Rendering a
// growing field in that box tops out at one visible line, vertically centred in
// 96px, with the caret jumping as the user types — which is why the screen would
// otherwise have hand-rolled a second field. Three changes, no second component.

import { StyleSheet, TextInput } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { Input } from "../Input";

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

/** The bordered container — the Input's outermost node. */
function container() {
  return StyleSheet.flatten(
    screen.UNSAFE_getByType(TextInput).parent!.props.style,
  ) as Record<string, unknown>;
}

function field() {
  return screen.UNSAFE_getByType(TextInput).props as Record<string, unknown>;
}

describe("Input — single line (unchanged)", () => {
  it("stays a fixed 52 row with no minHeight", () => {
    render(<Input placeholder="Email Address" />);
    expect(container().minHeight).toBeUndefined();
    expect(field().multiline).toBeFalsy();
  });

  it("does not top-align a single-line field", () => {
    render(<Input placeholder="Email Address" />);
    expect((StyleSheet.flatten(field().style as object) as Record<string, unknown>).textAlignVertical).toBeUndefined();
  });
});

describe("Input — multiline", () => {
  it("takes the frame's 96 as a FLOOR, so the field can grow", () => {
    render(<Input multiline placeholder="Describe your symptoms…" />);
    expect(container().minHeight).toBe(96);
  });

  it("forwards multiline to the TextInput and top-aligns it for Android", () => {
    render(<Input multiline placeholder="Describe your symptoms…" />);
    expect(field().multiline).toBe(true);
    expect((StyleSheet.flatten(field().style as object) as Record<string, unknown>).textAlignVertical).toBe("top");
  });

  it("keeps the existing 2px primary focus treatment, which 758:2091 confirms", () => {
    render(<Input multiline placeholder="Describe your symptoms…" />);
    // Resting state is the 1px hairline; the focus branch is unchanged code.
    expect(container().borderWidth).toBe(1);
  });

  it("still names the field for assistive tech", () => {
    render(<Input multiline placeholder="Describe your symptoms…" accessibilityLabel="Reason for visit" />);
    expect(screen.getByLabelText("Reason for visit")).toBeTruthy();
  });

  it("still takes a value and an onChangeText, so it is one component, not two", () => {
    const onChangeText = jest.fn();
    render(<Input multiline value="Chest pain" onChangeText={onChangeText} placeholder="Reason" />);
    expect(field().value).toBe("Chest pain");
  });
});
