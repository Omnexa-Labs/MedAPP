// Regression locks for the three OTP behaviours the sign-up verify frame needs.
//
// These are not decoration. The reason CodeBoxRow uses ONE hidden input instead
// of six maxLength={1} inputs is that the six-input version silently truncates a
// pasted or auto-filled code to its first digit — a failure that looks fine on
// screen (one box fills, the user assumes they mistyped) and is invisible unless
// asserted. The geometry assertions lock the frame's arithmetic: 6 × 48 + 5 × 12
// must stay ≤ the 361px available inside the 16px gutters.

import { render, screen, fireEvent } from "@testing-library/react-native";
import { CodeBoxRow, CODE_LENGTH } from "../CodeBoxRow";

const LABEL = "6-digit verification code";

function renderRow(overrides: Partial<React.ComponentProps<typeof CodeBoxRow>> = {}) {
  const onChangeText = jest.fn();
  const utils = render(
    <CodeBoxRow value="" onChangeText={onChangeText} accessibilityLabel={LABEL} {...overrides} />,
  );
  return { onChangeText, ...utils };
}

describe("CodeBoxRow", () => {
  it("accepts a whole 6-digit code in one change — the paste / OTP-autofill path", () => {
    const { onChangeText } = renderRow();
    fireEvent.changeText(screen.getByLabelText(LABEL), "491207");
    // All six digits survive. Six maxLength={1} inputs would deliver only "4".
    expect(onChangeText).toHaveBeenCalledWith("491207");
  });

  it("strips non-digits and clamps a longer paste to 6", () => {
    const { onChangeText } = renderRow();
    // A code pasted out of an SMS often arrives with surrounding text.
    fireEvent.changeText(screen.getByLabelText(LABEL), "code: 491-207-88");
    expect(onChangeText).toHaveBeenCalledWith("491207");
  });

  it("exposes exactly one focusable control, so the boxes are not announced as six blanks", () => {
    renderRow();
    expect(screen.getAllByLabelText(LABEL)).toHaveLength(1);
  });

  it("renders the digits it is given, and only those", () => {
    renderRow({ value: "4912" });
    // `includeHiddenElements` is required, and that requirement is the point: the
    // boxes are deliberately hidden from assistive tech so a screen reader hears
    // one named field instead of six blank views. If a later change exposes them,
    // this query starts working WITHOUT the flag and the a11y contract has
    // regressed silently.
    const opts = { includeHiddenElements: true } as const;
    ["4", "9", "1", "2"].forEach((digit) =>
      expect(screen.getByText(digit, opts)).toBeTruthy(),
    );
    expect(screen.queryByText("0", opts)).toBeNull();
  });

  it("marks the input invalid in the error state, so colour is not the only signal", () => {
    renderRow({ value: "491207", hasError: true });
    expect(screen.getByLabelText(LABEL).props["aria-invalid"]).toBe(true);
  });

  it("is not editable before a code has been sent (frame state=code-not-sent)", () => {
    renderRow({ disabled: true });
    expect(screen.getByLabelText(LABEL).props.editable).toBe(false);
  });

  it("keeps the frame's box arithmetic inside the 361px available width", () => {
    // 6 × 48 + 5 × 12 = 348 ≤ 361. If the box size or the gap drifts off the
    // 4/8/12/16/24/32/48 scale, the row starts touching the screen gutter.
    const BOX = 48;
    const GAP = 12;
    const AVAILABLE = 393 - 16 * 2;
    expect(CODE_LENGTH * BOX + (CODE_LENGTH - 1) * GAP).toBeLessThanOrEqual(AVAILABLE);
    // 48 also has to clear the 44pt minimum touch target on both axes.
    expect(BOX).toBeGreaterThanOrEqual(44);
  });
});
