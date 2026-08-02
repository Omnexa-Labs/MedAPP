// Guards the two defects the product owner reported on the consent row, plus the
// geometry that makes the alignment work. These are regression locks, not
// decoration: both defects are invisible in a unit test unless the numbers are
// asserted, and both were shipped once already.

import { render, screen, userEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { ConsentRow } from "../ConsentRow";

const LABEL = "I agree to the Terms of Service";

describe("ConsentRow", () => {
  it("exposes one checkbox with the caller's programmatic name and state", () => {
    render(
      <ConsentRow checked={false} onChange={() => {}} accessibilityLabel={LABEL}>
        {LABEL}
      </ConsentRow>,
    );
    const box = screen.getByRole("checkbox", { name: LABEL });
    expect(box.props.accessibilityState.checked).toBe(false);
  });

  it("toggles from its current value rather than always setting true", async () => {
    const onChange = jest.fn();
    render(
      <ConsentRow checked onChange={onChange} accessibilityLabel={LABEL}>
        {LABEL}
      </ConsentRow>,
    );
    await userEvent.press(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("aligns the checkbox to the label's FIRST line, not the block's centre", () => {
    // The alignment relies on exactly two numbers being equal: the checkbox
    // height and the label's line height. If either drifts, a two-line consent
    // label puts the box back in the gap between the lines — the reported bug.
    render(
      <ConsentRow checked={false} onChange={() => {}} accessibilityLabel={LABEL}>
        {LABEL}
      </ConsentRow>,
    );
    const box = screen.getByRole("checkbox");
    const label = screen.getByText(LABEL);

    const boxStyle = Array.isArray(box.props.style)
      ? Object.assign({}, ...box.props.style.flat())
      : box.props.style;
    const labelStyle = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.flat())
      : label.props.style;

    expect(boxStyle.height).toBe(20);
    expect(boxStyle.width).toBe(20);
    expect(labelStyle.lineHeight).toBe(20);
    expect(labelStyle.lineHeight).toBe(boxStyle.height);
  });

  it("reaches a 44x44 touch target via hitSlop, so the 20px box can stay 20px", () => {
    // A 44px View would re-break the first-line alignment; hitSlop must be the
    // mechanism. 20 + 12 + 12 = 44.
    render(
      <ConsentRow checked={false} onChange={() => {}} accessibilityLabel={LABEL}>
        {LABEL}
      </ConsentRow>,
    );
    expect(screen.getByRole("checkbox").props.hitSlop).toBe(12);
  });

  it("accepts a rich label with inline links without swallowing their taps", async () => {
    // The sign-up consent sentence navigates from two nested links, which is why
    // `labelPressable` defaults to false.
    const onChange = jest.fn();
    const onLink = jest.fn();
    render(
      <ConsentRow checked={false} onChange={onChange} accessibilityLabel={LABEL}>
        <Text>
          I agree to the{" "}
          <Text accessibilityRole="link" onPress={onLink}>
            Terms of Service
          </Text>
        </Text>
      </ConsentRow>,
    );
    await userEvent.press(screen.getByText("Terms of Service"));
    expect(onLink).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("toggles from the label too when the row opts in", async () => {
    const onChange = jest.fn();
    render(
      <ConsentRow
        checked={false}
        onChange={onChange}
        accessibilityLabel="Remember me"
        labelPressable
      >
        Remember me
      </ConsentRow>,
    );
    await userEvent.press(screen.getByText("Remember me"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders a validation message when given one", () => {
    render(
      <ConsentRow
        checked={false}
        onChange={() => {}}
        accessibilityLabel={LABEL}
        error="You must accept the Terms to continue"
      >
        {LABEL}
      </ConsentRow>,
    );
    expect(screen.getByText("You must accept the Terms to continue")).toBeTruthy();
  });
});
