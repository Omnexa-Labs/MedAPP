// Entry route. Picks the right tree based on hydrated state.
// - First launch (no welcome flag): → splash
// - Authenticated: → app home
// - Otherwise: → sign in (which itself routes to splash if the user hits "back")
//
// We read from stores synchronously here because root _layout.tsx blocks the
// first paint until hydration completes.
//
// THIS ROUTE IS NOT A CHOKE POINT — do not treat it as one.
// A launch can bypass it entirely, and a real device session proved it: clear
// the app's data, relaunch, and the app came up on `/(public)/sign-up-step-2`
// instead of splash. The cause is NOT expo-router state restoration — neither
// expo-router nor React Navigation persists navigation state to disk here (no
// `persistNavigationState`, no restoration key anywhere in this tree), so there
// is nothing app-side to switch off. It is the LAUNCH URL: Expo Go (and a dev
// client) reopens the last URL it was pointed at, and it stores that in its own
// sandbox, not ours. Clearing MedApp's data wipes the auth token, the welcome
// flag and the in-memory sign-up draft — and leaves the pending link intact. A
// production build has the same shape via any `medapp://` / universal deep link.
//
// So when the entry URL is a route rather than `/`, this component never
// mounts and the splash / sign-in / app decision below is never made. Every
// guarded route therefore has to be correct on its own, from a cold start with
// an EMPTY navigation stack: guard with `<Redirect>` (never a post-paint
// effect), and never dispatch `back()` without `canGoBack()`. See
// src/features/auth/signup-nav.ts for the wizard's implementation of that rule.

import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/auth-store";
import { useWelcomeStore } from "@/store/welcome-store";

export default function Index() {
  const hasSeenWelcome = useWelcomeStore((s) => s.hasSeenWelcome);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!hasSeenWelcome) return <Redirect href="/(public)/splash" />;
  if (isAuthenticated) return <Redirect href="/(app)" />;
  return <Redirect href="/(public)/sign-in" />;
}
