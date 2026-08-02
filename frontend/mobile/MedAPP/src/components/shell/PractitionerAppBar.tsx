// PractitionerAppBar — the practitioner top app bar.
//
// Figma: component set "Practitioner AppBar" 656:850, variants
// `Back=Shown | Hidden` — implemented here as the `hideBack` prop, where hidden
// still renders a 44x44 spacer so the centred logo does not shift.
//
// It was previously 379:491 with a `Theme=Light | Dark` axis. That axis is gone:
// the raster swap is handled by `<Logo variant="auto" />`, so a theme prop was
// never a caller's concern. Instanced by
// onboarding_status 72:117 as 385:741.
//
// The designer's own component description, verbatim from Figma:
//
//   "Practitioner top app bar. Back (always available) + centred logo +
//    notification bell with unread badge. Theme variant ONLY swaps the logo
//    raster (a PNG cannot follow a variable); every other fill/stroke is bound
//    to a Colours variable and works in Light and Dark modes. Use Theme=Dark
//    when the app is in dark mode."
//
// The Theme variant therefore has no RN counterpart: `<Logo variant="auto" />`
// already resolves the reversed raster from the theme store, which is exactly
// what the two Figma variants encode. There is no `theme` prop here on purpose.
//
// Geometry, from 656:850:
//   bar     h 64, bg color/surface, px 16, py 8, justify-between
//   back    44 x 44, radius/full, no fill; chevron-left 24 on color/primary
//   logo    110 x 42, "Logo (PNG) — primary" -> shared <Logo /> at height 42
//           (the asset's 584:224 ratio makes that 109.5 wide)
//   bell    44 x 44, radius/full, no fill; bell glyph 24 on color/on-surface
//   badge   18 x 18, radius/full, bg color/error, 2px color/surface ring,
//           at left 24 / top 2 of the bell button; numeral label-sm on-error
//
// FLAGGED — this contradicts docs/BRAND.md §App shell, which says the top bar
// puts the logo on the LEFT with "avatar + notifications grouped on the right",
// and "Do not centre the logo". That section describes the PATIENT shell; this
// component set is the approved practitioner shell and Figma wins on visuals.
// BRAND.md needs a practitioner subsection. Consequence to note explicitly: the
// avatar is GONE from this bar (see the screen's flag list).
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { Icon, Logo } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

const BAR_HEIGHT = 64;
const TARGET = 44; // the frame's own touch target — already >= the 44pt floor
const GLYPH = 24;
const LOGO_HEIGHT = 42;
const BADGE = 18;
const BADGE_RING = 2;
const BADGE_LEFT = 24; // relative to the 44x44 bell button
const BADGE_TOP = 2;
const LABEL_LINE_HEIGHT = 16; // label-sm 12px at the frame's 1.3 leading

interface Props {
  /** Root-level practitioner destinations retain the centred logo but omit back. */
  hideBack?: boolean;
  /**
   * Where "back" goes when there is nothing to pop — e.g. the screen was
   * reached by deep link, which is the normal case for the partner hand-back
   * from the web onboarding flow. Omit to hide the button in that case.
   */
  backFallbackHref?: Href;
  /** Overrides the default `router.back()`. */
  onBackPress?: () => void;
  /**
   * Unread notification count. The badge renders only for a positive number.
   *
   * FLAGGED: the frame hardcodes "3" and the app has no notifications model, so
   * no caller can supply a real value yet — HomeScreen has the same gap and
   * settled on a count-less dot. Rather than fabricate "3 unread items" (a
   * mock NAME is harmless, a mock unread count is a false statement to the
   * user), callers pass nothing and the badge is absent until a notifications
   * store exists. The treatment itself is implemented and covered by tests.
   */
  unreadCount?: number;
  /**
   * FLAGGED: no notifications screen exists in src/app/(app)/, so this has no
   * default destination — an unhandled bell no-ops rather than pushing an
   * invented route.
   */
  onNotificationsPress?: () => void;
}

export function PractitionerAppBar({
  hideBack = false,
  backFallbackHref,
  onBackPress,
  unreadCount,
  onNotificationsPress,
}: Props) {
  const primary = useTokenColor("primary");
  const onSurface = useTokenColor("on-surface");

  const canGoBack = router.canGoBack();
  const showBack = !hideBack && (Boolean(onBackPress) || canGoBack || Boolean(backFallbackHref));
  const showBadge = typeof unreadCount === "number" && unreadCount > 0;
  const badgeText = showBadge ? (unreadCount > 99 ? "99+" : String(unreadCount)) : "";

  const handleBack = () => {
    if (onBackPress) return onBackPress();
    if (router.canGoBack()) return router.back();
    if (backFallbackHref) router.replace(backFallbackHref);
  };

  return (
    <View
      className="w-full flex-row items-center justify-between bg-surface px-4 py-2"
      style={{ height: BAR_HEIGHT }}
    >
      {/* The bar is a three-slot justify-between row whose outer slots are both
          44 wide, which is what centres the logo. When back is unavailable the
          slot is still rendered (empty) so the logo does not shift. */}
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={handleBack}
          className="items-center justify-center rounded-full active:opacity-70"
          style={{ width: TARGET, height: TARGET }}
        >
          <Icon chrome="chevron-left" size={GLYPH} color={primary} />
        </Pressable>
      ) : (
        <View style={{ width: TARGET, height: TARGET }} />
      )}

      <Logo height={LOGO_HEIGHT} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showBadge ? `Notifications, ${badgeText} unread` : "Notifications"}
        accessibilityHint={onNotificationsPress ? undefined : "Not available yet"}
        onPress={() => onNotificationsPress?.()}
        className="items-center justify-center rounded-full active:opacity-70"
        style={{ width: TARGET, height: TARGET }}
      >
        <Icon chrome="notifications-none" size={GLYPH} color={onSurface} />
        {showBadge ? (
          // The ring is `border-surface`, never a literal white: on a dark
          // surface a white ring would be the brightest thing in the bar.
          <View
            className="absolute items-center justify-center overflow-hidden rounded-full border-2 border-surface bg-error"
            style={{
              width: BADGE,
              height: BADGE,
              left: BADGE_LEFT,
              top: BADGE_TOP,
              borderWidth: BADGE_RING,
            }}
          >
            <Text
              className="text-center font-label-sm text-label-sm text-on-error"
              style={{ lineHeight: LABEL_LINE_HEIGHT }}
            >
              {badgeText}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
