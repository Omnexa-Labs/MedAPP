// SuccessMedallion — the 96px confirmation mark at the top of a terminal screen.
//
// Figma: 756:4753 (96x96) on the Booking Confirmed frame 756:4742.
//
//   circle  96, radius/full, fill `color/primary`
//   glyph   check, 48, `color/on-primary`
//
// NO SHADOW, AND THE REASONING IS THE POINT. BookingConfirmedScreen carried a
// `heroShadow` on this element with a note arguing it should go; the note was
// right and this is where the conclusion belongs, because a comment in a screen
// only protects that screen. A medallion is not one of docs/BRAND.md's sanctioned
// floating roles (sheet, menu, dialog, toast) — it is a flat mark on the page. A
// brand-tinted glow behind a 96px teal disc also does the thing BRAND removed
// from cards: reads as haze rather than as lift, in one mode only, since `shadow`
// collapses to black over a near-black dark-mode page.
//
// THE GLYPH IS LABELLED, unlike almost every other glyph in this layer. It is not
// decorative: it is the only element in the hero that states the outcome
// pictorially, and the headline below it ("Appointment Confirmed") is a separate
// node. Without a label a screen reader lands on an unannounced 96px shape at the
// top of the screen. "Confirmed" is the word, not a description of the drawing.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { View } from "react-native";
import { useTokenColor } from "@/lib/tokens";
import { Icon } from "./icons/Icon";

/** 756:4753. */
const DIAMETER = 96;
const GLYPH = 48;

export type SuccessMedallionProps = {
  /** Overrides the announced word. Defaults to "Confirmed". */
  label?: string;
  testID?: string;
};

export function SuccessMedallion({ label = "Confirmed", testID }: SuccessMedallionProps) {
  const glyphColor = useTokenColor("on-primary");

  return (
    <View
      className="items-center justify-center self-center rounded-full bg-primary"
      style={{ width: DIAMETER, height: DIAMETER }}
      testID={testID}
    >
      <Icon chrome="check" size={GLYPH} color={glyphColor} label={label} />
    </View>
  );
}
