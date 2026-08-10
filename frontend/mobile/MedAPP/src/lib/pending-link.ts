// The in-app route a signed-out deep link was trying to reach, held across
// sign-in.
//
// ============================================================================
// THE DEFECT THIS FIXES
// ============================================================================
// A tapped `medapp://post-detail?id=…` matches `src/app/(app)/post-detail.tsx`,
// which mounts `(app)/_layout.tsx` — and that layout `<Redirect>`s to sign-in
// whenever there is no session. The redirect REPLACES the URL, so the id the
// link carried is gone before any screen sees it. The user signs in and lands
// on Home, having never been shown the thing they tapped. Now that shares carry
// links (see @/lib/share-links), that is the single likeliest way a share is
// experienced: a recipient who does not have a session yet.
//
// ============================================================================
// IN MEMORY ONLY, AND THAT IS A DECISION
// ============================================================================
//   * It must not survive a process restart. `src/app/index.tsx` documents the
//     launch-URL behaviour that already resurrects stale entry URLs from the
//     host app's own sandbox; persisting a second copy of the same idea would
//     replay a link days after it was tapped, from a cold app, to a user who
//     has forgotten it.
//   * The href names content someone tried to open. That is not a thing to
//     write to disk on a shared device.
//
// ============================================================================
// IT GRANTS NOTHING
// ============================================================================
// This app previously shipped routes that minted an authenticated session from
// a deep link (the deleted `zp*` files). Nothing here may grow back into that:
// the value stored is a NAVIGATION TARGET, it is replayed only after a real
// sign-in has completed, and `rememberPendingLink` accepts an in-app absolute
// path only — anything with a scheme or a `//host` prefix is refused, so this
// cannot become an open redirect into another app or a web page.

/**
 * One slot, module-scoped. There is no reason to have two pending links: the
 * second tap is the one the user is waiting on.
 */
let pending: string | null = null;

/**
 * Remember where the user was heading.
 *
 * Composes `pathname` and `params` back into an href because that is the shape
 * the router hands them out in — `usePathname()` gives the resolved path with
 * route groups already stripped, and `useGlobalSearchParams()` gives the query.
 *
 * A repeated query key arrives as an array; the first entry wins, matching how
 * every detail screen in this app normalises its own params (a joined array
 * would interpolate as "a,b" and 404).
 *
 * Silently does nothing on anything that is not an in-app absolute path. A
 * refusal here costs the user one redirect to Home; honouring a foreign URL
 * would cost them an open redirect.
 */
export function rememberPendingLink(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {},
): void {
  const path = pathname?.trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) return;
  // A scheme cannot appear after a leading "/", but a path is also not allowed
  // to smuggle one in — belt and braces, because the cost of being wrong is an
  // open redirect and the cost of the check is nothing.
  if (path.includes("://")) return;

  const query = Object.entries(params)
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const)
    .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  pending = query ? `${path}?${query}` : path;
}

/**
 * Take the pending link, if any. ONE SHOT — reading it clears it.
 *
 * That is the whole reason this is a take rather than a get: a link that stayed
 * put would send the user back to the same post every time they signed in.
 */
export function takePendingLink(): string | null {
  const href = pending;
  pending = null;
  return href;
}

/** Drop it unread. For tests, and for a sign-out that must not leave a trail. */
export function clearPendingLink(): void {
  pending = null;
}
