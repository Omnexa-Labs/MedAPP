// The anatomy EmptyState (Figma 517:1773) and ErrorPanel (517:2111) share:
// IconPlate > Title > Body > Action, in a Card or Inline container.
//
// It lives in ONE file rather than being written twice because the two frames
// are the same layout with a different plate pair, and the six hand-rolled
// copies this replaces are proof of what happens when that similarity is
// re-typed per screen: the vertical inset landed on 32 (FacilityStatePanels),
// 48 (FindCareScreen), `py-12` (LabResults), `p-lg` (AppointmentManagement) and
// `p-5` (PatientRecord), and the heading landed on a hardcoded `fontSize: 18`
// three times — off the ramp, which has no 18.
//
// NOT exported from the barrel. Screens compose EmptyState or ErrorPanel; the
// shell is an implementation detail, and exporting it would re-open the door to
// a seventh bespoke panel assembled from the same parts.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. This file uses none.

import { Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { useTokenColor, type ColorToken } from "@/lib/tokens";
import { Button } from "./Button";
import { Card } from "./Card";
import { Icon, isHealthIcon, type AnyIconName } from "./icons/Icon";

/**
 * `card` is the standalone case — the panel IS the surface, and replaces the
 * content that failed to arrive.
 *
 * `inline` is for a panel sitting INSIDE an existing card or section:
 * transparent, no hairline, 16 inset. Per the frame's own description, "a card
 * inside a card is the drift this replaces" — and it is the container that keeps
 * per-section failure isolation legal, because a section can report its own
 * failure without drawing a second card inside the one it lives in.
 */
export type StatePanelContainer = "card" | "inline";

/** Plate diameter per container (56 in Card, 48 in Inline), glyph 24 in both. */
const PLATE = { card: 56, inline: 48 } as const;
const PLATE_GLYPH = 24;

/**
 * Type from the ramp only, per container: Card 20/16, Inline 16/12.
 *
 * The Inline title is `body-md` rather than a smaller headline on purpose — it
 * sits under a real section heading that already owns the `headline` role, so a
 * second headline there would compete with it.
 */
const TYPE: Record<StatePanelContainer, { title: string; body: string }> = {
  card: {
    title: "font-headline-md text-headline-md text-on-surface",
    body: "font-body-md text-body-md text-on-surface-variant",
  },
  inline: {
    title: "font-body-md text-body-md text-on-surface",
    body: "font-label-sm text-label-sm text-on-surface-variant",
  },
};

/**
 * The two plate pairs the frames define, as LITERAL class strings.
 *
 * Not `bg-${token}`: Tailwind resolves classes by scanning source text, so an
 * interpolated class name is never generated and NativeWind then drops the
 * utility silently — a plate with no fill, which is exactly the "empty coloured
 * circle reads as a broken image" failure the frame warns about, minus the
 * colour. Keying the fill to its own `on-` pair here also means the two cannot
 * drift: there is no way to select `error-container` and keep a teal glyph.
 */
export const PLATE_PAIR = {
  /** Empty: a SURFACE tint, so the glyph is `on-surface-variant` — NOT
   *  `on-primary` (white on a pale tint) and not `primary`, per 517:1773. */
  empty: { fill: "bg-primary-tint", glyph: "on-surface-variant" },
  /** Error: `error-container` and its OWN on- pair, per 517:2111. */
  error: { fill: "bg-error-container", glyph: "on-error-container" },
} as const satisfies Record<string, { fill: string; glyph: ColorToken }>;

export type StatePanelTone = keyof typeof PLATE_PAIR;

export type StatePanelAction = {
  label: string;
  onPress: () => void;
  /** Defaults to `label`. Set it when the label alone is ambiguous on a screen
   *  that shows more than one panel (e.g. "Retry loading appointments"). */
  accessibilityLabel?: string;
  /** The frames draw a trailing arrow on EmptyState's action; a retry has none. */
  trailingIcon?: "arrow-forward";
  loading?: boolean;
  disabled?: boolean;
};

type Props = {
  container: StatePanelContainer;
  /** Selects the plate fill AND its glyph pair together — see PLATE_PAIR. */
  tone: StatePanelTone;
  icon: AnyIconName;
  title: string;
  body?: string;
  action?: StatePanelAction;
  testID?: string;
  className?: string;
};

export function StatePanelShell({
  container,
  tone,
  icon,
  title,
  body,
  action,
  testID,
  className,
}: Props) {
  const pair = PLATE_PAIR[tone];
  const glyph = useTokenColor(pair.glyph);
  const type = TYPE[container];
  const diameter = PLATE[container];

  const content = (
    <>
      <View
        className={cn("items-center justify-center rounded-full", pair.fill)}
        style={{ width: diameter, height: diameter }}
      >
        {/* Decorative: the title below says the same thing in words, so the
            state is never carried by a coloured circle alone (BRAND "Colour
            rules", WCAG 1.4.1). */}
        {isHealthIcon(icon) ? (
          <Icon name={icon} size={PLATE_GLYPH} color={glyph} />
        ) : (
          <Icon chrome={icon} size={PLATE_GLYPH} color={glyph} />
        )}
      </View>
      <Text accessibilityRole="header" className={cn("text-center", type.title)}>
        {title}
      </Text>
      {body ? <Text className={cn("text-center", type.body)}>{body}</Text> : null}
      {action ? (
        <View className="w-full">
          <Button
            label={action.label}
            accessibilityLabel={action.accessibilityLabel ?? action.label}
            // `docked` is 56, the height both frames draw for the action.
            size="docked"
            // radius/12, not the pill — the frames draw a 12 on this control.
            pill={false}
            fullWidth
            // Card fills with `primary`; Inline is outlined, because a filled
            // teal block inside a card the panel does not own reads as that
            // card's own CTA.
            variant={container === "card" ? "primary" : "outline"}
            shadow={false}
            trailingIcon={action.trailingIcon}
            loading={action.loading}
            disabled={action.disabled}
            onPress={action.onPress}
          />
        </View>
      ) : null}
    </>
  );

  // gap-3 is the frames' 12 between every slot, so nothing here sets a margin —
  // a per-slot margin is how the copies drifted on the plate-to-title distance.
  if (container === "card") {
    return (
      <Card className={cn("items-center gap-3", className)} testID={testID}>
        {content}
      </Card>
    );
  }
  return (
    <View className={cn("items-center gap-3 rounded-md p-4", className)} testID={testID}>
      {content}
    </View>
  );
}
