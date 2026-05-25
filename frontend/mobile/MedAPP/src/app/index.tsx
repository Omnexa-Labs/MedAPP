// Entry route. Picks the right tree based on hydrated state.
// - First launch (no welcome flag): → splash
// - Authenticated: → app home
// - Otherwise: → sign in (which itself routes to splash if the user hits "back")
//
// We read from stores synchronously here because root _layout.tsx blocks the
// first paint until hydration completes.

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
