// Card — the shared form/content surface.
//
// A card is: `card-surface` fill + a 1px `outline-variant` hairline +
// `rounded-card` (24px) + `p-md` (24px) inset. That is the WHOLE treatment.
//
// NO DROP SHADOW. Not a faint one, not a light-mode-only one — none. This is
// docs/BRAND.md's binding "Elevation — cards do NOT cast a drop shadow": the
// `elevation/card` effect style carries no shadow, and separation comes from
// surface tone plus the hairline. The product owner rejected the shadow twice
// ("the box shadows and background color isn't looking nice", then "we still
// have the shadows behind the forms making it look ugly"), and the reasons it
// was wrong are structural, not a matter of taste:
//
//  1. REDUNDANT. The card already separates three other ways — a lighter fill
//     on a tinted page, a full-strength hairline, and its 24px inset. A fourth
//     signal reads as haze, not as lift.
//  2. ONE-MODE-ONLY. Dark mode emitted nothing (the `shadow` token collapses to
//     black over a near-black page), so a light-only shadow made the two modes
//     structurally different treatments pretending to be one.
//  3. DATED. 24px of blur is a pre-M3 signature; Material 3 gives cards TONAL
//     elevation, and filled/outlined cards carry no shadow at all.
//
// What still does the work, per mode (the surface-role pairing in global.css):
//
//   mode   page      card (`card-surface`)               separation comes from
//   light  #F5FAF8   #FFFFFF (surface-container-lowest)  hairline + fill step
//   dark   #0E1514   #242B2A (surface-container-high)    surface tone + hairline
//
// The fill is the surface ROLE `card-surface`, never a fixed step: naming
// `surface-container-lowest` directly gave #090F0E in dark mode, DARKER than the
// page, so the card receded instead of lifting.
//
// If a surface genuinely must float above content — a bottom sheet, a menu, a
// dialog, a toast — that is a DIFFERENT role from a card and docs/BRAND.md
// allows it a tight `0 1px 2px` / `0 2px 6px` pair at ≤8%, tinted with the
// `shadow` token. Do not reach for it here, and do not reintroduce a shadow to
// this primitive to serve one of those roles.

import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { cn } from "@/lib/cn";

/**
 * Elevation keys a caller could use to put the shadow back through `style`.
 *
 * This list is not paranoia. Removing the shadow from this primitive was not
 * enough on its own: PatientDashboardScreen passed a whole
 * `Platform.select({ ios: { shadowColor… }, android: { elevation: 2 } })` object
 * in via `style`, so a shadowed card shipped while this file and its tests both
 * looked clean. Stripping the keys here makes the rule structural instead of a
 * convention every future call site has to remember.
 */
const ELEVATION_KEYS = [
  "shadowColor",
  "shadowOpacity",
  "shadowRadius",
  "shadowOffset",
  "elevation",
  // RN Web flattens to boxShadow; RN 0.76+ also accepts it natively.
  "boxShadow",
] as const satisfies readonly (keyof ViewStyle | "boxShadow")[];

/**
 * Flattens a caller's style and drops any elevation keys, so `style` keeps
 * working for the thing it is actually used for (padding and gap overrides)
 * without being a back door for a drop shadow.
 */
function withoutElevation(style: ViewProps["style"]): ViewStyle | undefined {
  const flat = StyleSheet.flatten(style) as (ViewStyle & { boxShadow?: unknown }) | undefined;
  if (!flat) return undefined;

  let stripped: (ViewStyle & { boxShadow?: unknown }) | undefined;
  for (const key of ELEVATION_KEYS) {
    if (flat[key] === undefined) continue;
    stripped ??= { ...flat };
    delete stripped[key];
  }
  return stripped ?? flat;
}

interface Props extends ViewProps {
  /**
   * Retained for the call sites that mark a card as carrying no elevation
   * (e.g. SignUpStep2Screen's goal rows, whose Figma nodes draw no effect).
   *
   * Since a card now never casts a shadow in either mode, this is a no-op that
   * asserts intent rather than changing pixels. It is kept, not deleted, so
   * those call sites keep documenting "this node has no effect" — and so that
   * `flat` can never be read as the ONLY way to get a shadowless card.
   */
  flat?: boolean;
  className?: string;
}

export function Card({ flat: _flat = false, className, children, style, ...rest }: Props) {
  return (
    <View
      // Full-strength `outline-variant`, not the old `/30`: with no shadow the
      // hairline and the fill step are the entire separation, and a 30% hairline
      // against a near-equal background is why the card had no edge.
      className={cn("rounded-card border border-outline-variant bg-card-surface p-md", className)}
      // Elevation keys are stripped — see withoutElevation above. A caller that
      // needs a floating surface wants a sheet/menu/dialog, not a Card.
      style={withoutElevation(style)}
      {...rest}
    >
      {children}
    </View>
  );
}
