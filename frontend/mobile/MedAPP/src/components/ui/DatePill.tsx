// DatePill — one day in the horizontal date strip.
//
// Figma: 756:4424…756:4439 (60x80), children `Day` / `Date` / `Month`.
//
//   box          60 x 80, radius/12, centred column
//   default      fill `card-surface`, 1px `color/outline-variant`
//                Day   label-sm `on-surface-variant`  (16 tall)
//                Date  headline-md `on-surface`       (26 tall)
//                Month label-sm `on-surface-variant`  (16 tall)
//   selected     fill `color/primary`, no visible border, all three lines `on-primary`
//   unavailable  DASHED `outline-variant` hairline, no fill, content at 38%
//
// THREE LINES, NOT TWO. SelectTimeSlotScreen's private tile draws Day and Date
// only, and then `proceedToReview` reassembles a human date by string-concatenating
// a hardcoded `"May"`: `` `${d.day}, May ${d.date}` ``. That literal is a booking
// screen asserting a month it was never given — every appointment in the app is in
// May regardless of the data. The frame's third line is the month, as real data,
// which is what removes the literal.
//
// UNAVAILABLE IS NOT A COLOUR. The hairline goes DASHED and the content drops to
// M3's 0.38 disabled opacity, and the pill announces "unavailable". docs/BRAND.md
// §Colour rules forbids colour as the only signal, and this is a medical booking
// strip read in sunlight on a low-density screen — a slightly paler tile is not a
// signal there. Do not "simplify" the dash into a tint. Same rule, same shape, as
// ChoiceChip's unavailable state; the two are deliberately identical so a user
// learns the affordance once.
//
// THE BORDER STAYS IN ALL THREE STATES. Figma strokes are inset and cost no
// layout; an RN border participates in it, so dropping the border on selection
// would shrink the pill by 2pt per axis and make the whole strip twitch as the
// user taps across it. The selected state therefore keeps a `border-primary`
// hairline the same colour as its own fill — invisible, and load-bearing. This is
// the identical fix documented in ChoiceChip.tsx.
//
// 60x80 clears the 44pt floor on both axes with room to spare.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";

/** 756:4424. Fixed width so the strip's columns line up; height is a floor. */
const WIDTH = 60;
const MIN_HEIGHT = 80;

/** Material 3's disabled-content opacity. Applied to CONTENT, never the border. */
const UNAVAILABLE_CONTENT_OPACITY = 0.38;

type DatePillState = "default" | "selected" | "unavailable";

/**
 * Every state as class pairs. `line` is shared by all three lines except the
 * date, which differs only in ramp step — so a state can never tint the day and
 * the month differently from the number, which is how the private tile ended up
 * with `#6d7a77` over `#171d1c` in one mode only.
 */
const STATE: Record<DatePillState, { container: string; muted: string; date: string }> = {
  default: {
    container: "border-outline-variant bg-card-surface",
    muted: "text-on-surface-variant",
    date: "text-on-surface",
  },
  selected: {
    // `border-primary` is the invisible-border layout fix documented above.
    container: "border-primary bg-primary",
    muted: "text-on-primary",
    date: "text-on-primary",
  },
  unavailable: {
    // No fill: the parent surface shows through, per BRAND's "never a raw
    // white/black fill" rule. The DASH is the non-colour signal.
    container: "border-dashed border-outline-variant",
    muted: "text-on-surface-variant",
    date: "text-on-surface-variant",
  },
};

export type DatePillProps = {
  /** Short weekday, e.g. "Tue". */
  day: string;
  /** Day of month, e.g. "13". */
  date: string;
  /** Short month, e.g. "May". Real data — this is what removes the hardcoded literal. */
  month: string;
  selected?: boolean;
  /** No slots that day. Not pressable, dashed, announced. */
  unavailable?: boolean;
  onPress: () => void;
  testID?: string;
};

export function DatePill({
  day,
  date,
  month,
  selected = false,
  unavailable = false,
  onPress,
  testID,
}: DatePillProps) {
  const state: DatePillState = unavailable ? "unavailable" : selected ? "selected" : "default";
  const s = STATE[state];
  const spoken = `${day} ${date} ${month}${unavailable ? ", unavailable" : ""}`;

  return (
    <Pressable
      // A date strip is one-of-N, so `radio` — and Android's radio mapping reads
      // `checked`, not `selected`, which is why both are emitted.
      accessibilityRole="radio"
      accessibilityLabel={spoken}
      accessibilityState={{ selected, checked: selected, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      testID={testID}
      className={cn(
        "items-center justify-center rounded-md border",
        !unavailable && "active:scale-[0.98]",
        s.container,
      )}
      style={{ width: WIDTH, minHeight: MIN_HEIGHT }}
    >
      {/* The opacity sits on the CONTENT, so the dashed hairline stays at full
          strength and remains readable in sunlight — fading the border too is
          how a "disabled" tile becomes a blank rectangle. */}
      <View
        className="items-center"
        style={{ opacity: unavailable ? UNAVAILABLE_CONTENT_OPACITY : 1 }}
        testID={testID ? `${testID}-content` : undefined}
      >
        <Text className={cn("font-label-sm text-label-sm", s.muted)}>{day}</Text>
        <Text className={cn("font-headline-md text-headline-md", s.date)}>{date}</Text>
        <Text className={cn("font-label-sm text-label-sm", s.muted)}>{month}</Text>
      </View>
    </Pressable>
  );
}
