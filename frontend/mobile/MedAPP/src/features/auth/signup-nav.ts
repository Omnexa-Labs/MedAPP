// Navigation helpers shared by the three guarded sign-up wizard routes
// (verify, step 2, step 3).
//
// WHY THIS EXISTS — the defect it fixes:
//   A wizard step can be entered WITHOUT the screens before it ever having been
//   pushed. Three real ways in:
//     1. A deep link / dev-client URL straight onto `/(public)/sign-up-step-2`.
//        Expo Go replays the last URL it opened, and it stores that OUTSIDE the
//        app sandbox — so clearing the app's data (which wipes the auth token,
//        the welcome flag and the in-memory draft) does NOT stop the relaunch
//        from opening the same wizard step. `app/index.tsx`'s entry logic
//        (splash / sign-in / app) is never consulted, because index is not the
//        route being opened.
//     2. A `router.replace()` from a guard, which leaves a single-entry stack.
//     3. A tester or a QA script opening the route directly.
//   In all three the stack has nothing under the current screen, so a bare
//   `router.back()` dispatches GO_BACK to a navigator that cannot handle it and
//   React Navigation surfaces "The action 'GO_BACK' was not handled by any
//   navigator" as a red dev toast, in front of the user.
//
// So a wizard step never assumes it has a history: back is "pop if there is
// something to pop, otherwise REPLACE with the step that logically precedes
// me". Same shape as the detail-screen shells (see PatientAppBar /
// DetailAppBar), which learned this first.
//
// Note this is only for the BACK affordance. The draft guards themselves use
// `<Redirect>` (see the route files) — declarative, so the guarded screen never
// paints before bouncing, and it can never emit GO_BACK.

import { router } from "expo-router";

/**
 * The routes a wizard step is allowed to fall back to. Every one of these is
 * legal from a cold, empty stack: `sign-up` is unguarded, and the other two are
 * only ever used as a fallback from a step whose own guard has already proved
 * the draft state they require.
 */
export type SignupFallbackHref =
  | "/(public)/sign-in"
  | "/(public)/sign-up"
  | "/(public)/sign-up-verify"
  | "/(public)/sign-up-step-2";

/**
 * Pop the stack if there is a stack; otherwise land on `fallback`.
 *
 * `router.canGoBack()` is the only reliable check — expo-router has no "is this
 * a deep-link entry" flag, and the answer differs between a pushed step and a
 * replaced/deep-linked one at runtime.
 */
export function goBackOr(fallback: SignupFallbackHref): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
