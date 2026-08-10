// DetailAppBar — the canonical top bar for DETAIL screens.
//
// The missing third member of a set whose two siblings already exist and are
// faithful: PatientAppBar (Figma 101:142, tab roots) and PractitionerAppBar
// (Figma 656:850, practitioner chrome). This is the bar for everything that is
// NOT a tab root — a script, a booking step, a chat thread, a provider profile.
//
// Figma: component "Detail AppBar (Back + Title + Action)" 193:120.
//
// The designer's own component description, verbatim from Figma:
//
//   "Canonical app bar for DETAIL screens (not tab roots). Back button left,
//    screen title, optional right action. No logo — the logo belongs only on
//    tab-root screens. 64px tall, surface background, 44x44 touch targets.
//    Detail screens must NOT show the bottom tab bar."
//
// Geometry, all measured from 193:120 (get_metadata + get_variable_defs):
//   bar     393 x 64, bg color/surface, px 16, items-center, justify-between
//   back    "Back Button" 193:115 — 44 x 44 at x=16, y=10 ((64-44)/2, i.e. the
//           frame centres it rather than adding vertical padding)
//   title   "Title" 193:117 — x=60 (== 16 + 44, so NO gap; the glyph's own
//           padding inside its 44 box is the optical gap), width 273
//           (393 - 16 - 44 - 44 - 16), Manrope SemiBold 20 on color/on-surface
//           => the `headline-md` token, exactly
//   action  "Action Button" 193:118 — 44 x 44 at x=333 (333 + 44 + 16 = 393)
//
// Variables bound by the frame, and nothing else:
//   color/surface     the bar fill
//   color/on-surface  the title
//   color/primary     BOTH glyphs (the back chevron and the right action)
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS: the two rules the hand-rolled bars all broke
// ---------------------------------------------------------------------------
// Eleven-plus screens hand-roll a back/title/action bar today, and every one of
// them violates the same two rules:
//
//  1. THEY ADD A SHADOW. An `appBarShadow` style is attached to the bar in every
//     one of them. docs/BRAND.md §Elevation is binding and forbids it: "Separation
//     comes from surface tone and a hairline, never from a blur", and only a
//     sheet/menu/dialog/toast/FAB may use the sanctioned tight pair. 193:120
//     carries no effects either. There is no shadow here and none may be added.
//  2. THEY HARDCODE THE BACK GLYPH'S TINT. `#00685f` appears in four files and
//     `#3d4947` in a fifth. `#00685f` is the LIGHT-mode value of `color/primary`,
//     so those bars keep a light-mode teal chevron on a near-black dark-mode
//     surface. The tint is resolved through `useTokenColor("primary")` here, which
//     is the only form that follows the mode.
//
// The container class string was copy-pasted byte-identically across six
// chat/booking files. That is the silent-drift fingerprint: everyone agrees today,
// so nobody notices when one of the six is edited. One definition removes the
// possibility rather than the symptom.
//
// STRUCTURAL GUARD — this component accepts NO `style` and NO `className`.
// That is deliberate and is the whole point of the task ("a screen cannot express
// a private variant of it by accident"). Card.tsx had to grow a
// `withoutElevation()` filter precisely because a `style` escape hatch let
// PatientDashboardScreen pass a `Platform.select({ ios: { shadowColor… } })`
// object in and ship a shadowed card while the primitive and its tests both
// looked clean. The cheaper fix at this layer is to not offer the hatch: a screen
// that needs different chrome needs a design-system conversation
// (docs/MOBILE_UX.md §Platform conventions: "Don't invent navigation").
//
// ---------------------------------------------------------------------------
// FLAGGED
// ---------------------------------------------------------------------------
//  - `subtitle` and `leading` have NO counterpart in 193:120, which is a plain
//    three-slot bar. They are here because the adopting screens need them
//    (ChatThreadScreen shows an avatar + name + presence line; the practitioner
//    profile screens show a role pill), and the alternative is those screens
//    keeping their private bars — which is the drift this file removes. The
//    designer should add a `Content=Title | Title+Subtitle` variant and a leading
//    slot to 193:120, or rule the two screens down to a plain title.
//    Their treatment below is derived from BRAND's ramp, not from a frame.
//  - The `leading`-to-title gap is 12 (on BRAND's spacing scale). The frame gives
//    no guidance because it has no leading slot.
//  - The API sketch this file was commissioned from described "the logo-only case
//    — never render the wordmark as Text". Figma's own component description
//    forbids a logo on this bar outright ("No logo — the logo belongs only on
//    tab-root screens"), and that matches BRAND §App shell: "Detail screens don't
//    get the bottom nav — they get a back button in the app bar instead." So
//    omitting `title` yields an EMPTY title slot, never a `<Logo />`. A detail
//    screen that wants a logo wants PatientAppBar.
//  - The sketch also typed `backIcon` as `"arrow-back" | "close"`. 193:120 draws a
//    CHEVRON, and PractitionerAppBar 656:850 — the approved sibling with a back
//    button — also uses `chevron-left`. `"chevron-left"` is therefore the default;
//    `"arrow-back"` is kept as an accepted value only so a migrating screen whose
//    own frame draws the Material arrow can say so explicitly, and `"close"` is
//    for a dismiss-only bar.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/**
 * The frame's height. Exported because a screen that pins its own scroll view or
 * absolutely-positioned footer under the bar must not re-measure 64 by hand —
 * that is how a shared constant drifts into eleven private ones.
 */
export const DETAIL_APP_BAR_HEIGHT = 64;

/** 193:115 / 193:118 are both 44 — already the >=44pt floor in docs/MOBILE_UX.md. */
const TARGET = 44;
/**
 * Kept for symmetry with PatientAppBar, where BRAND §App shell mandates a 40x40
 * VISUAL inside the 44 target. 193:120's two buttons draw no container, so
 * nothing here paints at 40 — a `leading` avatar passed by a caller should be
 * sized 40 for the same reason, which is why the number is documented rather
 * than dropped.
 */
const VISUAL = 40;
const GLYPH = 24;
/** Not in the frame (it has no leading slot) — BRAND's spacing scale step. */
const LEADING_GAP = 12;
const SUBTITLE_LINE_HEIGHT = 16; // label-sm 12px at the ramp's 1.3 leading

/** 193:120 draws a chevron; see the FLAGGED note on `backIcon`. */
type BackIcon = "chevron-left" | "arrow-back" | "close";

export type DetailAppBarProps = {
  /**
   * Screen title, rendered at `headline-md` (Manrope SemiBold 20 / on-surface) —
   * the exact binding on 193:117. Omit for a chrome-only bar; the slot stays
   * empty and NO logo is substituted (see FLAGGED).
   */
  title?: string;
  /** Second line under the title. Not in 193:120 — see FLAGGED. */
  subtitle?: string;
  /** Defaults to `router.back()`. */
  onBack?: () => void;
  /** Pass `false` for a bar with no left button at all. */
  showBack?: boolean;
  backIcon?: BackIcon;
  /** Defaults to "Go back", or "Close" when `backIcon` is "close". */
  backAccessibilityLabel?: string;
  /** Slot between the back button and the title (avatar, role pill). */
  leading?: React.ReactNode;
  /**
   * Right-hand action slot. The 44pt target is enforced by THIS component's
   * wrapper, not by the child — so a caller can pass a bare 24px `<Icon />`
   * inside a Pressable and still clear the floor.
   */
  actions?: React.ReactNode;
  testID?: string;
};

const DEFAULT_BACK_LABEL: Record<BackIcon, string> = {
  "chevron-left": "Go back",
  "arrow-back": "Go back",
  close: "Close",
};

export function DetailAppBar({
  title,
  subtitle,
  onBack,
  showBack = true,
  backIcon = "chevron-left",
  backAccessibilityLabel,
  leading,
  actions,
  testID,
}: DetailAppBarProps) {
  // 193:120 binds BOTH glyphs to color/primary. Resolved in JS because RN has no
  // currentColor for an icon to inherit — and resolved by TOKEN, never as the
  // `#00685f` the hand-rolled bars froze, so it follows the mode.
  const primary = useTokenColor("primary");

  const handleBack = () => {
    if (onBack) return onBack();
    // A detail screen normally has history. When it doesn't (deep link), pop
    // nothing rather than throw — the screen owns supplying `onBack` for that
    // case, the same contract PractitionerAppBar's `backFallbackHref` states.
    if (router.canGoBack()) router.back();
  };

  return (
    <View
      // `accessibilityRole="header"` so the title is announced as the screen's
      // heading rather than as loose text in a row.
      accessibilityRole="header"
      testID={testID}
      className="w-full flex-row items-center bg-surface px-4"
      // The frame centres its 44 boxes in 64 (y=10) rather than padding the bar,
      // so the height is fixed and `items-center` does the rest.
      style={{ height: DETAIL_APP_BAR_HEIGHT }}
    >
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel ?? DEFAULT_BACK_LABEL[backIcon]}
          onPress={handleBack}
          className="items-center justify-center rounded-full active:opacity-70"
          style={{ width: TARGET, height: TARGET }}
        >
          <Icon chrome={backIcon} size={GLYPH} color={primary} />
        </Pressable>
      ) : null}

      {leading ? <View style={{ marginRight: LEADING_GAP }}>{leading}</View> : null}

      {/* Always rendered, even with no title: it is the flex spacer that holds
          `actions` against the 16px right gutter (193:118 at x=333). */}
      <View className="flex-1">
        {title ? (
          <Text
            // One line. 193:117 is 27 tall inside a fixed 64 bar, so a wrapping
            // title would overflow the frame; a long screen name truncates.
            numberOfLines={1}
            className="font-headline-md text-headline-md text-on-surface"
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            numberOfLines={1}
            className="font-label-sm text-label-sm text-on-surface-variant"
            style={{ lineHeight: SUBTITLE_LINE_HEIGHT }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actions ? (
        // The 44 target lives here, so the child may be a bare 24px glyph.
        // `minWidth` rather than `width`: a two-glyph action group is wider than
        // 44 and must not be squeezed into it.
        <View
          className="flex-row items-center justify-center"
          style={{ minWidth: TARGET, height: TARGET }}
        >
          {actions}
        </View>
      ) : null}
    </View>
  );
}

/** Re-exported so a caller sizing a `leading` avatar reads it from one place. */
export const DETAIL_APP_BAR_LEADING_SIZE = VISUAL;
