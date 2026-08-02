// ConsentRow — a checkbox + wrapping label, on ONE consistent treatment.
//
// This is the fix for "the fontsize of the texts should be inline with the check
// box". Two separate defects were stacked in the hand-rolled rows the auth
// screens each built for themselves:
//
//  1. VERTICAL ALIGNMENT. The row was `items-center` around a 44x44 checkbox
//     target and a two-line sentence. `items-center` centres the 44px target
//     against the FULL height of the wrapped text block, so on a two-line label
//     the box floated in the gap BETWEEN the two lines — it read as belonging to
//     neither. A checkbox must align to the FIRST LINE of its label.
//  2. TYPE RAMP. Sign-up's consent label was `body-md` (16px Inter Regular)
//     while every other label in the same card — including sign-in's "Remember
//     me" row, which is the same control — was `label-md` (14px Inter SemiBold).
//     Same component, two sizes, two weights.
//
// HOW THE ALIGNMENT IS ACHIEVED (this is the load-bearing part — don't "tidy"
// it): the checkbox is physically 20x20 and the label's line height is pinned to
// 20, so with `items-start` the box and the first line box are the same height
// and their centres coincide EXACTLY, with zero magic offsets. The ≥44x44 touch
// target then comes from `hitSlop`, not from a 44px View — a 44px View would
// reintroduce defect 1, and the usual "fix" for that (a negative margin of
// -(44-20)/2) silently shifts every following row.
//
// So: CHECKBOX_SIZE must stay equal to LABEL_LINE_HEIGHT. If the designer moves
// the consent label to a different ramp, change both together.
//
// Geometry per the approved Figma Login/Sign-up frames and docs/BRAND.md:
//   checkbox   20x20, radius 4 (`rounded-xs`), 1.5px `outline-variant` hairline
//   target     44x44 (20px box + 12px hitSlop on all four sides)
//   gap        12 (`gap-sm` — the BRAND spacing step, not the old 8px `gap-base`)
//   label      `label-md` (14px Inter SemiBold) at 20px leading, on
//              `on-surface-variant`
//   checked    `primary` fill + `primary` border + a 16px `on-primary` check
//   unchecked  `field-surface` fill + `outline-variant` border — the same
//              recessed-well role <Input> uses, which is what the Figma
//              ConsentRow (434:1161, states 434:490 / 434:1156) binds the
//              unchecked box to (`var(--color-field-surface)`)
//
// NOTE ON radius/4: docs/BRAND.md's radius scale is 12 / 24 / full, but it also
// carves out 4 for "small square controls ≤24px — checkbox, radio-sized boxes",
// which is exactly this. `rounded-xs` is the named token for it; never the
// legacy `rounded` DEFAULT.

import { Pressable, Text, View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { useTokenColor } from "@/lib/tokens";
import { Icon } from "./icons/Icon";

/**
 * These two MUST stay equal — see the alignment note above. 20 is both the
 * Figma checkbox size and a comfortable leading for 14px label text.
 */
const CHECKBOX_SIZE = 20;
const LABEL_LINE_HEIGHT = 20;

/** 20 + 12 + 12 = 44 on every edge: the minimum touch target, via hitSlop. */
const HIT_SLOP = 12;

/** The Figma checkbox hairline. Off the 1px/2px border scale on purpose. */
const CHECKBOX_BORDER = 1.5;

/**
 * 16px check glyph: docs/BRAND.md's icon sizes are 24 / 20 / 16, and 16 is the
 * only one that fits inside a 20px box with a 1.5px border.
 */
const CHECK_SIZE = 16;

interface Props extends Omit<ViewProps, "children"> {
  checked: boolean;
  onChange: (next: boolean) => void;
  /**
   * The programmatic name for the checkbox. REQUIRED, and not derived from
   * `children`, because the label is frequently rich content (inline Terms /
   * Privacy links) that a screen reader would otherwise announce as fragments.
   */
  accessibilityLabel: string;
  /**
   * Label content. A plain string gets the ramp automatically; pass a <Text>
   * tree when the sentence contains inline links, and put the link styling on
   * the nested <Text> (it inherits size and leading from the wrapper).
   */
  children: React.ReactNode;
  /** Validation message, rendered under the row on the `label-sm` error ramp. */
  error?: string;
  /**
   * Extend the press target to the whole row, not just the checkbox.
   *
   * Defaults to FALSE, and deliberately: the sign-up consent label contains two
   * navigating links, and a row-level Pressable there makes "did that tap toggle
   * consent or open the Terms?" ambiguous. Opt in only for labels that are inert
   * text (e.g. sign-in's "Remember me").
   */
  labelPressable?: boolean;
  className?: string;
}

export function ConsentRow({
  checked,
  onChange,
  accessibilityLabel,
  children,
  error,
  labelPressable = false,
  className,
  testID,
  ...rest
}: Props) {
  const onPrimary = useTokenColor("on-primary");
  const toggle = () => onChange(!checked);

  // The visual box, shared by both press modes so the geometry can't diverge.
  const boxStyling = {
    className: cn(
      "items-center justify-center rounded-xs",
      // Unchecked is FILLED, with the `field-surface` role — per Figma
      // 434:1161. `field-surface` is a token that steps the right way in both
      // modes (a teal-tinted well in light, a recessed step in dark), so this
      // is not the "raw white/black fill" BRAND prohibits; an unfilled box
      // inside an already-filled card just reads as a stray outline.
      checked ? "border-primary bg-primary" : "border-outline-variant bg-field-surface",
    ),
    style: { width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, borderWidth: CHECKBOX_BORDER },
  };
  const check = checked ? <Icon chrome="check" size={CHECK_SIZE} color={onPrimary} /> : null;

  /**
   * The checkbox's a11y identity. It lives on whichever element is the press
   * target, so the row is ALWAYS exactly one announced control — never a
   * checkbox plus a second unnamed button wrapping the same words.
   */
  const a11y = {
    accessibilityRole: "checkbox" as const,
    accessibilityLabel,
    accessibilityState: { checked },
  };
  // 44x44 effective target without inflating the laid-out box — the box has to
  // stay 20px tall for the first-line alignment to hold.
  const target = { onPress: toggle, hitSlop: HIT_SLOP, testID, ...a11y };

  const label = (
    <Text
      className="flex-1 font-label-md text-label-md text-on-surface-variant"
      // Inline, not `leading-[20px]`: src/lib/cn.ts has no tailwind-merge, so a
      // leading utility competing with `text-label-md`'s own line height is not
      // reliably resolved. This value is load-bearing for the alignment.
      style={{ lineHeight: LABEL_LINE_HEIGHT }}
    >
      {children}
    </Text>
  );

  // items-start, NOT items-center — this is the whole point (defect 1).
  const ROW = "w-full flex-row items-start gap-sm";

  return (
    <View className={cn("w-full gap-base", className)} {...rest}>
      {labelPressable ? (
        // Whole row is the target: the ROW carries the press handler and the
        // checkbox identity, and the box is a plain View. Wrapping the label in
        // its OWN Pressable instead would either announce a second phantom
        // control or (if hidden from assistive tech) make the consent sentence
        // unreadable to a screen reader.
        <Pressable {...target} className={ROW}>
          <View {...boxStyling}>{check}</View>
          {label}
        </Pressable>
      ) : (
        // Only the checkbox is the target, because the label owns navigating
        // links and a row-level press would make each tap ambiguous.
        <View className={ROW}>
          <Pressable {...target} {...boxStyling}>
            {check}
          </Pressable>
          {label}
        </View>
      )}
      {error ? (
        <Text
          className="font-label-sm text-label-sm text-error"
          accessibilityLiveRegion="polite"
          // Indent to the label's left edge so the message reads as belonging to
          // the sentence rather than to the checkbox.
          style={{ marginLeft: CHECKBOX_SIZE + 12 }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
