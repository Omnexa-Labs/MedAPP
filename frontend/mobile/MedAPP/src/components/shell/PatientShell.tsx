// PatientShell — patient app bar + body + patient bottom nav, in one wrapper.
//
// Sibling of PractitionerShell, same shape, different audience. Screens own their
// content, not their chrome (docs/BRAND.md §App shell) — and the reason this
// exists is that they didn't: 24 of 25 feature screens hand-rolled their own top
// bar inline, which is why the product owner sees "the top nav and bottom nav
// deviating". That is not drift, it is 24 independent implementations. One wrap
// replaces each of them.
//
// Composes:
//   PatientAppBar   Figma 101:142   logo LEFT, avatar + bell right
//   BottomNav       Figma 101:143   Home / Overview / Inbox / Community / Lifestyle
//                                   (src/features/home/components/BottomNav.tsx)
//
// LAYOUT NOTE — BottomNav is `absolute bottom-0` and therefore does NOT reserve
// layout space, which is how all 12 of its current callers are written: they pad
// their own ScrollView (`contentContainerStyle={{ paddingBottom: 140 }}`) to
// clear it. That is deliberately preserved here, because changing it would
// silently re-introduce content hidden behind the bar on every one of those
// screens. A migrating screen keeps its bottom padding and just deletes its
// inline bar.
//
// TAB ROUTING lives here too, not in the screens — see PATIENT_TAB_HREFS and
// the push-vs-replace note below. A screen renders `activeTab` (+ `isTabRoot`
// if it is a pushed screen borrowing a tab's highlight) and gets all five tabs
// working; it does not hand-roll an `onTabPress` switch.
//
// Pass `showBottomNav={false}` for a transactional/pushed screen — docs/BRAND.md:
// "Detail screens don't get the bottom nav." Several already do this (booking,
// chat, telehealth), so the shell has to express it rather than force the bar.
// The other half of that sentence — "they get a back button in the app bar
// instead" — is `hideBack={false}`, new in this pass and forwarded to
// PatientAppBar. Both default to the TAB-ROOT position (nav on, back off), so
// no existing caller changes.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. Only expo-status-bar is used.

import { View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, type Href } from "expo-router";
import { useResolvedScheme } from "@/lib/theme";
import { BottomNav, type PatientTab } from "@/features/home/components/BottomNav";
import { PatientAppBar } from "./PatientAppBar";

// ---------------------------------------------------------------------------
// THE TAB MAP — one copy, here, and nowhere else
// ---------------------------------------------------------------------------
// This used to be six independent `onTabPress` switches, one per screen, and
// they disagreed: Overview, Community and Lifestyle omitted `inbox` entirely
// (tapping it silently did nothing), FindCare handled two of five,
// PatientDashboard passed no handler at all so all five were inert, and only
// Home / Inbox / Profile were complete. Uneven coverage is the predictable
// result of writing the same switch six times, so the switch is written once.
//
// A screen may still pass its own `onTabPress` to override — but it should need
// a real reason, and "this is my own tab" is not one (see `isTabRoot`).
/**
 * Where the app bar's avatar goes. Exported for the same reason
 * `PATIENT_TAB_HREFS` is: the suite asserts against the map rather than
 * re-typing the route string, and `SettingsScreen` is the only destination.
 */
export const SETTINGS_HREF = "/(app)/settings" as Href;

export const PATIENT_TAB_HREFS: Record<PatientTab, Href> = {
  home: "/(app)" as Href,
  overview: "/(app)/overview" as Href,
  inbox: "/(app)/inbox" as Href,
  community: "/(app)/community" as Href,
  lifestyle: "/(app)/lifestyle" as Href,
};

// ---------------------------------------------------------------------------
// PUSH vs REPLACE — settled: tab switching REPLACES
// ---------------------------------------------------------------------------
// The three semantics were all in use at once (`push` on Home/Inbox/Community/
// Lifestyle/Profile, `replace` on Inbox's home tab, `back()` on Overview's and
// FindCare's), so the back stack accumulated one entry per tab visited and the
// Android hardware back button walked that history — Home, Community,
// Lifestyle, Overview, Home — instead of leaving the app. Users read that as
// the app refusing to close.
//
// `replace` is the one semantic, everywhere:
//   * A tab root is a ROOT. There is no meaningful "back" from Community to
//     Overview, so the stack should not record one.
//   * It keeps at most one tab root on the stack, so Android back from a tab
//     root exits (or returns to whatever genuinely pushed the app there),
//     which is the platform expectation for a bottom-tab app.
//   * `push` grows the stack without bound. `navigate` pops back to the target
//     when it happens to already be in history and pushes otherwise — same
//     unbounded growth, plus non-deterministic depth, which is worse to reason
//     about than either pure option.
// This is a stand-in until the tabs are promoted to a real `<Tabs>` layout in
// `(app)/_layout.tsx`, which gets these semantics natively (see BottomNav.tsx).

interface Props extends Pick<ViewProps, "testID"> {
  /** Which of the five patient tabs renders as selected. */
  activeTab?: PatientTab;
  /**
   * Override the shared tab routing above. Almost nothing should: the default
   * already covers all five tabs from tab roots AND from pushed screens.
   */
  onTabPress?: (key: PatientTab) => void;
  /**
   * Is this screen the tab root that `activeTab` names?
   *
   * TRUE (the default) for the five roots, and it makes the active tab a no-op
   * — re-navigating to the screen you are already on is a wasted frame.
   *
   * **`false` NOW HAS NO PRODUCT CALLERS, and that is the ruling, not an
   * oversight (2026-08-05).** It existed for "a pushed screen that shows the bar
   * and borrows a tab's highlight" — `find-care`, `patient-dashboard` and
   * `patient-profile-overview`, all rendering `activeTab="home"` without being
   * Home. The PO ruled that pattern out: a screen that is not one of the five
   * tabs may not wear the tab bar, because the bar can only render a lie
   * (docs/PIPELINE.md §5). All three are `DetailShell` screens now, and the
   * highlighted-tab-is-a-dead-button problem this prop solved cannot arise on a
   * screen with no tab bar.
   *
   * Kept, not deleted, and deliberately so: the escape hatch is now the DOOR BACK
   * to the pattern that was ruled out, which is the same argument DetailShell
   * makes for having no `showBottomNav` prop at all. Deleting it is a public-API
   * change and the PO's call — FLAGGED in §5. Until then the only callers are
   * PatientShell's own tests, which lock the behaviour so that a screen passing
   * `false` still gets working tabs rather than a silent no-op.
   */
  isTabRoot?: boolean;
  /** Detail / transactional screens set this false and get a back-bearing bar instead. */
  showBottomNav?: boolean;
  /**
   * Forwarded to PatientAppBar (Figma 741:887 `Back=Hidden | Shown`). DEFAULTS
   * TO TRUE, like the bar: every current caller is a tab root. A pushed patient
   * screen passes `hideBack={false}` — that is the pairing BRAND §App shell
   * describes for a detail screen ("they get a back button in the app bar
   * instead"), usually alongside `showBottomNav={false}`.
   */
  hideBack?: boolean;
  /** Forwarded to PatientAppBar: where back goes when there is nothing to pop. */
  backFallbackHref?: Href;
  /** Forwarded to PatientAppBar: overrides the default `router.back()`. */
  onBackPress?: () => void;
  avatarUri?: string | null;
  avatarInitials?: string | null;
  avatarLabel?: string;
  /**
   * Override what the avatar does. Like `onTabPress`, almost nothing should.
   *
   * THE DEFAULT IS THE ACCOUNT MENU (`AccountMenu`), and it lives here rather
   * than in the screens for the same reason the tab map does: five tab roots
   * render this bar, and the last time shell behaviour was left to per-screen
   * wiring, three of them silently dropped the Inbox tab. Before this, EVERY
   * caller omitted `onAvatarPress` — so the avatar was a dead 44pt control on all
   * 12 patient screens, `signOut()` was unreachable from anywhere in the app,
   * `/(app)/patient-profile-overview` was an orphaned route, and
   * `<AppearanceSelector />` was an orphaned component. One default fixes all
   * four, and no screen can forget it.
   */
  onAvatarPress?: () => void;
  unreadCount?: number;
  onNotificationsPress?: () => void;
  children: React.ReactNode;
}

export function PatientShell({
  activeTab = "home",
  onTabPress,
  isTabRoot = true,
  showBottomNav = true,
  hideBack = true,
  backFallbackHref,
  onBackPress,
  avatarUri,
  avatarInitials,
  avatarLabel,
  onAvatarPress,
  unreadCount,
  onNotificationsPress,
  children,
  testID,
}: Props) {
  const { scheme } = useResolvedScheme();

  // The shared default for the avatar: NAVIGATE to Settings. A screen's own
  // `onAvatarPress` still wins.
  //
  // This used to open `<AccountMenu />` as a popover anchored under the bell.
  // That component carried a flag against itself — at 393dp its 320dp panel
  // reads as a menu, at 360dp as a sheet, because `<AppearanceSelector />` has a
  // fixed 298dp intrinsic width while the screen does not — and the PO's call
  // was a full page. `SettingsScreen` is that page; see its header.
  //
  // `navigate`, not `push`: the same dedupe the menu's Profile row used. Settings
  // is one destination and a user who taps the avatar twice must not stack two
  // copies of it.
  //
  // The menu component is NOT deleted. `PractitionerProfileScreen` still mounts
  // it with `initialView="confirm-sign-out"`, and `SettingsScreen` does the same
  // for its own Sign out row — the confirmation, its copy, and the
  // `router.replace`-before-`signOut()` ordering all still live in one file.
  const handleAvatarPress = onAvatarPress ?? (() => router.navigate(SETTINGS_HREF));

  // The shared default. `onTabPress` wins if a screen supplies one.
  const handleTabPress =
    onTabPress ??
    ((key: PatientTab) => {
      if (isTabRoot && key === activeTab) return;
      router.replace(PATIENT_TAB_HREFS[key]);
    });

  return (
    <View className="flex-1 bg-background" testID={testID}>
      {/* Tokenless by nature: this is the OS status-bar glyph style, not a colour. */}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {/* No "bottom" edge: BottomNav is absolutely positioned and already carries
          its own bottom padding, so claiming the inset here would double it. */}
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* Every bar prop is forwarded. PractitionerShell shipped for a while
            with `onTabPress` declared and never passed down, which made the
            nav's documented escape hatch unreachable — the same class of bug
            here would make back unreachable, so the list is kept exhaustive. */}
        <PatientAppBar
          hideBack={hideBack}
          backFallbackHref={backFallbackHref}
          onBackPress={onBackPress}
          avatarUri={avatarUri}
          avatarInitials={avatarInitials}
          avatarLabel={avatarLabel}
          onAvatarPress={handleAvatarPress}
          // No `avatarExpanded`. The avatar now NAVIGATES; it does not expand a
          // panel, and announcing `expanded: false` for a control that opens a
          // screen would be a false disclosure.
          unreadCount={unreadCount}
          onNotificationsPress={onNotificationsPress}
        />
        <View className="flex-1">{children}</View>
        {showBottomNav ? <BottomNav active={activeTab} onTabPress={handleTabPress} /> : null}
      </SafeAreaView>
    </View>
  );
}
