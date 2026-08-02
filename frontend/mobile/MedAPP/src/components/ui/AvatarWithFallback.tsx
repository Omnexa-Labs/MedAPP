// AvatarWithFallback — circular avatar slot used anywhere a person (provider,
// patient, reviewer) needs a photo that isn't guaranteed to exist.
//
// Priority: `uri` image > `initials` (tinted circle) > generic silhouette icon.
// Real users/providers won't always have a photo, and docs/BRAND.md is explicit
// that "an empty coloured circle reads as a broken image, not as a placeholder",
// so the silhouette is a real fallback rather than a blank tint.
//
// Two docs/BRAND.md violations fixed here — the same pair already removed from
// Badge.tsx, and the same fix:
//
//  1. The tone table carried hardcoded hexes (`#00685f`, `#57657a`, `#0058be`) —
//     light-mode values frozen into JS inside the PRIMITIVES layer, which is the
//     one place they must never appear. In dark mode the `bg-*` tint flipped
//     while the initials and the silhouette stayed dark, so an avatar in dark
//     mode showed a near-invisible glyph on a light-ish tint. Foreground colours
//     now resolve by TOKEN NAME for the current mode via src/lib/tokens.ts.
//  2. It imported MaterialIcons directly. Per docs/BRAND.md, icons/Icon.tsx is
//     the only file allowed to touch an icon library; the silhouette now goes
//     through <Icon chrome="person" />. `person` is chrome, not clinical — Health
//     Icons has no generic person glyph (see the registry), and a clinical glyph
//     like `health-worker` would assert a role this component can't know.

import { useEffect, useState } from "react";
import { Image, Text, View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";
import { useResolvedScheme } from "@/lib/theme";
import { tokenColor, type ColorToken } from "@/lib/tokens";
import { Icon } from "./icons/Icon";

export type AvatarTone = "primary" | "secondary" | "tertiary" | "neutral";

interface Props extends ViewProps {
  uri?: string | null;
  initials?: string | null;
  /** Circle diameter in px. Default 44 matches the appointment-card avatar. */
  size?: number;
  tone?: AvatarTone;
  /** Accessible name, e.g. "Dr. Sarah Chen". */
  label: string;
  className?: string;
}

/**
 * `bg` is a Tailwind class (NativeWind themes those for free); `fg` is a TOKEN
 * NAME, resolved to the current mode at render because both <Text style.color>
 * and <Icon color> take a colour string.
 *
 * Each `fg` is the content pair of its own `bg`, so the initials and the
 * silhouette can never drift from the tint per mode:
 *   primary    `on-primary` on a SOLID `primary` fill
 *   secondary  `on-secondary-container` on `secondary-container`
 *   tertiary   `on-tertiary-container` on `tertiary-container`
 *
 * `primary` was `bg-primary/12` with a `primary` foreground until it was checked
 * against the design. Figma's `User Avatar` 101:104, inside the patient app bar's
 * AvatarWrapper 103:106, is a 40x40 ellipse filled SOLID `color/primary` with an
 * `color/on-primary` silhouette — not a tint. The 12% version was effectively
 * invisible on the near-white `#f5faf8` page: on the emulator the avatar rendered
 * as a bare floating letter next to a crisply ringed notification bell, which
 * read as unfinished. A 12% tint is a legitimate treatment in general; it is just
 * not what this component's canonical instance specifies.
 *
 * `tertiary` moved off a 12% tint for the same reason and to keep all three tones
 * one kind of thing — a solid container with its own `on-` pair — rather than a
 * mix of tints and containers that each need separate contrast reasoning.
 */
const TONE: Record<AvatarTone, { bg: string; fg: ColorToken }> = {
  primary: { bg: "bg-primary", fg: "on-primary" },
  secondary: { bg: "bg-secondary-container", fg: "on-secondary-container" },
  tertiary: { bg: "bg-tertiary-container", fg: "on-tertiary-container" },
  /**
   * The booking flow's practitioner avatar (Figma 780:5363): a `surface-container-high`
   * plate with an `on-surface-variant` silhouette.
   *
   * It is a fourth tone rather than a reuse of `secondary` because the booking
   * frames deliberately draw the fallback as NEUTRAL CHROME, not as an accent —
   * the accent in that row belongs to the verified badge, and two teals stacked
   * on one 56px circle read as a rendering error. `on-surface-variant` is the
   * documented content pair for the neutral container surfaces, so the glyph and
   * the plate still flip together per mode.
   */
  neutral: { bg: "bg-surface-container-high", fg: "on-surface-variant" },
};

export function AvatarWithFallback({
  uri,
  initials,
  size = 44,
  tone = "primary",
  label,
  className,
  style,
  ...rest
}: Props) {
  const t = TONE[tone];
  // Resolved before the `uri` branch returns: hooks can't sit after an early
  // return, and the scheme is needed by both fallbacks.
  const { scheme } = useResolvedScheme();
  // Reset on a new `uri` so a recycled row (a list re-render with a different
  // person) does not inherit the previous one's failure and skip a photo that
  // would have loaded.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const fg = tokenColor(t.fg, scheme);
  const dimension = { height: size, width: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <View
        className={cn("overflow-hidden", className)}
        style={[dimension, style]}
        accessibilityRole="image"
        accessibilityLabel={label}
        {...rest}
      >
        {/* `onError` is what makes this component's name true. Branching on
            `uri` alone meant a URL that merely EXISTS won the fallback chain,
            so a dead link rendered a blank hole with the name floating beside
            it — a broken screen rather than a person with no photo. Doctor
            profiles routinely carry a photo_url that does not resolve, so this
            is the common path, not the edge. */}
        <Image
          source={{ uri }}
          className="h-full w-full"
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  const trimmed = initials?.trim();

  return (
    <View
      className={cn("items-center justify-center", t.bg, className)}
      style={[dimension, style]}
      accessibilityRole="image"
      accessibilityLabel={label}
      {...rest}
    >
      {trimmed ? (
        <Text className="font-inter-semibold" style={{ color: fg, fontSize: size * 0.36 }}>
          {trimmed.slice(0, 2).toUpperCase()}
        </Text>
      ) : (
        // The View above already carries the accessible name, so the glyph is
        // decorative — no `label`, and <Icon /> hides it from assistive tech.
        <Icon chrome="person" size={size * 0.55} color={fg} />
      )}
    </View>
  );
}
