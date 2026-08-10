// HoursRow — one day of a pharmacy's opening-hours table.
//
// Figma: local component set `HoursRow` 1019:650 on page 1019:640 "Facilities",
// variants `Emphasis=Default` (1019:645) and `Emphasis=Today` (1019:649), 329x38.
// Instanced seven times by `pharmacy_detail` 1022:16476.
//
//   row       h 38, items-center, justify-between, px 8, radius/8
//   default   day `label-md` `on-surface`, hours `label-sm` `on-surface-variant`
//   today     fill `primary-tint`, both texts `primary`
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT `KeyValueRow`
// ---------------------------------------------------------------------------
// It was tried. `KeyValueRow` STACKS its value under its label — that is its
// whole shape, and the reason it exists (a fact and its name reading as one
// unit). Seven stacked pairs is fourteen lines where the frame has seven, and
// the thing a reader actually does with an hours table — scan the right-hand
// column for a time — becomes impossible because there is no right-hand column.
// It also has no emphasis axis, and no way to grow one: its trailing slot is a
// badge XOR an action, both of which are the wrong statement for "this is
// today".
//
// LOCAL, AND PROPOSED FOR PROMOTION. It lives here rather than in
// `src/components/ui/` because exactly one screen instances it and
// `docs/PIPELINE.md` §2 is explicit that the design system is the source of
// truth for Figma: promoting a component into `ui/` before it exists on the
// Design System page (26:84) would invert that. Logged for promotion in the
// build report.
//
// ---------------------------------------------------------------------------
// TODAY IS NOT SAID IN COLOUR ALONE
// ---------------------------------------------------------------------------
// docs/BRAND.md §Colour rules / WCAG 1.4.1. The frame distinguishes today with a
// tint and nothing else, which is a real gap for a reader who cannot see the
// tint at all. The row is therefore ONE accessibility node whose spoken label
// ends in ", today" — so assistive tech gets the fact in words while the visual
// treatment stays exactly as drawn. FLAGGED rather than absorbed: a sighted
// reader with low colour discrimination still gets colour only, and the
// durable fix is a text marker in the frame, which is a design change.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { Text, View } from "react-native";

export type HoursEmphasis = "default" | "today";

export type HoursRowProps = {
  /** Presentation-ready day name, e.g. "Monday". */
  day: string;
  /** Presentation-ready hours, e.g. "08:00 – 22:00" or "Closed". */
  hours: string;
  emphasis?: HoursEmphasis;
  testID?: string;
};

/** 1019:650 draws 38. Not a tap target, so the 44pt floor does not apply. */
const ROW_MIN_HEIGHT = 38;

export function HoursRow({ day, hours, emphasis = "default", testID }: HoursRowProps) {
  const isToday = emphasis === "today";

  return (
    <View
      accessible
      accessibilityLabel={isToday ? `${day}, ${hours}, today` : `${day}, ${hours}`}
      className={`w-full flex-row items-center justify-between gap-3 rounded-xs px-2 ${
        isToday ? "bg-primary-tint" : ""
      }`}
      style={{ minHeight: ROW_MIN_HEIGHT }}
      testID={testID}
    >
      <Text
        className={`font-label-md text-label-md ${isToday ? "text-primary" : "text-on-surface"}`}
      >
        {day}
      </Text>
      <Text
        className={`font-label-sm text-label-sm ${
          isToday ? "text-primary" : "text-on-surface-variant"
        }`}
      >
        {hours}
      </Text>
    </View>
  );
}
