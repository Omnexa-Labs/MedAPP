// Share links — the URL a share carries, and the rule for when it carries none.
//
// ============================================================================
// THE DEFECT
// ============================================================================
// Every share in this app was TEXT ONLY. `buildPostShareText` produced a
// readable blurb with no URL in it, so a recipient could read a post and had no
// way to OPEN it; the two facility screens shared a name and an address the
// same way. A share is the one thing this app emits that is read outside it,
// and it was emitting the equivalent of a screenshot in words.
//
// ============================================================================
// THE SCHEME IS `medapp://`, AND IT IS THE ONLY ONE THAT WORKS TODAY
// ============================================================================
// `app.config.ts` declares `scheme: "medapp"`, so `Linking.createURL` resolves
// against it and expo-router routes the result off the file tree with no
// linking config to write (SDK 55 — https://docs.expo.dev/versions/v55.0.0/sdk/linking).
// A custom scheme opens the app when the app is installed on the device the
// link is tapped on, and does nothing at all otherwise. That is the honest
// limit of what ships here.
//
// There is deliberately NO `https://` link. Universal Links and App Links need
// an `apple-app-site-association` and an `assetlinks.json` served over HTTPS
// from a domain we control, each naming the bundle ids in `app.config.ts` — and
// no such hosting exists: `api.medapp.dev` is the API, `partners.medapp.dev` is
// the partner console, neither serves those files and nothing in this repo
// generates them. An `https://medapp.dev/post/…` link would be precisely the
// invented URL this file exists to stop, and worse than the text-only share it
// replaced, because it 404s in public where people can see it.
//
// ============================================================================
// NO LINK IS RETURNED WHEN THE LINK WOULD BE A LIE
// ============================================================================
// `createURL` returns whatever the RUNTIME can be reached at, not what the
// store build can: in Expo Go that is `exp://192.168.x.x:8081/--/post-detail`,
// a LAN address that resolves on one developer's machine, and on web it is a
// `localhost` URL. Both are dead links the moment they leave the device. So the
// URL is checked against the app's own configured scheme and DROPPED when it
// does not match — in Expo Go and on web the shares stay text-only, exactly as
// they were.
//
// ============================================================================
// WHAT MAY GO IN A LINK
// ============================================================================
// Resource ids, and nothing else. This app previously shipped deep-link routes
// that granted an authenticated session (the deleted `zp*` files). Nothing here
// carries a token, a session, a patient id or any other identifier for a
// PERSON: each builder takes one opaque resource id, the parameter name is
// fixed by the table below, and there is deliberately no general
// "put-these-params-in-a-link" helper for a later edit to reach for.

import Constants from "expo-constants";
import * as Linking from "expo-linking";

/**
 * The things a link may point at.
 *
 * Membership of this union is a claim about the DESTINATION, not about the
 * sharing screen: each route below loads from its id alone, against a cold
 * cache, with an empty navigation stack. Anything that needs prior app state to
 * render is absent on purpose — see `shareAppointment` in
 * BookingConfirmedScreen, which stays link-free because there is no
 * id-addressable appointment route for it to point at.
 */
export type ShareTarget =
  | { kind: "post"; id: string }
  | { kind: "hospital"; id: string }
  | { kind: "pharmacy"; id: string };

/**
 * Route path and query key per kind.
 *
 * The paths carry no `(app)` segment: parentheses mark a route GROUP in
 * expo-router and groups are not part of the URL, so `src/app/(app)/post-detail.tsx`
 * is reached at `/post-detail`.
 *
 * Each one was checked for cold-start resolution before it was added here:
 *   post      `id`          -> useQuery(GET /v1/social/posts/{id})
 *   hospital  `hospitalId`  -> useHospital(GET /v1/hospitals/{id})
 *   pharmacy  `pharmacyId`  -> usePharmacy(GET /v1/pharmacies/{id})
 * All three are single-resource GETs, all three screens read the param through
 * `useLocalSearchParams` and render a not-found panel on 404, and none of them
 * reads a list cache to find its record.
 */
const ROUTE: Record<ShareTarget["kind"], { path: string; param: string }> = {
  post: { path: "/post-detail", param: "id" },
  hospital: { path: "/hospital-detail", param: "hospitalId" },
  pharmacy: { path: "/pharmacy-detail", param: "pharmacyId" },
};

/**
 * The scheme `app.config.ts` declares, or null.
 *
 * `expo.scheme` is typed as a string OR an array of them, and the first entry
 * is the one `createURL` resolves to. Null when there is no manifest at all,
 * which is the case under Jest and on any bare host — and null means no link,
 * never a guessed one.
 */
function configuredScheme(): string | null {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

/**
 * A deep link to `target`, or null when we cannot promise one resolves.
 *
 * Null on: a blank id, no configured scheme, and — the case that matters — a
 * URL the runtime built on some other scheme (`exp://`, `http://localhost`).
 * Callers treat null as "share the text without a link"; nobody substitutes a
 * generic app link, because a link that opens the wrong screen is a worse
 * answer than a share with no link in it.
 */
export function shareLinkFor(target: ShareTarget): string | null {
  const id = target.id?.trim();
  if (!id) return null;

  const scheme = configuredScheme();
  if (!scheme) return null;

  const route = ROUTE[target.kind];
  try {
    const url = Linking.createURL(route.path, { queryParams: { [route.param]: id } });
    // `parse`, not `startsWith`: the scheme has to BE ours, not merely be the
    // prefix of a host that happens to begin with the same letters.
    if (Linking.parse(url).scheme !== scheme) return null;
    return url;
  } catch {
    // `createURL` throws on a manifest it cannot resolve a scheme from. A share
    // must not fail because of that — it falls back to the text it always was.
    return null;
  }
}

/**
 * The line a share body puts the link on, or null.
 *
 * "Open in MedApp:" and not a bare URL, because a `medapp://` link renders in a
 * chat as an unclickable oddity for anyone without the app installed, and the
 * prefix is what tells them why.
 */
export function shareLinkLine(target: ShareTarget): string | null {
  const url = shareLinkFor(target);
  return url ? `Open in MedApp: ${url}` : null;
}
