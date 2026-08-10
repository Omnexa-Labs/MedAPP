// Authenticated route group. Tabs land here once the auth feature is wired.
// For now a plain stack so the placeholder home route renders.
//
// THE GUARD ALSO REMEMBERS WHERE THE USER WAS GOING. A deep link into this
// group (a share — see @/lib/share-links) is matched by the router BEFORE this
// layout decides anything, so a signed-out recipient of a shared post used to
// have their destination replaced by sign-in and lost: they signed in and
// arrived on Home, having never seen the post. `rememberPendingLink` holds the
// target in memory and `(public)/sign-in.tsx` spends it on success. It grants
// nothing — see the header of @/lib/pending-link.

import { Redirect, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { useAuthStore } from "@/store/auth-store";
import { rememberPendingLink } from "@/lib/pending-link";

export default function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  if (!isAuthenticated) {
    // Written during render on purpose, not from an effect: the `<Redirect>`
    // below unmounts this tree immediately, so an effect would be racing its
    // own cleanup. Writing a module slot is idempotent, so a double-invoked
    // render stores the same href twice and nothing else happens.
    rememberPendingLink(pathname, params);
    return <Redirect href="/(public)/sign-in" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
