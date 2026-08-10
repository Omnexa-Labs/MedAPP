// The four handoffs a facility screen makes to another app: dial, mail, web,
// maps. Shared by `hospital-detail` and `pharmacy-detail`.
//
// WHY A MODULE AND NOT A COPY IN EACH SCREEN. `openDirections` is the one with
// real logic — a native-scheme attempt with a web fallback and a DOUBLE catch —
// and it already exists twice in this app (ReviewAppointmentScreen has the
// canonical version). A third and fourth copy is how the two facility screens
// end up disagreeing about what happens when no maps app is installed. The
// three trivial ones live here too so the call sites read the same way.
//
// NOTHING HERE THROWS. `Linking.openURL` REJECTS when no installed app claims
// the scheme — a phone-less tablet has no `tel:` handler, a device with no mail
// client has no `mailto:` handler — and an unhandled rejection inside an
// onPress takes the screen down. Every function swallows and resolves. The
// address, the number and the address are all on screen as selectable text,
// which is the fallback that always works; a toast on top of that is noise.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API
// here. `Linking` is react-native's own, NOT `expo-linking` — the app imports
// no `expo-linking` anywhere and this file does not introduce it.

import { Linking, Platform } from "react-native";

/**
 * Strip everything a dialler cannot use. Ghanaian numbers arrive as
 * "+233 30 222 8382"; `tel:` wants "+233302228382".
 */
function toDialString(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export async function dialPhone(phone: string): Promise<void> {
  const target = toDialString(phone);
  if (!target) return;
  try {
    await Linking.openURL(`tel:${target}`);
  } catch {
    // No dialler. The number is on screen.
  }
}

export async function sendEmail(email: string): Promise<void> {
  if (!email.trim()) return;
  try {
    await Linking.openURL(`mailto:${email.trim()}`);
  } catch {
    // No mail client. The address is on screen.
  }
}

/**
 * Open a facility's website. The column is free text and a hospital that typed
 * "ridgehospital.gh" has not typed a URL — `openURL` on a schemeless string
 * either does nothing or resolves as a relative path, so the scheme is added
 * when it is absent. `https`, not `http`: an upgrade that fails loudly beats a
 * downgrade that silently sends a patient over plaintext.
 */
export async function openWebsite(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  const target = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    await Linking.openURL(target);
  } catch {
    // No browser, or the string was not a URL at all.
  }
}

/**
 * Hand a postal address to the platform's maps app, falling back to Google Maps
 * on the web.
 *
 * The address is used rather than the `latitude`/`longitude` columns even
 * though hospitals carry both: a named address resolves to the building's own
 * map entry (with its hours and its phone), whereas a bare coordinate drops a
 * pin in a car park. It is also the only option for pharmacies in practice,
 * since their lat/lng are as nullable as everything else.
 */
export async function openDirections(address: string, placeName?: string): Promise<void> {
  if (!address.trim()) return;
  const query = encodeURIComponent(placeName ? `${placeName}, ${address}` : address);
  const nativeUrl = Platform.select({
    ios: `maps://?daddr=${query}`,
    android: `geo:0,0?q=${query}`,
    default: "",
  });
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  try {
    const canOpenNative = nativeUrl ? await Linking.canOpenURL(nativeUrl) : false;
    await Linking.openURL(canOpenNative && nativeUrl ? nativeUrl : webUrl);
  } catch {
    try {
      await Linking.openURL(webUrl);
    } catch {
      // Both handoffs refused. The address is on screen as text.
    }
  }
}

/**
 * "12 Ridge Road, Osu · Accra, Ghana" from three nullable columns, or null when
 * every one of them is empty. Returning null rather than "" is what lets a
 * caller drop the whole Address row instead of rendering a labelled blank.
 */
export function composeAddress(
  addressLine1: string | null,
  city: string | null,
  country: string | null,
): string | null {
  const locality = [city, country].filter((s): s is string => !!s && s.trim() !== "").join(", ");
  const parts = [addressLine1?.trim() || null, locality || null].filter(
    (s): s is string => s !== null,
  );
  return parts.length ? parts.join(" · ") : null;
}
