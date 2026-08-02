// Shared chrome for the three sign-up STEP screens.
//
// Everything here had 2+ identical copies across SignUpStep1/2/3Screen, which is
// the extraction threshold in src/components/ui/README.md. It is NOT in
// components/ui: none of it is a presentation primitive: `SignupStepLabels`
// knows the wizard's step count and titles, and `FieldError` renders a
// validation state that the approved frames don't define (see each screen's
// FLAGGED list). Both are sign-up-flow specific.

import { Text, View } from "react-native";
import { STEP_COUNT } from "./SignupAppBar";

/**
 * The frames' card inset — 16px on every card in the sign-up flow (nodes
 * 301:627, 326:694, 327:209, 338:803, 338:852).
 *
 * Passed to <Card> as an inline STYLE rather than a `p-4` className override on
 * purpose: `<Card>` names `p-md` (24px) itself and src/lib/cn.ts has no
 * tailwind-merge, so two competing padding utilities in one className are
 * explicitly documented as unreliable there. An inline style always wins over a
 * NativeWind class, so this is the only deterministic way to restate the inset.
 * It's geometry, not colour, so no token is being bypassed.
 */
export const FRAME_CARD_INSET = { padding: 16 } as const;

/**
 * Stepper caption row — "Step N of 3" in `primary` on the left, the step's own
 * title in `on-surface-variant` on the right, both `label-sm`.
 *
 * Nodes 301:621 (step 1) and 326:221 (step 2). Step 3 (node 338:328) shipped
 * WITHOUT this row while the progress bar above it sat at a solid 100%, so that
 * screen alone gave no readout of where the user was in the wizard — the bar
 * looked like a finished loading indicator. All three steps now render it, which
 * is also why it lives here rather than inline in two of them.
 *
 * The bar itself already carries the machine-readable position
 * (`accessibilityRole="progressbar"` on <SignupAppBar>), so this row is the
 * VISIBLE counterpart and is left as plain text — announcing it a second time
 * would make a screen reader read the position twice.
 */
export function SignupStepLabels({ step, title }: { step: 1 | 2 | 3; title: string }) {
  return (
    <View className="w-full flex-row items-center justify-between">
      <Text className="font-label-sm text-label-sm text-primary">
        Step {step} of {STEP_COUNT}
      </Text>
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{title}</Text>
    </View>
  );
}

/**
 * Field validation message. None of the approved frames define an error state
 * (FLAGGED on all three screens), but validation messages are required
 * behaviour, so they render on the `error` token under the group they belong to.
 *
 * `accessibilityLiveRegion` is what makes a message that appears AFTER submit
 * reach a screen reader at all — RN has no <label for>/aria-describedby link
 * between this <Text> and its sibling field.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text className="font-label-sm text-label-sm text-error" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
