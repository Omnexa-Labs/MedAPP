// Logo — shared brand mark for headers/app bars.
//
// Renders the real exported PNGs from assets/branding/ rather than letting
// each screen redraw the mark inline. Three variants:
//   - "wordmark" (default): full lockup, assets/branding/logo.png — teal mark
//     + teal type, for light surfaces. Fits a 64px header bar.
//   - "reversed": assets/branding/logo-reversed.png — white mark + white type,
//     for teal/dark surfaces and photography. Per docs/BRAND.md, never put the
//     primary teal wordmark on a dark background; use this instead.
//   - "icon": mark-only, assets/branding/app-icon.png — for compact spaces
//     (e.g. a small badge) where the full wordmark would be too wide.
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
  wordmark: require("../../../assets/branding/logo.png"),
  reversed: require("../../../assets/branding/logo-reversed.png"),
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

  return (
    <View className={cn("items-center justify-center", className)} style={style} {...rest}>
      <Image
        source={SOURCE[resolved]}
        style={{ height, width }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityRole="image"
        accessibilityLabel="MedApp"
      />
    </View>
  );
}
