// VitalStatCard — the one definition of "a labelled clinical measurement".
//
// Figma: component `VitalStatCard` 211:241, on `Local Components — Patient
// Dashboard` 211:240. (The brief cited 213:241; that node is the unnamed inner
// frame of `icon/heart-rate` 213:243, not the card. Built against 211:241.)
//
// Geometry and bindings, read from 211:241 / get_variable_defs on it:
//
//   card       w 345 (fills its column here), padding spacing/16, gap spacing/12,
//              radius/24, 1px color/outline-variant hairline, effect `elevation/card`
//              which is EMPTY — no shadow
//   LabelRow   211:242  row, gap 8, items-center
//     IconChip 211:243  24x24, radius/full, fill color/primary-container,
//                       glyph 14 tinted color/on-primary-container
//     Label    211:245  label-md (Inter SemiBold 14 / 1.3), color/on-surface-variant
//   ValueRow   211:246  row, gap 4, items-BASELINE
//     Value    211:247  headline-lg (Manrope Bold 24 / 1.3), color/on-surface
//     Unit     211:248  label-sm (Inter Medium 12 / 1.3), color/on-surface-variant
//   TrendRow   211:249  row, gap 4, items-center
//     glyph    213:262  14, instance of `icon/trend-up` 213:252
//     Trend    211:251  label-sm, color/on-surface-variant  <- NEUTRAL, not tinted
//
// WHY THIS FILE EXISTS
//
// Six private implementations of this one Figma component shipped, and the
// divergence was clinical rather than decorative:
//
//   PatientDashboardScreen.VitalStatCard   label above value, value forced to
//                                          28px/800, abnormal tint "#171c1c"
//   PatientDashboardScreen.QuickActionTile (deliberately NOT folded in — 211:252
//                                          is a navigation affordance, not a reading)
//   ChatThreadScreen.VitalsCard / VitalStat
//   OverviewScreen.MetricTile              label above value, headline-md at 22px
//   PatientProfileOverviewScreen.StatTile  value ABOVE label
//
// `#171c1c` is the one worth naming: it is a one-character typo of `#171D1C`
// (`color/on-surface`), so it matches no token and no frame, and it shipped in
// the highest-stakes surface in the product. That is what a private copy of a
// shared component costs. Two of the six also carried a `cardShadow`, which
// docs/BRAND.md's "Elevation — cards do NOT cast a drop shadow" forbids and the
// shared `Card` structurally strips.
//
// HOW DRIFT IS PREVENTED HERE, structurally rather than by convention:
//
//   - NO `className` and NO `style` prop. A screen cannot express a private
//     variant of a shared reading. Slot order, the type ramp and the tints are
//     not negotiable per screen; `tone`, `trend` and `footer` are the only axes.
//   - No colour prop of any kind. `tone` selects a token PAIR; callers never
//     pass a colour, so a literal can't enter through the API.
//   - Every colour is a Tailwind token class, or a token resolved through
//     `useTokenColor` for the two places RN needs a real string (an `<Icon />`'s
//     `color`). Both modes therefore flip for free.
//   - Charting stays out: `footer` is a slot, not a `chart`/`data` prop, so
//     MiniChart / HealthTrendChart never become a dependency of a primitive.
//
// FLAGGED — three places the frame and docs/BRAND.md disagree, and how each was
// settled. BRAND is binding, so where it speaks the frame loses:
//
//  1. FILL. 211:241 binds its fill to `color/surface-container-lowest`. That is
//     the exact failure docs/MOBILE_UX.md lists under "Common mistakes this
//     project has actually made" — a fixed surface STEP instead of a surface
//     ROLE. In dark mode `surface-container-lowest` is #090F0E, DARKER than the
//     #0E1514 page, so the card would recede instead of lift. We use the
//     `card-surface` role via the shared `Card` (#FFFFFF light / #242B2A dark),
//     which is identical in light mode and correct in dark. The Figma variable
//     binding should be changed to the role.
//  2. INSET. The frame draws padding 16; BRAND's Elevation section describes a
//     form/content card as carrying a 24px inset. Followed the frame at 16,
//     which is still on BRAND's 4/8/12/16/24/32/48 scale, because these tiles
//     are laid out two-up in a 345px column and a 24 inset leaves ~118px for a
//     value plus unit. Disclosed rather than silently chosen — if the designer
//     wants 24, it is one class.
//  3. GLYPH SIZE. The frame's chip glyph and trend glyph are 14px; BRAND's
//     Iconography section says "24px default, 20px in dense rows". Followed the
//     frame: the glyph is geometrically constrained by the 24x24 chip it sits
//     inside (20 leaves a 2px rim), and a 14px decorative glyph is not a target.
//     Either BRAND's ramp gains a 14 step for in-chip glyphs, or the chip grows.
//
// FLAGGED — two registry gaps, NOT fixed here (registry.ts is not this agent's
// file; see the note above `TREND_GLYPH`):
//   - Health Icons ships no arrow/trend glyphs, and `HEALTH_ICONS` has no
//     `trend-up` / `trend-down` / `trend-flat`. Figma has `icon/trend-up`
//     213:252, `icon/trend-flat` 213:255, `icon/trend-ok` 213:258. Falls back to
//     the sanctioned MaterialIcons `chrome` escape hatch documented in Icon.tsx.
//   - Figma has `icon/alert` 215:322; `HEALTH_ICONS` has no `alert`. The
//     abnormal state's non-colour signal therefore uses chrome too.
//
// FLAGGED — the abnormal state is an ADDITION, not a reading of the frame.
// 211:241 has no Tone variant; it draws only the in-range state. All six private
// copies had an abnormal state, so dropping it would lose behaviour. It is
// derived from docs/BRAND.md's own colour table ("color/error — Validation
// errors, out-of-range vitals") rather than invented, and BRAND's "Never use
// colour as the only signal for clinical meaning. An out-of-range vital must
// also carry text or an icon" is enforced STRUCTURALLY: `tone="abnormal"` always
// renders a glyph + words, so a screen cannot ship red-only. A Tone variant
// should be added to 211:241.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Card } from "./Card";
import { Icon, type ChromeIconName, type HealthIconName } from "./icons/Icon";
import { useTokenColor } from "@/lib/tokens";

export type VitalStatTone = "normal" | "abnormal";
/**
 * How the same measurement is laid out.
 *
 * `card` — the default, Figma 211:241: chip + label, then a headline value, then
 *          the abnormal/trend/captured rows stacked underneath. Use in a grid or
 *          a vitals snapshot where the measurement is the subject.
 * `row`   — a compact horizontal line: label and its status on the left, value
 *          and unit right-aligned. Use inside a card that is ABOUT something else
 *          (a patient record, a visit summary) where vitals are a list, not the
 *          subject.
 *
 * This axis exists because it had to. `VitalStatCard` was created to end six
 * private copies of "a labelled clinical measurement" — one of which shipped
 * `#171c1c`, a typo of `on-surface`. It then exposed no `className` or `style`
 * (deliberately: no escape hatch, no drift), which meant a screen needing a
 * horizontal line had no legal option and wrote a seventh copy anyway. The fix
 * for "the shared component cannot express my case" is a named axis decided
 * once, not an escape hatch that re-admits every other divergence with it.
 */
export type VitalStatLayout = "card" | "row";
export type VitalStatTrend = "up" | "down" | "flat";

/**
 * `tone` -> the token PAIR it resolves to. A caller picks a MEANING; the tints
 * are decided here exactly once, which is what stops a sixth "abnormal red"
 * from being invented at a call site.
 */
const TONE = {
  normal: {
    chipFill: "bg-primary-container",
    // `on-primary-container` is the correct pair for a `primary-container`
    // fill in BOTH modes. Pairing an accent with the wrong `on-` token is the
    // mistake docs/MOBILE_UX.md records as having shipped three times.
    chipGlyph: "on-primary-container",
    value: "text-on-surface",
  },
  abnormal: {
    chipFill: "bg-error-container",
    chipGlyph: "on-error-container",
    value: "text-error",
  },
} as const satisfies Record<VitalStatTone, { chipFill: string; chipGlyph: string; value: string }>;

/**
 * Trend glyphs. `chrome` (MaterialIcons) rather than Health Icons because Health
 * Icons ships no arrows — the same documented gap Icon.tsx covers for chevrons
 * and bells. When `trend-up` / `trend-down` / `trend-flat` land in
 * `icons/registry.ts` (Figma 213:252 / 213:255 / 213:258), swap this table to
 * `HealthIconName` and nothing else in this file changes.
 */
const TREND_GLYPH = {
  up: "trending-up",
  down: "trending-down",
  flat: "trending-flat",
} as const satisfies Record<VitalStatTrend, ChromeIconName>;

/** Neutral wording when a caller gives a direction but no words for it. */
const TREND_FALLBACK = {
  up: "Trending up",
  down: "Trending down",
  flat: "Steady",
} as const satisfies Record<VitalStatTrend, string>;

/** Non-colour signal for the abnormal state. See the FLAGGED note above. */
const ABNORMAL_GLYPH: ChromeIconName = "error-outline";

/**
 * Default words for the abnormal state. Copy, not decoration: BRAND's voice is
 * "plain, direct, second person" and forbids alarm language for routine data, so
 * this states the fact and does not diagnose.
 */
const ABNORMAL_LABEL = "Outside your target range";

/** 211:243 — the chip is 24x24 and the glyph inside it is 14. */
const CHIP = 24;
const GLYPH = 14;
/** docs/MOBILE_UX.md §Accessibility: a target may never be under 44pt. */
const MIN_TARGET = 44;
/** `layout="row"` height. 64 = 2 x 32 on the spacing scale, and clears MIN_TARGET. */
const ROW_HEIGHT = 64;

export type VitalStatCardProps = {
  label: string;
  value: string;
  unit?: string;
  /** Clinical glyph, resolved through the Icon gate (HEALTH_ICONS). */
  icon?: HealthIconName;
  /** Drives the tint pair by token; callers never pass a colour. Default "normal". */
  tone?: VitalStatTone;
  /** See {@link VitalStatLayout}. Default "card". */
  layout?: VitalStatLayout;
  trend?: VitalStatTrend;
  trendLabel?: string;
  /**
   * Overrides {@link ABNORMAL_LABEL}. It cannot be emptied — `tone="abnormal"`
   * always renders words next to the glyph, because colour alone is not a legal
   * clinical signal (BRAND "Colour rules", WCAG 1.4.1).
   */
  abnormalLabel?: string;
  capturedAt?: string;
  onPress?: () => void;
  /** Sparkline / mini-chart slot. Keeps charting out of the primitive. */
  footer?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

export function VitalStatCard({
  label,
  value,
  unit,
  icon,
  tone = "normal",
  layout = "card",
  trend,
  trendLabel,
  abnormalLabel,
  capturedAt,
  onPress,
  footer,
  accessibilityLabel,
  testID,
}: VitalStatCardProps) {
  const toneSpec = TONE[tone];
  // RN has no `currentColor`, so an <Icon />'s colour must be a real string.
  // Resolved by TOKEN NAME for the mode being rendered — never a literal.
  // Both branches are resolved unconditionally because hooks cannot be conditional.
  const chipGlyphColor = useTokenColor(toneSpec.chipGlyph);
  const mutedColor = useTokenColor("on-surface-variant");
  const errorColor = useTokenColor("error");

  const isAbnormal = tone === "abnormal";
  const abnormalText = abnormalLabel ?? ABNORMAL_LABEL;
  const spoken =
    accessibilityLabel ??
    spokenSummary({ label, value, unit, tone, abnormalText, trend, trendLabel, capturedAt });

  // `row` is a compact horizontal line, for vitals listed inside a card that is
  // about something else. It deliberately does NOT render a <Card>: a card inside
  // a card is the nesting BRAND's elevation rule exists to avoid, and the parent
  // already owns the surface. Instead: no fill, a 1px `outline-variant` hairline
  // and `radius/12` — the same "no paint, let the parent surface show through"
  // treatment ChoiceChip settled on, so the row is legal on any background.
  //
  // 64 high clears the 44pt floor with room for two stacked lines of text.
  const rowBody = (
    <View
      className="w-full flex-row items-center gap-3 rounded-md border border-outline-variant px-3"
      style={{ minHeight: ROW_HEIGHT }}
    >
      {icon ? (
        <View
          className={`items-center justify-center overflow-hidden rounded-full ${toneSpec.chipFill}`}
          style={{ width: CHIP, height: CHIP }}
        >
          <Icon name={icon} size={GLYPH} color={chipGlyphColor} />
        </View>
      ) : null}

      <View className="min-w-0 flex-1">
        <Text className="font-body-md text-body-md text-on-surface" numberOfLines={1}>
          {label}
        </Text>
        {/* The secondary line carries the same NON-COLOUR signal the card does:
            when abnormal it is always words, never just a red value. Falls back
            to the trend label so the line is not empty for a normal reading. */}
        {isAbnormal || trend ? (
          <View className="flex-row items-center gap-1">
            <Icon
              chrome={isAbnormal ? ABNORMAL_GLYPH : TREND_GLYPH[trend!]}
              size={GLYPH}
              color={isAbnormal ? errorColor : mutedColor}
            />
            <Text
              className={`flex-1 font-label-sm text-label-sm ${
                isAbnormal ? "text-error" : "text-on-surface-variant"
              }`}
              numberOfLines={1}
            >
              {isAbnormal ? abnormalText : (trendLabel ?? TREND_FALLBACK[trend!])}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-baseline gap-1">
        <Text className={`font-headline-md text-headline-md ${toneSpec.value}`}>{value}</Text>
        {unit ? (
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{unit}</Text>
        ) : null}
      </View>
    </View>
  );

  const body = (
    // p-4 = 16 and gap-3 = 12 (211:241). Card owns the radius, the hairline, the
    // `card-surface` role and the guarantee of no elevation.
    <Card className="w-full gap-3 p-4">
      {/* LabelRow 211:242 */}
      <View className="w-full flex-row items-center gap-2">
        {icon ? (
          <View
            className={`items-center justify-center overflow-hidden rounded-full ${toneSpec.chipFill}`}
            style={{ width: CHIP, height: CHIP }}
          >
            {/* Decorative: the Label beside it names the measurement, so the
                glyph is hidden from assistive tech (no `label` prop). */}
            <Icon name={icon} size={GLYPH} color={chipGlyphColor} />
          </View>
        ) : null}
        <Text className="flex-1 font-label-md text-label-md text-on-surface-variant">{label}</Text>
      </View>

      {/* ValueRow 211:246 — baseline-aligned so the unit sits on the value's
          baseline rather than being centred against a 24px cap height. */}
      <View className="w-full flex-row items-baseline gap-1">
        <Text className={`font-headline-lg text-headline-lg ${toneSpec.value}`}>{value}</Text>
        {unit ? (
          <Text className="font-label-sm text-label-sm text-on-surface-variant">{unit}</Text>
        ) : null}
      </View>

      {/* The abnormal state's mandatory NON-COLOUR signal: glyph + words. Sits
          above the trend so the exception is read before the direction. */}
      {isAbnormal ? (
        <View className="w-full flex-row items-center gap-1">
          <Icon chrome={ABNORMAL_GLYPH} size={GLYPH} color={errorColor} />
          <Text className="flex-1 font-label-sm text-label-sm text-error">{abnormalText}</Text>
        </View>
      ) : null}

      {/* TrendRow 211:249 — the frame tints the trend NEUTRAL
          (`on-surface-variant`), not green/red. Followed: the direction of a
          reading is not itself a verdict, and `tone` already carries the verdict. */}
      {trend ? (
        <View className="w-full flex-row items-center gap-1">
          <Icon chrome={TREND_GLYPH[trend]} size={GLYPH} color={mutedColor} />
          <Text className="flex-1 font-label-sm text-label-sm text-on-surface-variant">
            {trendLabel ?? TREND_FALLBACK[trend]}
          </Text>
        </View>
      ) : null}

      {capturedAt ? (
        <Text className="w-full font-label-sm text-label-sm text-on-surface-variant">
          {capturedAt}
        </Text>
      ) : null}

      {footer ? <View className="w-full">{footer}</View> : null}
    </Card>
  );

  const rendered = layout === "row" ? rowBody : body;

  if (!onPress) {
    // Not interactive: no button role and no minHeight floor, since a 44pt
    // target only means anything for something you can tap.
    //
    // It IS still one a11y node, though. This previously left the wrapper
    // unlabelled on the theory that "the rows below already carry the text" —
    // but that makes a screen reader announce a reading as four disconnected
    // fragments ("Blood pressure" … "145/92" … "mmHg" … "Above target"), which
    // is the exact thing `spokenSummary` was written to prevent. It was only
    // ever applied on the pressable path, so the same component announced a
    // reading two different ways depending on whether it happened to be
    // tappable. `accessible` collapses the children into the single labelled
    // node a stat readout should be.
    return (
      <View testID={testID} accessible accessibilityLabel={spoken} className="w-full">
        {rendered}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      // The card is far taller than 44 at every real content length, but the
      // floor is asserted rather than assumed — docs/MOBILE_UX.md forbids
      // shipping a target under 44pt, and a future `footer`-only compact use
      // must not be able to drop below it.
      style={{ minHeight: MIN_TARGET }}
      // Touch feedback inside 100ms (docs/MOBILE_UX.md §Motion). Opacity, not a
      // scale transform: the six private copies used `active:scale-[0.99]`,
      // which nudges the hairline off the pixel grid.
      className="w-full active:opacity-80"
    >
      {rendered}
    </Pressable>
  );
}

/**
 * One spoken sentence for the whole reading, so a screen reader gets the tone
 * and the trend rather than four disconnected fragments. Built here so all four
 * adopting screens announce a vital the same way.
 */
function spokenSummary({
  label,
  value,
  unit,
  tone,
  abnormalText,
  trend,
  trendLabel,
  capturedAt,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: VitalStatTone;
  abnormalText: string;
  trend?: VitalStatTrend;
  trendLabel?: string;
  capturedAt?: string;
}): string {
  const parts = [unit ? `${label}, ${value} ${unit}` : `${label}, ${value}`];
  if (tone === "abnormal") parts.push(abnormalText);
  if (trend) parts.push(trendLabel ?? TREND_FALLBACK[trend]);
  if (capturedAt) parts.push(capturedAt);
  return `${parts.join(". ")}.`;
}
