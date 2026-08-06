// AccountMenu — what the patient app bar's avatar opens.
//
// ============================================================================
// WHY THIS FILE EXISTS: there was no way to sign out of MedApp
// ============================================================================
// Not hidden — absent. `useAuthStore.signOut()` has been implemented since the
// auth store landed (it clears SecureStore and resets state) and was called from
// NOWHERE in the app. Two more things were unreachable for the same reason:
//
//   * `/(app)/patient-profile-overview` — a fully built, Figma-verified screen
//     (frame 261:387) that nothing in the app linked to. Orphaned route.
//   * `<AppearanceSelector />` — the three-way light/dark/system control. Its own
//     header says "Lives in Settings -> Appearance". There is no Settings screen,
//     so the only reference to it in the whole tree was the barrel export. A
//     preference the user cannot reach is the same defect as an unreachable
//     sign-out, so it gets its home here.
//
// `PatientAppBar` already had `onAvatarPress` plumbed through `PatientShell`, and
// no screen passed it — the avatar was inert by omission, not by design. This
// component is the destination, and `PatientShell` opens it by DEFAULT rather
// than making each screen pass a handler. That placement is deliberate: five tab
// roots render that bar, and the last time per-screen wiring was trusted for
// shell behaviour, three of them silently dropped the Inbox tab and it took a
// route audit to find (see PatientShell's PATIENT_TAB_HREFS note). A screen
// cannot forget what the shell does for it.
//
// ============================================================================
// SIGN OUT IS CONFIRMED, *AND* SEPARATED. Both, deliberately.
// ============================================================================
// The brief was "confirm, or separate it clearly from the benign items". Both,
// because they answer different failure modes and only one of them is enough for
// neither:
//
//  1. SEPARATION answers "I meant to open my profile." The avatar's primary job
//     is Profile. Sign out is the LAST row, below a hairline, after the whole
//     Appearance block, and it is the only `error`-toned thing in the panel.
//     Nothing benign sits below it to be undershot into.
//  2. CONFIRMATION answers "I did tap it." `signOut()` calls
//     `secureStorage.clearAll()` — the access AND refresh tokens are gone. The
//     recovery is not an undo, it is re-authenticating from the sign-in screen,
//     which on this app can include re-verification. docs/BRAND.md's floating-
//     surface rule ("a dialog … is a different role from a card") plus the
//     established precedent in `LeaveCallDialog` — an `error`-filled confirm
//     button against an `outline` cancel, cancel listed FIRST — is what this
//     copies.
//
// The confirm is a STATE OF THIS MODAL, not a second `<Modal>` on top of it.
// Stacked RN Modals on Android are unreliable (the inner one can mount behind
// the outer one's window, or the dismiss of one closes both), and the menu has
// no reason to stay on screen behind a confirmation it is being replaced by.
//
// FLAGGED for a follow-up that is NOT this batch's to make: the confirm layout
// below is the second copy of "centred scrim + card + outline-cancel +
// error-confirm" in the tree (`features/telehealth/components/LeaveCallDialog`
// is the first). The right fix is a shared `ConfirmDialog` in
// `src/components/ui/`, which this batch does not own. Logged in docs/PIPELINE.md §5.
//
// ============================================================================
// WHERE THE USER LANDS — navigated, not swept up by the guard
// ============================================================================
// `(app)/_layout.tsx` renders `<Redirect href="/(public)/sign-in" />` when
// `isAuthenticated` is false, so doing nothing after `signOut()` would "work".
// It also means the authenticated screen is what paints while the store flip
// propagates and the redirect resolves. So the navigation happens FIRST and
// explicitly:
//
//     router.replace("/(public)/sign-in");   // this tick
//     void signOut();                        // resolves after its first await
//
// `replace`, not `push` — a signed-out user must not be able to swipe back into
// the authenticated stack, and the sign-in screen is a root, not a detail.
// Ordering note: `signOut()` cannot flip state before the next tick anyway (it
// awaits `secureStorage.clearAll()` first), so the replace is guaranteed to be
// the earlier of the two, and no request can be issued from the sign-in screen
// in the interval. The guard stays a backstop; it is no longer the mechanism.
//
// ============================================================================
// 360dp, NOT 393 — the panel width is arithmetic, not taste
// ============================================================================
// The whole reason this panel is as wide as it is: <AppearanceSelector /> is a
// three-across segmented control with `flex-1` cells, and this batch does not
// own that file, so it has to be given enough room rather than restyled.
//
//   one cell, minimum:  px-sm x2 (24) + icon 18 + gap-xs 4 + "System" at
//                       label-md (Inter SemiBold 14) ~= 50  ->  96dp
//   three cells:        288dp
//   + its own p-xs x2 (8) + 1px border x2 (2)             ->  298dp of content
//
// So the panel must expose >= 298dp of content width. That forces two decisions:
//
//   * Panel padding is PANEL_PAD = 4 (`spacing/xs`), not 12 — at 12 the content
//     would be `width - 24`, needing a 322dp panel, and 322 does not exist on a
//     360dp screen with 16dp margins (360 - 32 = 328 max panel, 304 content <
//     322). Each ROW carries its own `px-3` (12) instead, so text still has 12dp
//     of inset while the selector gets the panel's full inner width.
//   * MENU_MAX_WIDTH = 320, clamped by `accountMenuWidth()`:
//       360dp device -> min(320, 360 - 32) = min(320, 328) = 320
//                       content = 320 - 8 = 312 >= 298, 14dp of slack
//       393dp canvas -> min(320, 393 - 32) = 320                (identical)
//     A narrower 280 would give 272dp of content, 26dp SHORT — "System" would
//     wrap or clip, on the device, in the one control this panel exists to
//     surface. That is exactly the class of defect the 360dp session was for.
//
// FLAGGED, needs a designed frame (docs/PIPELINE.md §5): at 393 a 320 panel
// leaves 57dp of scrim on its left and reads as a menu. At 360 it leaves 24dp
// and reads as a sheet. Same component, two different affordances, because the
// selector's intrinsic width is a fixed 298 while the screen is not. Either the
// selector gets a compact variant or this becomes a real bottom sheet — that is
// a design call, and the plain build below is the interim.
//
// Right edge sits at `width - MENU_MARGIN` so the panel's right edge lines up
// with the app bar's `px-4` — i.e. with the bell it was opened next to. Vertical
// origin is `insets.top + PATIENT_APP_BAR_HEIGHT + 4`, which is why the Modal is
// `statusBarTranslucent`: without it the Android modal window starts BELOW the
// status bar and the inset would be added twice.
//
// Tokens: every colour is a token (`card-surface`, `outline-variant`, `scrim`,
// `error`/`on-error`, `on-surface`/`on-surface-variant`). Every glyph is the
// shared `<Icon />`. No icon library is imported. The panel carries BRAND's
// sanctioned floating shadow — "a bottom sheet, a menu, a dialog, a toast … may
// use a tight 0 1px 2px / 0 2px 6px pair at <=8%, tinted with the `shadow`
// token" — which is a DIFFERENT role from a card and therefore not the card
// shadow the sweep removed. Every target is >= 44pt (rows are 48).
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-router is used.

import { useContext, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";
import { AppearanceSelector, AvatarWithFallback, Icon } from "@/components/ui";
import { useTokenColor, useTokenShadow } from "@/lib/tokens";
import { PATIENT_APP_BAR_HEIGHT } from "./PatientAppBar";

/**
 * `@/store/auth-store` IS NOT IMPORTED AT MODULE SCOPE, and that is load-bearing.
 *
 * It imports `@/lib/api/client` -> `@/lib/config`, whose `readExtra()` THROWS at
 * require time when `app.config.ts` extras are absent — which they are under
 * Jest. Two suites already carry a `jest.mock("@/store/auth-store", …)` with a
 * comment explaining exactly this. A static import here would put that landmine
 * in the SHELL: `PatientShell` is rendered by ~10 suites across four parallel
 * batches, and every one of them would have to add the same mock to keep
 * passing. That is a bad trade for one function reference.
 *
 * So the store is reached lazily, at press time — the same escape hatch
 * `auth-store.hydrate()` itself uses for the analogous reason. The IDENTITY shown
 * in the panel does not need the store at all: `PatientShell` already receives
 * `avatarLabel` / `avatarUri` / `avatarInitials` from its callers and forwards
 * them, so this component stays presentational and prop-driven.
 *
 * A LAZY `require`, not a lazy `await import()`. Metro handles either, but Jest
 * does not: jest-expo runs specs in a CJS VM, and a dynamic `import()` there
 * fails with "A dynamic import callback was invoked without
 * --experimental-vm-modules" — i.e. `hydrate()`'s pattern is untestable, which is
 * presumably why nothing covers it. `require` is intercepted by `jest.mock` and
 * resolved statically by Metro, so the sign-out path is both real and assertable.
 * The `typeof import(...)` is type-only and erases; nothing is loaded until the
 * user confirms.
 */
async function signOutNow() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuthStore } = require("@/store/auth-store") as typeof import("@/store/auth-store");
  await useAuthStore.getState().signOut();
}

// ============================================================================
// NOW SHARED WITH THE PRACTITIONER SHELL (PO ruling, 2026-08-05)
// ============================================================================
// The PO ruled that the account menu lives on `practitioner-profile`. Until that
// screen existed, a clinician could not sign out or change appearance AT ALL —
// the practitioner app bar has no avatar (PractitionerAppBar's own flag: "the
// avatar is GONE from this bar"), so there was no surface to hang this off, and
// `signOut()` was unreachable for the entire practitioner audience.
//
// This file was NOT copied. Three things were patient-specific and are now
// props, each defaulting to the patient behaviour so `PatientShell` is unchanged:
//
//   profileHref   was the hardcoded `ACCOUNT_MENU_PROFILE_HREF`. The
//                 practitioner passes `null`, which HIDES the Profile row —
//                 correct, because the only screen that opens this menu for a
//                 clinician IS their profile, and a row that navigates to the
//                 screen you are already on is the stutter `goToProfile`'s
//                 `navigate` was chosen to avoid in the first place.
//   anchorTop     was `PATIENT_APP_BAR_HEIGHT`, baked in. The practitioner bar
//                 is a different height and the panel would otherwise float
//                 over or under it.
//   initialView   was always "menu". The practitioner profile draws a
//                 destructive "Sign out" BUTTON (1020:16202), not a menu row,
//                 so it opens straight onto the confirmation — the button IS
//                 the "Sign out" affordance, and making the user press a second
//                 identical one inside a popover would be a maze, not a guard.
//                 The confirmation itself is preserved, which is the guard that
//                 actually matters (see the two-guards note above).
//
// What is NOT parameterised, deliberately: the confirmation copy, the sign-out
// ordering (`router.replace` before `signOut()`), the separation rules, and the
// Appearance block. Those are the reasons this component exists; a second
// audience is not a reason to make them negotiable.
// ============================================================================

/**
 * Where Profile goes FOR A PATIENT. The route exists and, until this menu,
 * nothing linked to it. Kept as a named export because `PatientShell` and its
 * tests assert against it; it is now the DEFAULT of `profileHref`, not the only
 * possible value.
 */
export const ACCOUNT_MENU_PROFILE_HREF = "/(app)/patient-profile-overview" as const;
/** Where sign-out lands. `(app)`'s guard agrees; this navigates there on purpose. */
export const SIGN_OUT_HREF = "/(public)/sign-in" as const;

/** Matches the app bar's `px-4`, so the panel's right edge aligns with the bell. */
const MENU_MARGIN = 16;
/** See the width arithmetic in the header. 320 is the ceiling, not the value. */
const MENU_MAX_WIDTH = 320;
/** `spacing/xs`. Deliberately not 12 — see the header. */
const PANEL_PAD = 4;
/** Gap between the bar's bottom edge and the panel. `spacing/xs`. */
const PANEL_OFFSET = 4;
/** docs/MOBILE_UX.md: 44 is the floor, 48 is "the target to beat". Rows take 48. */
const ROW_HEIGHT = 48;
const GLYPH = 22;
const HEADER_AVATAR = 40;

/**
 * The panel's width for a given screen width.
 *
 * Exported so the 360dp arithmetic in the header is ASSERTABLE rather than a
 * comment — `useWindowDimensions()` under Jest reports the harness's own metrics,
 * not a device's, so the clamp is tested directly at 360 and 393.
 */
export function accountMenuWidth(screenWidth: number): number {
  return Math.min(MENU_MAX_WIDTH, screenWidth - MENU_MARGIN * 2);
}

export interface AccountMenuProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Whose account this is. Forwarded from `PatientShell`'s `avatarLabel`, which
   * screens already set from `useCurrentUser()?.displayName` and which defaults
   * to "Your profile". The identity row exists so that "Sign out" names an
   * account instead of being an anonymous red row.
   */
  accountName?: string;
  avatarUri?: string | null;
  avatarInitials?: string | null;
  /**
   * Where the Profile row goes, or `null` to omit the row entirely.
   *
   * `null` is for a caller that IS the profile — the practitioner profile screen
   * opens this menu, so a "Profile" row there would navigate to itself.
   */
  profileHref?: Href | null;
  /**
   * Distance from the top of the screen (BELOW the safe-area inset, which is
   * added on top of this) at which the panel hangs. Defaults to the patient app
   * bar's height, which is what the patient avatar sits in.
   */
  anchorTop?: number;
  /**
   * Which view opens first. A caller whose own affordance already says "Sign
   * out" passes `"confirm-sign-out"` so the confirmation is the FIRST thing the
   * user sees rather than the second identical button.
   */
  initialView?: MenuView;
}

export type MenuView = "menu" | "confirm-sign-out";

export function AccountMenu({
  visible,
  onClose,
  accountName = "Your account",
  avatarUri,
  avatarInitials,
  profileHref = ACCOUNT_MENU_PROFILE_HREF,
  anchorTop = PATIENT_APP_BAR_HEIGHT,
  initialView = "menu",
}: AccountMenuProps) {
  const [view, setView] = useState<MenuView>(initialView);
  // `useContext(SafeAreaInsetsContext)` — NOT `useSafeAreaInsets()`, which THROWS
  // ("No safe area value available") when there is no `<SafeAreaProvider>` above
  // it. At runtime there always is one, but this component is mounted by
  // `PatientShell` on every patient screen, and the screens' own suites render
  // them raw — six FindCareScreen routing cases went red on exactly this. A shell
  // default must not impose a provider requirement on ~10 suites across four
  // parallel batches; the context accessor returns `null` instead of throwing.
  //
  // A 0 fallback is right rather than a guessed default: with no provider there is
  // no notch to clear, and the only consequence is the panel sitting 0-30dp higher
  // — never off-screen, never under the bar (PATIENT_APP_BAR_HEIGHT still applies).
  const topInset = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const { width } = useWindowDimensions();

  const onSurfaceVariant = useTokenColor("on-surface-variant");
  const error = useTokenColor("error");
  const onError = useTokenColor("on-error");
  // BRAND's floating-surface pair for a MENU (not a card): 0 2px 6px at 8%,
  // tinted with the `shadow` token rather than grey.
  const shadow = useTokenShadow("shadow", { y: 2, blur: 6, opacity: 0.08 });

  // Always reopen on the view the caller asked for, never on a half-finished
  // confirmation. `initialView`, not a literal "menu": a caller that opens
  // straight onto the confirmation must not have a dismissal silently promote it
  // to the full menu the next time its button is pressed.
  const close = () => {
    setView(initialView);
    onClose();
  };

  const goToProfile = () => {
    if (!profileHref) return;
    close();
    // `navigate`, not `push`. PatientShell argues AGAINST `navigate` for TAB
    // switching and that reasoning does not transfer: there the objection is
    // unbounded, non-deterministic stack depth across five peers. Here there is
    // ONE destination and the hazard is the opposite one — Patient Profile
    // Overview renders this same bar, so `push` from it would stack a second
    // copy of the screen the user is already looking at. `navigate` pops back to
    // the existing instance when there is one and pushes when there is not,
    // which is precisely the dedupe wanted. The screen keeps its own back button
    // (`hideBack={false}`), so a push is still the right shape when it happens.
    router.navigate(profileHref);
  };

  const confirmSignOut = () => {
    close();
    // Navigate FIRST — see the header. The guard in (app)/_layout would also
    // redirect, but only after a frame of authenticated UI.
    router.replace(SIGN_OUT_HREF);
    // Then clear the session. The STATE FLIP cannot land before the replace:
    // `signOut()` awaits `secureStorage.clearAll()` before it touches state, so
    // `isAuthenticated` is still true for at least a tick after the line above
    // has already queued the navigation. That is the whole point — the (app)
    // guard never gets to be the thing that moves the user.
    void signOutNow();
  };

  const displayName = accountName.trim() || "Your account";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back / gesture closes the menu instead of leaving the
      // screen behind it. Without this the modal is a trap.
      onRequestClose={close}
      // The Android modal window must start at the very top of the screen, or
      // `insets.top` below is counted twice and the panel lands under the bar.
      statusBarTranslucent
    >
      {view === "menu" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close account menu"
          className="flex-1 bg-scrim/40"
          onPress={close}
        >
          <Pressable
            accessibilityViewIsModal
            accessibilityRole="menu"
            testID="account-menu-panel"
            // `absolute` + right/top anchoring: this is a menu hanging off the
            // avatar, not a centred dialog. The width is arithmetic (header).
            className="absolute rounded-md border border-outline-variant bg-card-surface"
            style={[
              {
                width: accountMenuWidth(width),
                right: MENU_MARGIN,
                top: topInset + anchorTop + PANEL_OFFSET,
                padding: PANEL_PAD,
              },
              shadow,
            ]}
            // A DELIBERATELY EMPTY handler, and it is not dead code: its only job
            // is to make the panel a press responder, which is what stops a tap
            // on the panel from being handled by the dismiss-backdrop underneath.
            //
            // NOT `event.stopPropagation()` — that is a web reflex. RN's touch
            // system has no bubbling phase (the deepest responder wins outright),
            // so the call buys nothing, and `fireEvent.press(node)` passes no
            // event object, so it throws "Cannot read properties of undefined".
            // `LeaveCallDialog` carries the same line; it survives only because
            // nothing presses its card.
            onPress={() => {}}
          >
            {/* Identity. Not a control — it exists so "Sign out" names an
                account rather than being an anonymous red row. */}
            <View className="flex-row items-center gap-3 px-3 py-3">
              <AvatarWithFallback
                size={HEADER_AVATAR}
                uri={avatarUri}
                initials={avatarInitials}
                label={displayName}
                // The panel already announces itself and this row is not
                // focusable; naming the avatar too would repeat the name.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              {/* ON-RAMP TYPE ONLY. `title-sm` / `body-sm` / `label-lg` are NOT
                  keys in tailwind.config.js, and NativeWind drops an unknown
                  utility SILENTLY — the text falls back to RN's default system
                  font at RN's default size, which is how a clinical note once
                  shipped un-styled (docs/PIPELINE.md §5, 2026-07-31). The name is
                  `label-md` (Inter SemiBold 14) and the rows below are `body-md`
                  (16); nothing here is under BRAND's 12sp floor.

                  There is deliberately no EMAIL line. It would need
                  `useCurrentUser()`, i.e. a module-scope `@/store/auth-store`
                  import, which is the one thing this file avoids (see
                  `signOutNow` above). The display name is what the app bar
                  already has, and it is enough to answer "whose session is this?" */}
              <View className="flex-1">
                <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
            </View>

            <View className="h-px bg-outline-variant" />

            {/* Profile — the reason the avatar is a button at all, and the link
                that un-orphans /(app)/patient-profile-overview.

                OMITTED, not disabled, when `profileHref` is null. The
                practitioner profile screen is the only caller that does that,
                and there the row would navigate to itself; a dimmed row would
                imply a destination exists and is temporarily out of reach,
                which is the same half-truth the dimmed nav tabs told. Its
                divider goes with it, or the panel opens on a stray hairline. */}
            {profileHref ? (
              <>
                <Pressable
                  accessibilityRole="menuitem"
                  accessibilityLabel="Profile"
                  onPress={goToProfile}
                  className="flex-row items-center gap-3 rounded-md px-3 active:opacity-70"
                  style={{ minHeight: ROW_HEIGHT }}
                >
                  <Icon chrome="person-outline" size={GLYPH} color={onSurfaceVariant} />
                  <Text className="flex-1 font-body-md text-body-md text-on-surface">Profile</Text>
                  <Icon chrome="chevron-right" size={GLYPH} color={onSurfaceVariant} />
                </Pressable>

                <View className="h-px bg-outline-variant" />
              </>
            ) : null}

            {/* Appearance — the orphaned three-way control, given a home. The
                heading is a plain label, not a SectionHeader: SectionHeader is
                44 tall and belongs OUTSIDE a card (Figma 756:4413), which is the
                wrong role inside a 320dp popover. */}
            <View className="px-3 py-3">
              <Text className="font-label-md text-label-md text-on-surface-variant">
                Appearance
              </Text>
            </View>
            {/* No horizontal padding here on purpose: the selector needs the
                panel's full 312dp of inner width at 360dp (header arithmetic). */}
            <AppearanceSelector />

            <View className="mt-1 h-px bg-outline-variant" />

            {/* Sign out — LAST, below a hairline, after the whole Appearance
                block, and the only `error`-toned row. Separation #1 of the two
                guards; the confirmation below is #2. */}
            <Pressable
              accessibilityRole="menuitem"
              accessibilityLabel="Sign out"
              accessibilityHint="Asks you to confirm first"
              onPress={() => setView("confirm-sign-out")}
              className="mt-1 flex-row items-center gap-3 rounded-md px-3 active:opacity-70"
              style={{ minHeight: ROW_HEIGHT }}
            >
              <Icon chrome="logout" size={GLYPH} color={error} />
              <Text className="flex-1 font-body-md text-body-md" style={{ color: error }}>
                Sign out
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : (
        /* CONFIRM — centred, because a destructive confirmation is not a corner
           popover. Same shape as LeaveCallDialog: cancel FIRST and `outline`,
           destructive second and `error`-filled. `max-w-[361px]` matches it too,
           and at 360dp the `px-4` wrapper caps the card at 360 - 32 = 328 < 361,
           so the constraint that actually binds on the device is the padding,
           and the card never touches the screen edge. */
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close confirmation"
          className="flex-1 items-center justify-center bg-scrim/40 px-4"
          onPress={close}
        >
          <Pressable
            accessibilityViewIsModal
            accessibilityRole="none"
            className="w-full max-w-[361px] rounded-card border border-outline-variant bg-card-surface p-6"
            // Same as the panel above: claims the responder, no stopPropagation.
            onPress={() => {}}
          >
            <Text className="font-headline-md text-headline-md text-on-surface">Sign out?</Text>
            <Text className="mt-3 font-body-md text-body-md text-on-surface-variant">
              You will need to sign in again to reach your records, appointments and messages.
            </Text>
            <View className="mt-6 gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stay signed in"
                // CAUGHT ON DEVICE, 2026-08-06. This used to be a bare
                // `setView("menu")`, which is only correct for a caller that
                // ARRIVED from the menu. For a caller whose `initialView` is
                // "confirm-sign-out" — `SettingsScreen` and
                // `PractitionerProfileScreen`, i.e. both of them — cancelling
                // revealed a full account popover the screen never intended to
                // show, floating over its own content, with a duplicate
                // Appearance control and a second Sign out row. The screenshot
                // showed exactly that stacked over Settings.
                //
                // "Stay signed in" means CANCEL. Where that lands depends on
                // where the user came from: back to the menu if the menu is
                // where the confirmation was raised, otherwise out entirely.
                onPress={() => (initialView === "menu" ? setView("menu") : close())}
                className="min-h-[48px] w-full items-center justify-center rounded-full border border-outline px-4 py-3 active:opacity-70"
              >
                <Text className="font-label-md text-label-md text-on-surface">Stay signed in</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={confirmSignOut}
                // PROVEN ON DEVICE, 2026-08-06: this used to pass a FUNCTION
                // style — `({ pressed }) => ({ backgroundColor: error, opacity
                // … })` — alongside `className`. NativeWind's Pressable wrapper
                // resolves `className` into `style` itself, and the function
                // form was dropped: the fill never painted. The dark capture
                // showed `on-error` dark-red text on the bare card with no pill.
                //
                // It is worse in LIGHT mode, which is why this is a fix and not
                // a polish item: there `on-error` is #FFFFFF, so the label of the
                // one destructive confirm button in the app renders white on
                // `card-surface` — invisible.
                //
                // A plain OBJECT style survives the wrapper (the Text beside it
                // always rendered its colour correctly, which is what isolated
                // the cause), and the press feedback moves to `active:` — the
                // same shape every other Pressable in this file already uses.
                className="min-h-[48px] w-full items-center justify-center rounded-full px-4 py-3 active:opacity-[0.78]"
                style={{ backgroundColor: error }}
              >
                <Text className="font-label-md text-label-md" style={{ color: onError }}>
                  Sign out
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}
