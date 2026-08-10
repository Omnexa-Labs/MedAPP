// Icon — the single entry point for iconography.
//
// Screens must go through this component instead of importing an icon library
// directly, so the app can't drift into three different icon styles. Two sets
// sit behind it, per docs/BRAND.md:
//
//   - Health Icons (https://healthicons.org, MIT/public domain) for every
//     CLINICAL or DOMAIN concept — vitals, medications, anatomy, providers,
//     lab samples. This is the project's distinctive set.
//   - MaterialIcons for pure UI CHROME only — back chevrons, close, overflow.
//     Health Icons deliberately ships no chrome glyphs (no chevron/bell/share),
//     so chrome falls back to the Android platform set rather than inventing
//     one. If the project later adopts a dedicated chrome set, this is the one
//     file that has to change.
//
// Emojis are never icons. If a concept has no glyph, add one to the registry.

import { View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTokenColor } from "@/lib/tokens";
import { HEALTH_ICONS, type HealthIconName } from "./registry";

/**
 * MaterialIcons glyph names, exported so callers that forward a chrome icon
 * through their own prop (e.g. `Button`'s `trailingIcon`) can type it without
 * importing @expo/vector-icons themselves — this file is the only one allowed
 * to touch an icon library.
 */
export type ChromeIconName = React.ComponentProps<typeof MaterialIcons>["name"];

interface BaseProps {
  /** px. Defaults to 24 — the app's standard in-line icon size. */
  size?: number;
  /**
   * Any valid colour string. Defaults to the current mode's `on-surface`.
   * Pass a token value explicitly when the icon sits on an accent surface
   * (e.g. on-primary for an icon inside a filled teal button).
   */
  color?: string;
  /**
   * Screen-reader label. Omit for purely decorative icons that sit next to a
   * text label — those are hidden from assistive tech instead.
   */
  label?: string;
}

interface HealthProps extends BaseProps {
  name: HealthIconName;
  chrome?: never;
}

interface ChromeProps extends BaseProps {
  /** UI chrome only (chevrons, close, overflow). Prefer `name` when a clinical glyph exists. */
  chrome: ChromeIconName;
  name?: never;
}

export type IconProps = HealthProps | ChromeProps;

/**
 * Either vocabulary, for the components whose Figma slot accepts a CLINICAL or a
 * CHROME glyph and cannot know which at the type level (`IconTile`,
 * `SectionHeader`, `ChoiceChip`).
 */
export type AnyIconName = ChromeIconName | HealthIconName;

/**
 * Which set a name belongs to. Health Icons wins a collision, per docs/BRAND.md:
 * "Prefer `name` when a clinical glyph exists."
 *
 * Lives here rather than in each consumer because it is the icon GATE's decision,
 * and because four components had otherwise each carried their own copy of the
 * same predicate — the drift pattern this layer exists to stop.
 */
export function isHealthIcon(name: AnyIconName): name is HealthIconName {
  return Object.prototype.hasOwnProperty.call(HEALTH_ICONS, name);
}

export function Icon({ size = 24, color, label, ...rest }: IconProps) {
  // RN has no `currentColor` inheritance, so an icon can't pick up its parent's
  // text colour the way it would on the web — the default has to be resolved
  // explicitly. `on-surface` for the current mode, from the token table.
  const onSurface = useTokenColor("on-surface");
  const resolvedColor = color ?? onSurface;
  const a11y = label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };

  if ("chrome" in rest && rest.chrome) {
    return (
      <View {...a11y}>
        <MaterialIcons name={rest.chrome} size={size} color={resolvedColor} />
      </View>
    );
  }

  const Glyph = HEALTH_ICONS[(rest as HealthProps).name];
  return (
    <View {...a11y}>
      {/* Health Icons' SVGs use fill="currentColor", which react-native-svg
          maps from the `color` prop. */}
      <Glyph width={size} height={size} color={resolvedColor} />
    </View>
  );
}

export { HEALTH_ICONS, type HealthIconName };
