// IconTile — the tinted square that leads a detail row.
//
// Figma: 756:4255 (40, in the Time & Schedule / Service Details / Location
// cards) and 756:5246 (32, in the confirmation checklist).
//
//   box    40x40 or 32x32, radius/12, fill `color/primary-tint`
//   glyph  20 (at 40) or 18 (at 32), `color/primary`, centred
//
// WHY THIS FILE EXISTS. It is the single worst offender in the booking flow for
// frozen colour. The three screens between them draw this same tile with
// `#d5e3fc`, `#d8e2ff`, `rgba(33,112,228,0.12)` and `rgba(0,88,190,0.05)` fills
// under `#0058be` glyphs — four fills and a blue that appears nowhere in
// docs/BRAND.md's palette and in no frame. Every one of them is a light-mode
// literal, so in dark mode the tile stays pale blue while everything around it
// inverts. The frames are monochrome teal: `primary-tint` plate, `primary` glyph,
// one pairing, resolved per mode.
//
// DECORATIVE BY DEFAULT. No `label`, so the glyph is hidden from assistive tech —
// the KeyValueRow beside it carries the meaning ("Date", "Tuesday, 13 May 2025"),
// and a labelled tile would make a screen reader announce "image, calendar. Date.
// Tuesday…". Pass `label` only where the glyph is the row's ONLY differentiator,
// which in this flow is the confirmation checklist (756:5246), whose three rows
// are otherwise identical plates.
//
// NOT A TARGET. IconTile is never pressable, so the 44pt floor does not apply —
// a floor only means something for something you can tap. If a tile ever needs to
// be tappable it is a different component (a QuickActionTile), not a prop here.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import { View } from "react-native";
import { useTokenColor } from "@/lib/tokens";
import { Icon, isHealthIcon, type AnyIconName } from "./icons/Icon";

export type IconTileSize = 40 | 32;

/**
 * Glyph size per plate size, read off the frames. Both are on docs/BRAND.md's
 * iconography ramp for a dense row (20) or just under it (18, geometrically
 * constrained by the 32px plate — the same disclosure VitalStatCard makes about
 * its 14px in-chip glyph).
 */
const GLYPH: Record<IconTileSize, number> = { 40: 20, 32: 18 };

export type IconTileProps = {
  icon: AnyIconName;
  /** 40 (detail rows, 756:4255) or 32 (checklist, 756:5246). Default 40. */
  size?: IconTileSize;
  /**
   * The only tone the frames draw. Declared as a named axis rather than left
   * implicit so a second tone, if one is ever designed, arrives as a token PAIR
   * decided here — never as a colour prop, which is how the four blues got in.
   */
  tone?: "primary";
  /**
   * Accessible name. OMIT unless the glyph is the row's only differentiator —
   * see the note above. Absent, the tile is hidden from assistive tech.
   */
  label?: string;
  testID?: string;
};

export function IconTile({ icon, size = 40, tone = "primary", label, testID }: IconTileProps) {
  // `tone` currently resolves to one pairing; naming it keeps the call sites
  // reading as intent and keeps the pairing in one place.
  const glyphColor = useTokenColor(tone);
  const glyph = GLYPH[size];

  return (
    <View
      className="items-center justify-center rounded-md bg-primary-tint"
      style={{ width: size, height: size }}
      testID={testID}
    >
      {/* Two explicit branches rather than a spread: <Icon />'s props are a
          discriminated union (`name` XOR `chrome`), which a spread erases. */}
      {isHealthIcon(icon) ? (
        <Icon name={icon} size={glyph} color={glyphColor} label={label} />
      ) : (
        <Icon chrome={icon} size={glyph} color={glyphColor} label={label} />
      )}
    </View>
  );
}
