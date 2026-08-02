// InfoCallout — the tinted, non-dismissible note that qualifies the content
// above it (a cancellation policy, a failure the user has to act on).
//
// Figma: 756:4361 (361x81, the cancellation policy on the review screen). The
// `error` tone is derived from the confirm-failed frame 756:4586's tinted block
// and from docs/BRAND.md's `error-container` / `on-error-container` pair.
//
//   box    radius/12, p 16, row, gap 12
//   info   fill `color/primary-tint`,     glyph `color/primary`,           body `on-surface-variant`
//   error  fill `color/error-container`,  glyph `color/on-error-container`, body `on-error-container`
//
// IT IS NOT A CARD. No hairline, no radius/24, no 24 inset — a callout is a tint
// on the page, and giving it the card treatment would put a card inside a card on
// the review screen. It is also NOT a floating surface, so it has no shadow.
//
// WHY THE ERROR TONE IS NOT A NATIVE `Alert`. §4.3 of the build spec needs a
// calendar-permission-denied state, and the reflex there is `Alert.alert()`. That
// is off-system: it is drawn by the OS in the OS's typeface with the OS's buttons,
// it cannot carry the "Open Settings" affordance in the app's own idiom, and it is
// modal for a message that is not blocking. A tinted inline callout under the
// button that failed is the in-product answer, and it is the same component the
// policy note already uses — one treatment, two tones.
//
// COLOUR IS NEVER THE ONLY SIGNAL. `tone="error"` always renders a glyph
// (defaulting to `error-outline`) beside its words, so the tone cannot be reduced
// to "the box is pink" — docs/BRAND.md §Colour rules, WCAG 1.4.1. The glyph is
// decorative in the a11y tree because the text beside it says the same thing in
// words; the tone is carried by that text, not by an announced icon name.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none.

import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTokenColor } from "@/lib/tokens";
import { Icon, type ChromeIconName } from "./icons/Icon";
import type { ColorToken } from "@/lib/tokens";

export type InfoCalloutTone = "info" | "error";

/**
 * `container`/`body` are Tailwind classes (NativeWind themes those for free);
 * `glyph` is a TOKEN NAME resolved at render, because <Icon /> takes a string.
 *
 * `glyph` always names the same token family as `body`, so the icon and the
 * words cannot drift apart per mode — the Badge precedent.
 */
const TONE: Record<
  InfoCalloutTone,
  { container: string; body: string; glyph: ColorToken; defaultIcon: ChromeIconName }
> = {
  info: {
    container: "bg-primary-tint",
    body: "text-on-surface-variant",
    glyph: "primary",
    defaultIcon: "info-outline",
  },
  error: {
    container: "bg-error-container",
    body: "text-on-error-container",
    glyph: "on-error-container",
    defaultIcon: "error-outline",
  },
};

/** docs/BRAND.md §Iconography: 20 in a dense row. 756:4361 draws 20. */
const GLYPH = 20;

export type InfoCalloutProps = {
  /**
   * A string is wrapped on the `body-md` ramp for you — which is the only shape
   * the frames draw. Elements are passed through for the one case that needs
   * them: a callout whose last line is a text action ("Open Settings").
   */
  children: ReactNode;
  icon?: ChromeIconName;
  tone?: InfoCalloutTone;
  testID?: string;
};

export function InfoCallout({ children, icon, tone = "info", testID }: InfoCalloutProps) {
  const t = TONE[tone];
  const glyphColor = useTokenColor(t.glyph);

  return (
    <View
      className={`w-full flex-row items-start gap-3 rounded-md p-4 ${t.container}`}
      testID={testID}
    >
      {/* Decorative — the body says in words what the tone says in colour. */}
      <Icon chrome={icon ?? t.defaultIcon} size={GLYPH} color={glyphColor} />
      <View className="min-w-0 flex-1">
        {typeof children === "string" || typeof children === "number" ? (
          <Text className={`font-body-md text-body-md ${t.body}`}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
