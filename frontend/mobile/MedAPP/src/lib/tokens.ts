// Colour tokens, resolved to real strings for the places JS needs them.
//
// Everything that can be a Tailwind class SHOULD be a Tailwind class —
// `bg-primary`, `text-on-surface-variant` — because NativeWind resolves those
// through the CSS variables in global.css and they therefore flip with the
// theme for free.
//
// A handful of things can't be classes:
//   - a Pressable's `style`-callback background (pressed state),
//   - an icon's `color` prop (react-native-svg / MaterialIcons take a string),
//   - `shadowColor`, which RN only accepts as a colour value.
//
// Those must not be hardcoded hexes — docs/BRAND.md: "Never hardcode a colour,
// including white", because a literal freezes the value in one mode. Resolve
// them here instead, by token name, from the generated theme/palette.cjs table
// that mirrors global.css. That keeps every colour value in exactly one place.

import palette from "../../theme/palette.cjs";
import { useResolvedScheme } from "./theme";

export type ColorScheme = "light" | "dark";
/** Every token declared in global.css, e.g. "primary", "on-primary", "shadow". */
export type ColorToken = keyof typeof palette.light;

/**
 * The token's value for a given mode, as an `rgb()` string RN understands.
 *
 * `alpha` composes the same way `bg-primary/20` does in a class, so a shadow or
 * scrim tint can be expressed without inventing a second token.
 */
export function tokenColor(token: ColorToken, scheme: ColorScheme, alpha = 1): string {
  const channels = palette[scheme][token].split(" ").join(", ");
  return alpha >= 1 ? `rgb(${channels})` : `rgba(${channels}, ${alpha})`;
}

/**
 * Material 3's "state layer": the `layer` token composited over the `base`
 * token at `alpha`, flattened to one opaque colour.
 *
 * This is how a pressed/hovered tonal surface is meant to be derived — the
 * container tinted towards its own content colour — and it's the only way to
 * get a correct pressed colour in BOTH modes without inventing a second token
 * per variant. RN's `backgroundColor` takes a single value, so the composite
 * has to be computed rather than stacked as a translucent overlay.
 */
export function blendTokens(
  base: ColorToken,
  layer: ColorToken,
  alpha: number,
  scheme: ColorScheme,
): string {
  const b = palette[scheme][base].split(" ").map(Number);
  const l = palette[scheme][layer].split(" ").map(Number);
  const mixed = b.map((channel, i) => Math.round(channel + (l[i] - channel) * alpha));
  return `rgb(${mixed.join(", ")})`;
}

/** Hook form: the token resolved for the mode currently being rendered. */
export function useTokenColor(token: ColorToken, alpha = 1): string {
  const { scheme } = useResolvedScheme();
  return tokenColor(token, scheme, alpha);
}

/**
 * A ready-made RN shadow for the current mode, tinted with a token.
 *
 * Figma expresses elevation as a CSS `box-shadow: x y blur colour`. RN's
 * `shadowRadius` is roughly half the CSS blur (Core Graphics uses the blur as a
 * standard deviation), so callers pass the design's `blur` and this converts.
 * Android ignores all of it and takes `elevation`, so that's derived from the
 * y-offset — the closest single-number approximation the platform allows.
 */
export function tokenShadow(
  token: ColorToken,
  { y, blur, opacity }: { y: number; blur: number; opacity: number },
  scheme: ColorScheme,
) {
  return {
    shadowColor: tokenColor(token, scheme),
    shadowOpacity: opacity,
    shadowRadius: blur / 2,
    shadowOffset: { width: 0, height: y },
    elevation: y,
  } as const;
}

/** Hook form of {@link tokenShadow}. */
export function useTokenShadow(
  token: ColorToken,
  spec: { y: number; blur: number; opacity: number },
) {
  const { scheme } = useResolvedScheme();
  return tokenShadow(token, spec, scheme);
}
