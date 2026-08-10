import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { Button } from "../Button";

/** The button's style, with the Pressable style callback resolved unpressed. */
function buttonStyle(name: string) {
  const style = screen.getByRole("button", { name }).props.style;
  return StyleSheet.flatten(
    typeof style === "function" ? style({ pressed: false }) : style,
  ) as Record<string, unknown>;
}

describe("Button", () => {
  it("renders its label", () => {
    render(<Button label="Save" />);
    expect(screen.getByText("Save")).toBeTruthy();
  });
});

// `docked` is the size the booking frames draw for every button (781:2281,
// 781:2283, 756:4765, 756:4813, 756:4742). It exists because those frames had no
// legal size — the three existing sizes top out at 48 — and each screen therefore
// invented its own: `borderRadius: 999`, `borderRadius: 12` at ~48, and
// `borderRadius: 16` at 56, for one control in one flow.
describe("Button — size=docked", () => {
  it("is 56 tall", () => {
    render(<Button label="Confirm Booking" size="docked" />);
    expect(buttonStyle("Confirm Booking").minHeight).toBe(56);
  });

  it("is a FLOOR, not a fixed height, so a large font scale can grow it", () => {
    // A fixed `height: 56` is what the screens hardcoded, and it is what clips.
    render(<Button label="Confirm Booking" size="docked" />);
    expect(buttonStyle("Confirm Booking").height).toBeUndefined();
  });

  it("clears the 44pt floor by construction", () => {
    render(<Button label="Confirm Booking" size="docked" />);
    expect(buttonStyle("Confirm Booking").minHeight as number).toBeGreaterThanOrEqual(44);
  });

  it("leaves `cta` alone — its auth/splash frames still draw 48", () => {
    render(<Button label="Get Started" size="cta" />);
    expect(buttonStyle("Get Started").minHeight).toBeUndefined();
  });

  it("adds no minHeight to `lg`, the default", () => {
    render(<Button label="Sign in" />);
    expect(buttonStyle("Sign in").minHeight).toBeUndefined();
  });
});
