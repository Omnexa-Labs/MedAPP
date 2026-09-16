// The width ceiling for the app on the web.
//
// ===========================================================================
// THE PROBLEM THIS SOLVES
// ===========================================================================
// Every layout in this app is written for a phone, and until this file existed
// nothing in the codebase set a `maxWidth` on anything except the account-menu
// dialog. On react-native-web that is not a neutral omission — a `flex-1` column
// takes the whole viewport, so at 1900px:
//
//   * the Quick Services grid spread its six tiles across the full width with
//     ~250px of dead space between them, because the row is `justify-between`
//     and was obediently justifying against 1900px;
//   * the bottom nav stretched its five tabs edge to edge, so the tab bar read as
//     a page footer rather than as a nav;
//   * every card ran the full width of the monitor, and body text set at a
//     phone's measure became an unreadable single line.
//
// None of those are bugs in the screens. They are the screens working correctly
// against a viewport nobody constrained.
//
// ===========================================================================
// WHY THIS IS ONE COMPONENT IN THREE SHELLS, NOT SIXTY SCREEN EDITS
// ===========================================================================
// Every screen in the app renders inside PatientShell, PractitionerShell or
// DetailShell. Constraining the column in those three places fixes all of them at
// once — including screens not written yet — and there is no way for a new screen
// to opt out by forgetting to add something.
//
// It wraps the APP BAR AND THE NAV as well as the content, not just the content.
// Constraining only `children` would leave a full-width bar and a full-width tab
// row bracketing a narrow column, which looks more broken than the stretch did.
// BottomNav is absolutely positioned, so being inside this View is also what
// scopes its `left: 0 / right: 0` to the column instead of to the viewport.
//
// ===========================================================================
// WEB ONLY, DELIBERATELY
// ===========================================================================
// On native this renders NOTHING — no wrapper View, no layout change, no risk to
// the phone layouts that are already correct. That is a `Platform.OS` check rather
// than relying on the max-width being a no-op, because it is only a no-op on
// handsets: an iPad or a foldable is wider than the ceiling, and quietly
// re-centring the native tablet layout is a change nobody asked for. If tablets
// should get the same treatment later, drop the check — the constant is shared.

import type { ReactNode } from "react";
import { Platform, View } from "react-native";

/**
 * The column width, in px.
 *
 * 480 rather than a `ch`/`rem` measure because every layout inside it is written
 * in px against a phone: the design frames render at 390–430px wide, so 480 gives
 * the intended composition a little air without letting any row reflow into a
 * shape the design never specified.
 */
export const WEB_COLUMN_MAX_WIDTH = 480;

/**
 * Centres the app in a phone-width column on the web; a no-op on native.
 *
 * `w-full` with a `maxWidth` (rather than a fixed `width`) is what keeps a narrow
 * browser window — or a phone-sized one — full-bleed: the column only starts
 * centring once there is more room than it needs.
 */
export function WebColumn({ children }: { children: ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View
      className="w-full flex-1 self-center"
      style={{ maxWidth: WEB_COLUMN_MAX_WIDTH }}
      testID="web-column"
    >
      {children}
    </View>
  );
}
