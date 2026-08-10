// BrandMark — third-party BRAND marks (Google, Apple), deliberately separate
// from <Icon /> and from the Health Icons registry.
//
// WHY ITS OWN MODULE (docs/BRAND.md, Iconography):
// `src/components/ui/icons/registry.ts` is the CLINICAL vocabulary — semantic
// names like `medication` or `lab-sample`, all outline weight, all recoloured
// through the token system. A vendor logo breaks every one of those rules: its
// name is a company, its geometry is fixed by someone else's guidelines, and in
// Google's case its colours may not be themed at all. Filing it under
// `HEALTH_ICONS` would mean `<Icon name="google" />` sitting next to
// `<Icon name="heart-rate" />`, which is how a design system quietly turns into
// a junk drawer. So brand marks live here:
//
//   src/components/ui/brand/BrandMark.tsx   this component (+ its registry)
//   src/components/ui/brand/google.svg      vendored 4-colour Google "G"
//   src/components/ui/brand/apple.svg       vendored Apple silhouette
//
// This file is the ONLY place those SVGs are imported — same rule the icon
// registry follows.
//
// WHAT WAS WRONG: the social buttons rendered MaterialIcons `g-mobiledata`,
// which draws a boxed lowercase-ish "G" from the Android platform set, not
// Google's mark ("the google icon is not showing"). MaterialIcons `apple` is
// likewise a generic fruit-with-leaf glyph, not Apple's logo. Neither is
// permitted on a sign-in button by the respective vendor's branding rules, and
// no icon-font substitution can be, because the Google mark is four-colour.
//
// LICENSING: vendoring both marks is the correct call rather than a problem.
// Google's Sign-In branding guidelines REQUIRE the official "G", and both
// vendors grant use of their mark for exactly this purpose — identifying their
// own sign-in affordance — provided the artwork is unmodified. Do not recolour,
// rotate, outline, or add effects to either mark.
//
// Build wiring: these are plain `.svg` imports and go through the existing
// react-native-svg-transformer pipeline already configured in metro.config.js
// (svg moved from assetExts to sourceExts), typed by svg.d.ts, and stubbed under
// Jest by the `\\.svg$` -> src/test/svg-mock.tsx mapping. No new build config.

import { View } from "react-native";
import type { SvgProps } from "react-native-svg";
import { useTokenColor } from "@/lib/tokens";
import AppleGlyph from "./apple.svg";
import GoogleGlyph from "./google.svg";

export type BrandMarkName = "google" | "apple";

/**
 * Per-mark metrics.
 *
 * `themed: false` means the mark carries its own vendor colours and the `color`
 * prop is ignored — that's the Google G, whose four hexes are brand constants
 * (they live in google.svg, so no .tsx here holds a colour literal).
 *
 * `aspect`/`scale` normalise the two marks to one optical size: the Google art
 * spans 44 of its 48-unit box, while the Apple silhouette is full-bleed in a
 * 814x1000 box. Without `scale` the Apple logo renders visibly taller than the
 * G at the same nominal `size`, which is the usual giveaway of a hand-assembled
 * social row.
 *
 * Exported so `themed` — the "never recolour the Google G" rule — is directly
 * assertable. It can't be observed through a render: the project-wide `.svg` Jest
 * mock consumes the `color` prop instead of forwarding it.
 */
export const MARK: Record<
  BrandMarkName,
  { Glyph: React.FC<SvgProps>; themed: boolean; aspect: number; scale: number }
> = {
  google: { Glyph: GoogleGlyph, themed: false, aspect: 1, scale: 1 },
  apple: { Glyph: AppleGlyph, themed: true, aspect: 814 / 1000, scale: 44 / 48 },
};

interface Props {
  name: BrandMarkName;
  /** Nominal box size in px. Defaults to 20 — the auth social-button size. */
  size?: number;
  /**
   * Colour for MONOCHROME marks only (Apple). Defaults to the current mode's
   * `on-surface`. Ignored by the Google mark, which may not be recoloured.
   */
  color?: string;
  /**
   * Screen-reader label. Omit when the mark sits next to a visible text label
   * (e.g. the word "Google" in the button) — it's then decorative and is hidden
   * from assistive tech, exactly as <Icon /> does it.
   */
  label?: string;
}

export function BrandMark({ name, size = 20, color, label }: Props) {
  const { Glyph, themed, aspect, scale } = MARK[name];
  // RN has no `currentColor` inheritance, so the default has to be resolved
  // explicitly from the token table rather than picked up from the parent.
  const onSurface = useTokenColor("on-surface");
  const height = Math.round(size * scale);
  const width = Math.round(height * aspect);
  const a11y = label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };

  return (
    // Fixed square box so a row of marks with different aspect ratios still
    // aligns on one baseline.
    <View
      {...a11y}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Glyph width={width} height={height} color={themed ? (color ?? onSurface) : undefined} />
    </View>
  );
}
