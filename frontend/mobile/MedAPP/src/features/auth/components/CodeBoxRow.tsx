// CodeBoxRow — the approved Figma "Code Input Row (6 digits)" (447:1245) built
// from the "CodeBox" component set (file kRifcg1KCEAlTXy4aimotK, node 444:1431).
//
// Arithmetic from the frame, which is why the row can't be a 6-way flex:
//   393 frame − 16 gutter × 2               = 361 available
//   6 × 48 box + 5 × 12 gap                 = 348  ≤ 361
// The 13px residual is optical slack, NOT a spacing value — so the row is a HUG
// auto-layout centred inside a FILL wrapper (`items-center` on the parent), and
// each box keeps its literal 48 × 48. Stretching the boxes to fill 361 would put
// them off the 4/8/12/16/24/32/48 scale and drop the designed gap.
//
// 48 ≥ the 44pt minimum target on both axes. 48 > 24, so radius is `radius/12`
// (`rounded-md`), not `radius/4` — see docs/BRAND.md's note on why `radius/4`
// exists only for ≤24px controls.
//
// The five states, straight off the component set:
//
//   State      node       fill                     stroke                    digit
//   Empty      444:1423   field-surface            1px outline-variant       —
//   Inactive   444:1424   surface-container-low     1px outline-variant       —
//   Focused    444:1425   field-surface            2px primary  + Caret      —
//   Filled     444:1427   field-surface            1px outline (FULL)        Manrope SemiBold 20 / on-surface
//   Error      444:1429   error-container          1px error                 Manrope SemiBold 20 / on-error-container
//
// Note `Filled` steps its hairline up from `outline-variant` to the stronger
// `outline` — that is the frame's value, not a transcription slip.
//
// ── Why ONE hidden input rather than six ─────────────────────────────────────
// The boxes are plain Views. A single transparent TextInput is stretched over
// the whole row with maxLength={6}. That is what makes the three required
// behaviours work at all on React Native:
//
//   - PASTE / OTP AUTOFILL — `textContentType="oneTimeCode"` and
//     `autoComplete="one-time-code"` deliver all six digits in one `onChangeText`.
//     Six maxLength={1} inputs receive only the first character (the platform
//     respects maxLength before the handler sees the rest), which is the usual
//     way a "paste your code" flow silently breaks.
//   - AUTO-ADVANCE — the focused box is derived (`code.length`), so advancing is
//     structural. There is no imperative `ref.focus()` chain to fall out of sync.
//   - BACKSPACE-TO-PREVIOUS — deleting a character shortens `code`, which moves
//     the derived focus back a box. No `onKeyPress` interception, and it behaves
//     correctly for a multi-character delete or a select-all clear too.
//
// The platform caret is hidden (`caretHidden`) and the frame's own Caret
// (444:1426 — a 2 × 20 `primary` bar) is drawn inside the focused box instead.
//
// ACCESSIBILITY: the boxes are decorative — they carry no text of their own in
// the empty state and would otherwise be announced as six blank elements. They
// are hidden from assistive tech and the hidden TextInput is the single focusable
// control, named and hinted by the caller.
//
// Only sign-up verify uses this, so it stays out of components/ui per the house
// rule in components/ui/README.md (extract at two call sites).

import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export const CODE_LENGTH = 6;

/** 48 × 48 per the component set. Kept as a constant so the box and the row's
 *  arithmetic can never drift apart. */
const BOX_SIZE = 48;

type BoxState = "empty" | "inactive" | "focused" | "filled" | "error";

/** Container classes per state. Border WIDTH is the only thing that can't be a
 *  class here, because `border-2` vs `border` must swap together with the colour. */
const BOX_CLASS: Record<BoxState, string> = {
  empty: "border border-outline-variant bg-field-surface",
  inactive: "border border-outline-variant bg-surface-container-low",
  focused: "border-2 border-primary bg-field-surface",
  filled: "border border-outline bg-field-surface",
  error: "border border-error bg-error-container",
};

interface Props {
  /** 0–6 digits. The caller owns the value; this component is presentational. */
  value: string;
  onChangeText: (next: string) => void;
  /**
   * The frame's `state=code-not-sent` (447:1407) draws all six boxes Inactive
   * and accepts no input, because there is nothing to type yet.
   */
  disabled?: boolean;
  /** The frame's `state=invalid-code` (447:1483): all six boxes go Error. */
  hasError?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export function CodeBoxRow({
  value,
  onChangeText,
  disabled = false,
  hasError = false,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const [focused, setFocused] = useState(false);

  const stateFor = (index: number): BoxState => {
    if (hasError) return "error";
    // Filled is checked BEFORE disabled on purpose: the frame's `state=verifying`
    // (447:1555) draws six FILLED boxes while the mutation is in flight, and the
    // caller disables input during that window. Testing `disabled` first would
    // blank all six digits the moment the user submitted.
    if (index < value.length) return "filled";
    if (disabled) return "inactive";
    // Only the next empty box is Focused, and only while the input has focus —
    // the canonical frame (447:455) draws box 1 Focused with boxes 2-6 Empty.
    if (focused && index === value.length) return "focused";
    return "empty";
  };

  return (
    // Code Row Wrapper (447:1244) — FILL and centring; the row itself HUGs.
    <View className="w-full items-center">
      <View className="flex-row items-center gap-3">
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const state = stateFor(index);
          const digit = value[index];
          return (
            <View
              key={index}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className={`items-center justify-center rounded-md ${BOX_CLASS[state]}`}
              style={{ width: BOX_SIZE, height: BOX_SIZE }}
            >
              {digit ? (
                <Text
                  className={`font-headline-md text-headline-md ${
                    state === "error" ? "text-on-error-container" : "text-on-surface"
                  }`}
                >
                  {digit}
                </Text>
              ) : state === "focused" ? (
                // Caret (444:1426) — 2 × 20, `primary`.
                <View className="h-5 w-0.5 bg-primary" />
              ) : null}
            </View>
          );
        })}

        {/* The real control. Transparent and stretched over the row so a tap
            anywhere on the boxes focuses it. */}
        <TextInput
          value={value}
          onChangeText={(next) => onChangeText(next.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          caretHidden
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          aria-invalid={hasError}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // Not `transparent`: on Android a fully transparent colour can still
            // paint a selection highlight. An opacity of 0 hides the glyphs while
            // leaving the input hit-testable.
            opacity: 0,
            textAlign: "center",
            fontSize: 20,
          }}
        />
      </View>
    </View>
  );
}
