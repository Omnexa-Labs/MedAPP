// PatientAppBar — the patient top app bar.
//
// Figma: component SET "Patient AppBar (Avatar + Logo + Bell)" 741:887 —
// variants `Back=Hidden` (741:887 default, node 101:142, the original component)
// and `Back=Shown` (741:867). 393x64, fill bound to color/surface (#f5faf8 in
// Light). Children:
//   LeadingGroup 741:866  HUG, gap 8 (spacing/8) — BackButton + Logo
//     BackButton 741:863  44 x 44, radius/full, chevron-left on color/primary;
//                         `visible = false` in Back=Hidden, so auto-layout
//                         EXCLUDES it and the logo returns to x=16
//   Logo        101:103   110 x 42   stacked rasters "Logo (PNG) — primary"
//                                    101:105 and "Logo (PNG) — reversed"
//                                    451:680, mode-driven opacity bindings
//   RightGroup  111:285   100 x 44   AvatarWrapper 103:106 (44x44) +
//                                    NotificationBellButton 101:106 (44x44)
//
// 100 - 44 - 44 = a 12px gap between the avatar and the bell, which is on the
// spacing scale.
//
// The two stacked logo rasters with opacity bindings are the Figma-side trick for
// "a PNG cannot follow a variable" — exactly what `<Logo variant="auto" />`
// already does in RN by reading the appearance store. So, as with
// PractitionerAppBar, there is no `theme` prop here: the mode-swap is not a
// caller's concern.
//
// This bar is the MIRROR IMAGE of the practitioner bar, and deliberately so
// (docs/BRAND.md §App shell, "There are TWO shells"):
//
//            patient (this file)          practitioner
//   left     [back] logo                  back
//   centre   —                            logo
//   right    avatar + bell                bell
//
// BRAND is explicit for the patient bar: "logo on the left; avatar +
// notifications grouped on the right … Do not centre the logo." Figma 741:887
// agrees, and that is why `Back=Shown` SHIFTS the logo right (16 -> 68) instead
// of centring it: centring is the practitioner bar's signature and would erase
// the difference between the two shells at exactly the moment both show a back
// button. Do not add a third action (SOS, search) — BRAND: those belong in the
// scrollable body.
//
// ---------------------------------------------------------------------------
// BACK — mirrors PractitionerAppBar's API, with ONE deliberate difference
// ---------------------------------------------------------------------------
// Same three props (`hideBack` / `backFallbackHref` / `onBackPress`) and the
// same `showBack` predicate, so a caller who knows one bar knows the other.
// The two differences, both forced by this bar being LEFT-aligned rather than
// centred:
//
//  1. `hideBack` DEFAULTS TO TRUE here. Figma's default variant is
//     `Back=Hidden`; more concretely, every one of this bar's existing callers
//     is a tab root that expects no back button, and `router.canGoBack()` is
//     true on most of them. A `false` default would silently grow a back button
//     on all of them.
//  2. THERE IS NO 44x44 SPACER when back is hidden. The practitioner bar
//     renders one because its logo is CENTRED by a three-slot justify-between
//     row — drop the slot and the logo moves. Here the logo is the first item
//     in a left-aligned group, so a spacer would be the thing that shifts it
//     (16 -> 68, i.e. it would render `Back=Shown`'s geometry with no button in
//     it). Figma agrees: in `Back=Hidden` the BackButton is `visible = false`
//     and auto-layout excludes it, giving a composition pixel-identical to the
//     bar before the variant axis existed.
//
// ELEVATION — the component has NO effects in Figma and docs/BRAND.md forbids
// inventing one ("Separation comes from surface tone and a hairline, never from
// a blur"). There is no shadow here and none may be added.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used (for the default back action).

import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { AvatarWithFallback, Icon, Logo } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/**
 * The bar's own height, 64 per Figma 741:887.
 *
 * EXPORTED (mirroring `DETAIL_APP_BAR_HEIGHT`) because `AccountMenu` anchors
 * itself directly under this bar and must not re-declare the number. A second
 * copy is how the menu ends up overlapping the bell it hangs off.
 */
export const PATIENT_APP_BAR_HEIGHT = 64;
const BAR_HEIGHT = PATIENT_APP_BAR_HEIGHT;
/** The frame's own touch target — already >= the 44pt floor in docs/MOBILE_UX.md. */
const TARGET = 44;
/**
 * BRAND §App shell: "The avatar and the notification button are both 40x40 with
 * a >=44pt touch target." So the VISUAL is 40 inside the frame's 44 wrapper —
 * never a 40pt tap area.
 */
const VISUAL = 40;
const GLYPH = 24;
const LOGO_HEIGHT = 42; // Logo 101:103 is 110x42; the asset's 584:224 ratio makes 42 -> 109.5 wide
const RIGHT_GROUP_GAP = 12; // RightGroup 111:285 is 100 wide for two 44s
/** LeadingGroup 741:866's gap, bound to `spacing/8`: back 16 -> 60, logo at 68. */
const LEADING_GROUP_GAP = 8;

// ---------------------------------------------------------------------------
// THE UNREAD BADGE IS GONE, AND SO IS THE `unreadCount` PROP (2026-08-07)
// ---------------------------------------------------------------------------
// UnreadBadge 191:114 was implemented here in full — 20x20 at (22, -2), `error`
// fill, a 2px `surface` separation ring, an `on-error` numeral clamped at "99+",
// and a label that switched to "Notifications, 3 unread". It was covered by
// tests. It had never rendered once, on any screen, in the product.
//
// `showBadge` required a positive `unreadCount`, and NO SCREEN IN THE CODEBASE
// PASSED ONE. `PatientShell` declared the prop and forwarded its own — which no
// caller supplied either. So the chain was: 12 patient screens -> shell ->
// bar -> `undefined` -> branch never taken. The prop's own doc said this
// outright ("nothing in the app models notification counts yet, so no caller can
// supply a real value") and treated it as a temporary state. It was not
// temporary: it is a MISSING BACKEND CONCEPT, and the previous note's advice to
// "re-wire it the moment a notifications store exists" quietly implied a store
// that could be written against. There isn't one to write against.
//
// The gap is precise, so it is stated precisely rather than left as a prop that
// looks wired. `notification_service` returns `InboxMessageWire`
// `{ delivery_id, event_id, event_type, title, body, channel, status,
// delivered_at }`. `status` is DELIVERY status ("sent", "failed") and is
// documented as free text; `delivered_at` is when the SERVER sent it. Neither
// records whether the PATIENT has seen it, and there is no per-user read
// marker, no `read_at`, no `POST /v1/me/inbox/{id}/read` and no unread count on
// any endpoint. A client-side "unread" would therefore have to be invented on
// device — and would then reset on reinstall and disagree across devices, which
// on a channel that carries appointment and prescription notices is a worse
// failure than showing nothing.
//
// What the server must expose before a badge can mean anything (logged in
// docs/api/README.md's gap register):
//   1. a per-recipient READ marker on the delivery — `read_at: datetime | null`
//      on `InboxMessageOut`, server-owned so it survives reinstall;
//   2. a way to SET it — `POST /v1/me/inbox/{delivery_id}/read`, and a
//      mark-all for the screen-level action;
//   3. a count that does not require paging the whole inbox — either
//      `unread_count` on the list envelope beside `items`, or
//      `GET /v1/me/inbox/unread-count`.
// De-duplicate on `event_id`, not `delivery_id`: push and in-app deliveries of
// one happening must count once.
//
// The badge treatment is recoverable from git when those land. What must not
// come back before them is a prop whose only possible value is `undefined`.

interface Props {
  /**
   * Figma 741:887 `Back=Hidden | Shown`. Note the INVERTED default relative to
   * PractitionerAppBar: `true` here, because every existing caller is a tab root
   * and `router.canGoBack()` is true on most of them, so defaulting to `false`
   * would grow a back button on all of them at once. A patient DETAIL screen
   * that is reached by a push passes `hideBack={false}`.
   */
  hideBack?: boolean;
  /**
   * Where "back" goes when there is nothing to pop — e.g. the screen was reached
   * by deep link or a notification tap. Omit to hide the button in that case.
   * Same contract as PractitionerAppBar.
   */
  backFallbackHref?: Href;
  /** Overrides the default `router.back()`. */
  onBackPress?: () => void;
  /** Avatar photo. Falls back to `avatarInitials`, then to a silhouette. */
  avatarUri?: string | null;
  /** Used when there is no photo. First initial is enough; two are rendered. */
  avatarInitials?: string | null;
  /** Accessible name for the avatar, e.g. the signed-in user's display name. */
  avatarLabel?: string;
  /**
   * Optional. With no handler the avatar is a non-interactive image rather than
   * a button that does nothing.
   *
   * The comment that used to sit here read "there is no patient-settings
   * destination the shell can assume", and that was the reason NOTHING passed
   * this prop for the bar's whole life — the avatar was inert on all 12 callers.
   * It is now stale: `PatientShell` supplies `AccountMenu` as the default
   * destination, so every patient screen gets a working avatar without asking.
   */
  onAvatarPress?: () => void;
  /**
   * Present ONLY when the avatar opens a disclosure (i.e. `AccountMenu`), and
   * then it is that menu's open state.
   *
   * `undefined` — a caller wired `onAvatarPress` to something that is not a
   * menu — leaves both the `expanded` state and the hint off, because announcing
   * "opens your account menu" for a plain navigation would be a lie. This is the
   * only reason the prop is tri-state rather than a boolean with a default.
   */
  avatarExpanded?: boolean;
  /* No `unreadCount`. See the block comment above the constants for the exact
     fields `notification_service` must expose before the badge can return. */
  /**
   * FLAGGED: no notifications screen exists in src/app/(app)/, so there is no
   * default destination — an unhandled bell no-ops rather than pushing an
   * invented route.
   */
  onNotificationsPress?: () => void;
}

export function PatientAppBar({
  hideBack = true,
  backFallbackHref,
  onBackPress,
  avatarUri,
  avatarInitials,
  avatarLabel = "Your profile",
  onAvatarPress,
  avatarExpanded,
  onNotificationsPress,
}: Props) {
  // Figma 101:109 binds the bell glyph's strokes to `color/primary`, NOT to
  // `on-surface`. Note this differs from the PRACTITIONER bar on purpose: there,
  // back is the only primary-tinted glyph so it reads as the action and the bell
  // stays neutral chrome. This bar tints BOTH — the new BackButton 741:863 is
  // also bound to `color/primary` — because the patient bar's bell was already
  // the tinted one before back existed, and retinting it to `on-surface` to
  // preserve "only one primary glyph" would change 14 shipped frames.
  const primary = useTokenColor("primary");

  // Same predicate as PractitionerAppBar — an explicit handler, real history or
  // a fallback destination; any of the three makes back actionable, and with
  // none of them the button would be a dead control, so it is not drawn.
  //
  // The three disjuncts are REORDERED so `router.canGoBack()` is reached last
  // and only when back is actually in play. The result is identical (pure
  // boolean OR), but the read is not free here the way it is on the
  // practitioner bar: this bar's default is `hideBack`, so 12 tab roots would
  // otherwise interrogate the router on every render to answer a question they
  // have already declared they don't care about — and outside a navigator that
  // read throws rather than returning false.
  const showBack =
    !hideBack && (Boolean(onBackPress) || Boolean(backFallbackHref) || router.canGoBack());

  const handleBack = () => {
    if (onBackPress) return onBackPress();
    if (router.canGoBack()) return router.back();
    if (backFallbackHref) router.replace(backFallbackHref);
  };

  // AvatarWithFallback carries its own accessibilityRole="image" + label. That is
  // right when the wrapper is a plain View — the image IS the accessible thing.
  //
  // It was WRONG the moment the wrapper became a button, and that path is no
  // longer hypothetical: PatientShell now supplies an account menu by default, so
  // every patient screen takes it. Pressable(label) wrapping Image(same label)
  // publishes the name TWICE, and TalkBack walks both — "Melchizedek Narh,
  // button. Melchizedek Narh, image." on 12 screens. So when the avatar is a
  // button the inner node is demoted to decoration.
  //
  // AvatarWithFallback spreads `...rest` AFTER its own a11y props, so passing
  // these as `undefined` genuinely clears them. Note it is done this way rather
  // than with `accessibilityElementsHidden` / `no-hide-descendants`: hiding the
  // SUBTREE would also hide the initials <Text> inside it, and the initials are
  // how "did the fallback chain pick initials or the silhouette?" is observable.
  const avatarNode = (decorative: boolean) => (
    <AvatarWithFallback
      size={VISUAL}
      uri={avatarUri}
      initials={avatarInitials}
      label={avatarLabel}
      {...(decorative ? { accessibilityRole: undefined, accessibilityLabel: undefined } : null)}
    />
  );

  return (
    <View
      className="w-full flex-row items-center justify-between bg-surface px-4 py-2"
      style={{ height: BAR_HEIGHT }}
    >
      {/* LeadingGroup 741:866 — back (when shown) then the logo, 8 apart. The
          group HUGS: with no back button it is exactly the logo at x=16, which
          is why no spacer is rendered (see the header note). */}
      <View
        // Named so the "no spacer when hidden" invariant is assertable: the
        // group must hold exactly one child (the logo) in `Back=Hidden`. That is
        // the difference from the practitioner bar most likely to be "tidied"
        // back into a spacer by someone pattern-matching the two files.
        testID="patient-app-bar-leading"
        className="flex-row items-center"
        style={{ gap: LEADING_GROUP_GAP }}
      >
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
        ) : null}

        {/* Logo LEFT — not centred. `variant="auto"` resolves the reversed raster
            in dark mode, which is what 101:105 / 451:680 encode in Figma. */}
        <Logo height={LOGO_HEIGHT} />
      </View>

      {/* RightGroup 111:285 — avatar and bell grouped, 12px apart. */}
      <View className="flex-row items-center" style={{ gap: RIGHT_GROUP_GAP }}>
        {onAvatarPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={avatarLabel}
            // Only when this button IS a disclosure — see the prop's doc. A
            // caller that wired the avatar to a plain push gets neither, because
            // neither would be true of it.
            accessibilityState={
              avatarExpanded === undefined ? undefined : { expanded: avatarExpanded }
            }
            accessibilityHint={avatarExpanded === undefined ? undefined : "Opens your account menu"}
            onPress={onAvatarPress}
            className="items-center justify-center rounded-full active:opacity-70"
            style={{ width: TARGET, height: TARGET }}
          >
            {avatarNode(true)}
          </Pressable>
        ) : (
          <View className="items-center justify-center" style={{ width: TARGET, height: TARGET }}>
            {avatarNode(false)}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          accessibilityHint={onNotificationsPress ? undefined : "Not available yet"}
          onPress={() => onNotificationsPress?.()}
          className="items-center justify-center rounded-full active:opacity-70"
          style={{ width: TARGET, height: TARGET }}
        >
          {/* The 40x40 outlined circle is Figma 101:107 "bell-icon": fill bound
              to `color/surface`, 1px INSIDE stroke bound to `color/outline-variant`.
              An earlier pass omitted it, citing BRAND's "never use a raw
              white/black fill on an icon container". That rule does not apply
              here: a tokenised `surface` fill plus an `outline-variant` hairline
              is not a raw white/black fill — it is BRAND's own sanctioned
              separation mechanism, the same one cards use now that they cast no
              shadow. The prohibition is about hardcoded #fff, not about the
              surface role. */}
          <View
            className="absolute items-center justify-center rounded-full border border-outline-variant bg-surface"
            style={{ width: VISUAL, height: VISUAL }}
          />
          {/* RN has no currentColor to inherit, so the token is resolved in JS. */}
          <Icon chrome="notifications-none" size={GLYPH} color={primary} />
        </Pressable>
      </View>
    </View>
  );
}
