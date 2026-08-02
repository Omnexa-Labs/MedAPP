// KeyValueRow — one labelled fact inside a detail card.
//
// Figma: 756:4282 (Date / Time), 756:4356 (Consultation type / Duration / Reason
// for visit), 756:4760 (Date & Time / Consultation Type / Join link).
//
//   row     items-start, justify-between, gap 12
//   text    label  label-md  `color/on-surface`         (18 tall)
//           4
//           value  label-sm  `color/on-surface-variant` (16 tall each)
//   trailing  EITHER a Badge ("EDT · Boston", "From provider")
//             OR     a text link ("Directions", "Copy", "Copy link")
//
// WHY THE TRAILING SLOT IS A UNION, NOT TWO OPTIONAL PROPS. No frame draws both,
// and a row that could carry a provenance badge AND a tap target on the same line
// is a row whose 12pt gap collapses on a 393pt canvas. It is expressed as a
// discriminated union so `badge` + `action` together is a TYPE ERROR rather than
// a layout bug found on device — the same structural-instead-of-conventional
// stance Card.tsx takes on elevation.
//
// THE 44pt FLOOR, WITHOUT A 44pt ROW. The frames draw these rows at 44 total for
// a single-value row and less for a dense one, and the action is a text link
// inside that — so the visible link is under the floor by construction. Rather
// than inflate the row (which would break the card's 16pt row rhythm on three
// screens), the Pressable takes a `hitSlop`, which is the platform's own answer
// to "the target must exceed the paint". 12 top/bottom + 8 left/right around a
// ~20pt label clears 44 on both axes.
//
// `items-start`, not `items-center`: a two-line value (756:4760's Date & Time)
// must keep its label, its badge and its action aligned to the FIRST line. Centre
// alignment drifts the badge to the vertical middle of a growing block, which is
// what made ReviewAppointmentScreen's private `DetailRow` look progressively more
// broken as values got longer.
//
// NO `className` AND NO `style`. Same rule as VitalStatCard.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { Pressable, Text, View } from "react-native";
import { Badge, type BadgeTone } from "./Badge";

/**
 * Expands the trailing link past its paint to the 44pt floor without changing
 * the row's height. docs/MOBILE_UX.md §Accessibility.
 */
const ACTION_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 } as const;

type TrailingSlot =
  | { badge?: { label: string; tone?: BadgeTone }; action?: never }
  | { action?: { label: string; onPress: () => void; disabled?: boolean }; badge?: never };

export type KeyValueRowProps = {
  /** The fact's name, e.g. "Date". */
  label: string;
  /** The fact, e.g. "Tuesday, 13 May 2025". */
  value: string;
  /** A second value line, e.g. "10:00 – 10:45 AM · EDT · Boston" (756:4760). */
  secondaryValue?: string;
  /**
   * Overrides what a screen reader announces for the label+value pair. The
   * default joins them into one sentence so the fact is not read as two
   * disconnected fragments.
   */
  accessibilityLabel?: string;
  testID?: string;
} & TrailingSlot;

export function KeyValueRow({
  label,
  value,
  secondaryValue,
  badge,
  action,
  accessibilityLabel,
  testID,
}: KeyValueRowProps) {
  const spoken =
    accessibilityLabel ??
    [label, value, secondaryValue].filter(Boolean).join(", ") +
      (badge ? `, ${badge.label}` : "");

  return (
    <View className="w-full flex-row items-start justify-between gap-3" testID={testID}>
      {/* One a11y node for the fact: "Date, Tuesday, 13 May 2025" rather than
          two unrelated announcements. The trailing slot stays OUTSIDE it, since
          an action inside an `accessible` container is unreachable on iOS. */}
      <View accessible accessibilityLabel={spoken} className="min-w-0 flex-1">
        <Text className="font-label-md text-label-md text-on-surface">{label}</Text>
        <View className="mt-1">
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{value}</Text>
          {secondaryValue ? (
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {secondaryValue}
            </Text>
          ) : null}
        </View>
      </View>

      {badge ? <Badge label={badge.label} tone={badge.tone ?? "success"} /> : null}

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: !!action.disabled }}
          disabled={action.disabled}
          onPress={action.onPress}
          hitSlop={ACTION_HIT_SLOP}
          className="active:opacity-80"
          style={{ opacity: action.disabled ? 0.6 : 1 }}
          testID={testID ? `${testID}-action` : undefined}
        >
          <Text className="font-label-md text-label-md text-primary">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
