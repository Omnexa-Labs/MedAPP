// Logo — shared brand mark for headers/app bars.
//
// ONE lockup asset, tinted per mode:
//   - "wordmark" (default) / "reversed": both render assets/branding/logo.png.
//     The difference is the TINT, not the file.
//   - "icon": mark-only, assets/branding/app-icon.png — for compact spaces
//     (e.g. a small badge) where the full wordmark would be too wide.
//
// ---------------------------------------------------------------------------
// WHY THE REVERSED PNG IS GONE (2026-08-03)
// ---------------------------------------------------------------------------
// Reported from the device: "the logo in dark mode is not right". It is not a
// layout or token fault — `assets/branding/logo-reversed.png` is CORRUPT. Opened
// directly it is a near-empty image: the letter counters (the enclosed holes in
// e/d/p) survive as faint grey and the strokes of both the mark and the type are
// gone. That is why dark mode showed a wordmark whose letters read dimmer than
// its M.
//
// The literal request was "use the same logo as light mode", and taken literally
// that swaps a broken mark for an invisible one: logo.png is `primary` teal
// (0,104,95) and the dark page is (14,21,20) — about 1.9:1.
//
// The lockup is MONOCHROME, though — mark and type are one teal — so a tint is
// lossless. One asset with `tintColor` bound to the mode's own `primary` (mint
// 107,216,203 in dark) is the same logo in both modes AND legible in both, and it
// drops the corrupt file from the build instead of shipping a second raster that
// can rot independently.
//
// Knock-on, stated because it is a real change in behaviour: the logo now follows
// the token, so a palette change moves it too. Re-exported artwork can still
// replace this — nothing depends on the tint beyond the block below — but until a
// designer supplies a correct reversed export, this is the honest version.
//
// `reversed` is KEPT as a variant name rather than deleted: callers pass it for a
// logo sitting on an always-teal hero card that does not follow the theme, where
// it must stay light in either mode. It now means "tint for a dark surface"
// rather than "load the white file".
//
// `height` scales the image proportionally (resizeMode="contain") since the
// source PNGs' native aspect ratios differ between the wordmark and icon.
//
// ---------------------------------------------------------------------------
// WHY THE WIDTH IS COMPUTED IN JS AND NOT LEFT TO `aspectRatio`
// ---------------------------------------------------------------------------
// This used to pass `{ height, aspectRatio }` and let the layout engine derive
// the width. That is correct on native Yoga and WRONG on react-native-web, and
// it is what broke the patient app bar.
//
// RNW's <Image> resolves a `require()`d asset through resolveAssetSource and
// composes the asset's INTRINSIC size UNDER the caller's style. With only
// `height` supplied, the intrinsic `width` survives, so the element lands with
// BOTH `width: 584px` and `height: 42px` set — and CSS `aspect-ratio` is
// ignored the moment both axes are definite. Measured on the running app at
// 393pt: the logo box came out 584 wide inside a 393-wide bar, which shoved
// PatientAppBar's RightGroup to x=600 (avatar and bell entirely off-screen) and
// left `resizeMode="contain"` centring the artwork in that 584 box — i.e. the
// mark appeared alone, pushed to the right edge. Every <Logo /> caller had the
// same box; the app bar is just where it was visible.
//
// Supplying BOTH dimensions is definite on both platforms and computes to the
// same number Yoga would have produced (42 * 584/224 = 109.5), so the native
// rendering is unchanged and the web one is repaired.

import { Image, View, type ImageSourcePropType, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { useResolvedScheme } from "@/lib/theme";
import { tokenColor } from "@/lib/tokens";

/**
 * "auto" (the default) picks wordmark in light mode and reversed in dark mode,
 * which is what BRAND.md requires — the teal wordmark must never sit on a dark
 * background. Pass an explicit variant only when the logo sits on a surface
 * that doesn't follow the theme (e.g. always-teal hero cards need "reversed"
 * even in light mode).
 */
export type LogoVariant = "auto" | "wordmark" | "reversed" | "icon";

interface Props extends ViewProps {
  variant?: LogoVariant;
  /** Rendered height in px; width follows the source aspect ratio. */
  height?: number;
  className?: string;
}

type ResolvedVariant = Exclude<LogoVariant, "auto">;

const SOURCE: Record<ResolvedVariant, ImageSourcePropType> = {
  // wordmark and reversed are the SAME file. See the header note: the separate
  // reversed export was corrupt, and one monochrome lockup plus a tint cannot
  // drift between two rasters.
  wordmark: require("../../../assets/branding/logo.png"),
  reversed: require("../../../assets/branding/logo.png"),
  // NOT tinted — the app icon is a rounded teal tile with the mark knocked out of
  // it, i.e. multi-colour, so a tint would flatten it to a solid block.
  icon: require("../../../assets/branding/app-icon.png"),
};

/**
 * Width per unit of height, from each source PNG's own pixel dimensions. Kept
 * as a table beside SOURCE so a re-export at a different size is one edit in
 * one place rather than a ratio inlined at the point of use.
 */
const ASPECT: Record<ResolvedVariant, number> = {
  wordmark: 584 / 224,
  reversed: 584 / 224,
  icon: 1,
};

export function Logo({ variant = "auto", height = 32, className, style, ...rest }: Props) {
  const { scheme } = useResolvedScheme();
  const resolved: ResolvedVariant =
    variant === "auto" ? (scheme === "dark" ? "reversed" : "wordmark") : variant;

  // BOTH axes, definite. See the header note: `aspectRatio` alone loses to the
  // asset's intrinsic width on react-native-web.
  const width = height * ASPECT[resolved];

  /**
   * The mark's colour.
   *
   * `wordmark` takes the CURRENT mode's `primary`, so it is teal on a light page
   * and mint on a dark one — the same relationship every other accent has.
   * `reversed` means "this sits on a dark surface regardless of mode", so it always
   * takes the DARK mode's `primary`: a caller putting the logo on an always-teal
   * hero card needs it light even while the app is in light mode.
   */
  const tintColor =
    resolved === "icon"
      ? undefined
      : tokenColor("primary", resolved === "reversed" ? "dark" : scheme);

  return (
    <View className={cn("items-center justify-center", className)} style={style} {...rest}>
      <Image
        source={SOURCE[resolved]}
        style={{ height, width }}
        resizeMode="contain"
        tintColor={tintColor}
        accessibilityIgnoresInvertColors
        accessibilityRole="image"
        accessibilityLabel="MedApp"
      />
    </View>
  );
}
