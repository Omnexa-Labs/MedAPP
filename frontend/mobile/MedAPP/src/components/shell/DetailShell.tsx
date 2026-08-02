// DetailShell — safe area + DetailAppBar + body, in one wrapper. No bottom nav.
//
// The third shell, and the sibling of PatientShell and PractitionerShell: same
// shape (a `flex-1` body between chrome the screen does not own), same StatusBar
// handling, same forwarding discipline. Screens own their content, not their
// chrome — docs/BRAND.md §App shell.
//
// WHY IT EXISTS — measured, not assumed. 16 screens render DetailAppBar and every
// one of them hand-rolls the wrapper around it. The bar was extracted; the thing
// the bar sits in was not, so the improvisation just moved up one level:
//
//   StatusBar   11 hardcode `style="dark"` (booking x3, chat x2, lifestyle,
//               practitioner profiles x2, scripts x2, waiting room) — a value
//               frozen to one mode in an app with a first-class dark mode, so a
//               dark-mode user gets dark glyphs on a near-black bar.
//               2 pass `style="auto"` (medications x2), 2 resolve it from the
//               scheme the way the other two shells do (AppointmentManagement,
//               PatientRecord), and 1 renders no StatusBar at all
//               (ActivePatientRoster2).
//   edges       10 pass ["top","left","right"], 6 pass ["top","left","right",
//               "bottom"]. Both spellings are on screens with and without a
//               pinned footer, so the split is drift, not intent — see below.
//   bottom nav  4 render <BottomNav> under the detail bar
//               (PractitionerSocialProfile, PractitionerTelehealthProfile,
//               ActiveScriptShare, ActiveScriptView), which docs/BRAND.md
//               §App shell forbids outright: "Detail screens don't get the
//               bottom nav — they get a back button in the app bar instead."
//               193:120's own Figma description repeats it: "Detail screens must
//               NOT show the bottom tab bar."
//
// NO BOTTOM NAV, AND NOT AS A PROP. PatientShell has `showBottomNav` because it
// serves tab roots and detail screens both, so it has to be able to express
// either. This shell serves only detail screens, where the absence of the nav is
// the defining property — so it is structural here, not configurable. Adding a
// `showBottomNav` prop would re-open exactly the door the four screens above
// walked through. A detail screen that turns out to need tabs is not a detail
// screen and wants PatientShell.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
//
// STATUS BAR — resolved from the active scheme via `useResolvedScheme()`, the
// same one line PatientShell and PractitionerShell already use. Deliberately not
// a second mechanism and deliberately not a prop: `style="dark"` on 11 screens is
// the drift being removed, and a prop would let it back in one screen at a time.
// `style="auto"` (the medications screens) is not equivalent — it follows the OS
// scheme, whereas this app's scheme is a user preference that can be "light" on a
// dark-mode phone (src/lib/theme.ts), so `auto` is wrong there too, just less
// visibly.
//
// SAFE-AREA EDGES — the default is all four, ["top","left","right","bottom"].
// The two existing shells omit "bottom" for one concrete reason: a bottom nav is
// sitting in that inset and claims it itself (PatientShell's BottomNav is
// `absolute bottom-0`, PractitionerBottomNav pads the inset internally so its
// `surface` fill runs under the gesture bar). This shell has no bottom nav, so
// nothing is there to claim it, and content would otherwise run under the gesture
// bar. The 10 screens currently passing ["top","left","right"] fall into two
// groups and neither contradicts the default: 4 omit "bottom" only because they
// render the forbidden BottomNav (it goes away, so they need the inset back), and
// the rest pin something to the bottom edge themselves — the case the override
// below exists for.
//
// `claimsBottomInset={false}` is that override, and it is narrow on purpose. Real
// screens that force it, named as required:
//
//   SelectTimeSlotScreen        an absolutely-positioned action bar that renders
//                               its OWN `<SafeAreaView edges={["bottom"]}>` so
//                               the bar's fill runs under the gesture bar. If the
//                               shell also claimed the inset the padding doubles.
//   ChatThreadScreen            composer pinned to the bottom under a
//   AiAssistantScreen           KeyboardAvoidingView. A static bottom pad here
//                               stays put when the keyboard opens, leaving a
//                               ~34px gap between composer and keyboard.
//   PractitionerTelehealthPro-  sticky "Book Appointment" CTA at `absolute
//   fileScreen                  bottom`, which must handle its own inset for the
//                               same reason as SelectTimeSlot.
//
// A screen passing `claimsBottomInset={false}` is asserting it handles the bottom
// inset itself. It is a boolean rather than an `edges` array because top/left/
// right are never in question, and an array escape hatch is how the 10-vs-6 split
// above happened in the first place.
//
// KEYBOARD — the shell does NOT wrap children in a KeyboardAvoidingView, and the
// two composer screens keep theirs. Three reasons:
//   1. Placement matters. The KAV must sit BELOW the app bar and wrap the scroll
//      area plus the composer; a KAV above the bar lifts the bar off the top of
//      the screen when the keyboard opens. The shell cannot place it correctly
//      from the outside without also owning the composer.
//   2. It is 2 of 16 screens, and the other 14 have no focusable bottom-pinned
//      input. `behavior="padding"` on a plain ScrollView screen is not free — it
//      resizes the container on every keyboard event.
//   3. The two that need it already differ in configuration (ChatThreadScreen
//      passes `keyboardVerticalOffset={0}` explicitly, AiAssistantScreen passes
//      none), so a single shell-level setting would have to be overridable
//      anyway, at which point it is the screen's decision spelled longer.
// The `flex-1` body accepts a KeyboardAvoidingView as its direct child, which is
// exactly the shape both screens already have — migration is deleting the
// SafeAreaView/StatusBar around them, not touching the KAV.
//
// PROP FORWARDING — every DetailAppBar prop reaches the bar, enforced by the type
// rather than by a hand-kept list: the props interface `extends
// Omit<DetailAppBarProps, "testID">` and the bar receives the rest object, so a
// prop added to DetailAppBar tomorrow is forwarded without editing this file.
// That shape was chosen because the hand-kept list is what failed before —
// PractitionerShell declared `onTabPress`, never passed it down, and the nav's
// documented escape hatch was unreachable while the caller read as correct. A
// swallowed prop is worse than a missing one. DetailShell.test.tsx asserts each
// current prop lands on the bar, and asserts the key sets match.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// Only expo-status-bar is used.

import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useResolvedScheme } from "@/lib/theme";
import { DetailAppBar, type DetailAppBarProps } from "./DetailAppBar";

/**
 * Exported so a test — and a reviewer — can read the default off the component
 * instead of re-deriving it, and so the override is visibly the same list minus
 * one entry rather than a second opinion about the top/side edges.
 */
export const DETAIL_SHELL_EDGES: readonly Edge[] = ["top", "left", "right", "bottom"];
const DETAIL_SHELL_EDGES_WITHOUT_BOTTOM: readonly Edge[] = ["top", "left", "right"];

interface Props extends Omit<DetailAppBarProps, "testID">, Pick<ViewProps, "testID"> {
  /**
   * False when the screen pins something to the bottom edge and claims the inset
   * itself — a composer under a KeyboardAvoidingView, or a docked action bar with
   * its own `<SafeAreaView edges={["bottom"]}>`. See the named screens above.
   * Defaults to true: a detail screen has no bottom nav filling that space.
   */
  claimsBottomInset?: boolean;
  /** Separate from the shell's own `testID`, which lands on the root view. */
  appBarTestID?: string;
  children: React.ReactNode;
}

export function DetailShell({
  claimsBottomInset = true,
  appBarTestID,
  children,
  testID,
  // Everything else is a DetailAppBar prop, by the type above. Rest-spread so the
  // forwarding cannot silently fall behind the bar's API.
  ...appBarProps
}: Props) {
  const { scheme } = useResolvedScheme();

  return (
    <View className="flex-1 bg-background" testID={testID}>
      {/* Tokenless by nature: this is the OS status-bar glyph style, not a colour. */}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <SafeAreaView
        className="flex-1"
        edges={
          claimsBottomInset
            ? (DETAIL_SHELL_EDGES as Edge[])
            : (DETAIL_SHELL_EDGES_WITHOUT_BOTTOM as Edge[])
        }
      >
        <DetailAppBar {...appBarProps} testID={appBarTestID} />
        <View className="flex-1">{children}</View>
        {/* No bottom nav. Structural, not a prop — see the header. */}
      </SafeAreaView>
    </View>
  );
}
