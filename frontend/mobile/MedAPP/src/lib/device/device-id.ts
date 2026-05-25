import { secureStorage } from "@/lib/storage/secure-storage";

// Stable per-install device identifier.
//
// Generated once on first launch, persisted in SecureStore, and sent
// to the backend as `X-Device-Id` on every request. The backend binds
// refresh tokens to this id (biometric Step 2) — a token exfiltrated
// from a backup cannot be replayed from a different install because
// the request also has to present the matching device id.
//
// Notes on the choice:
//   - NOT the hardware id (iOS identifierForVendor / Android ANDROID_ID).
//     Hardware ids carry privacy concerns and tie to the physical
//     device, which means a fresh reinstall keeps the same id. We want
//     the opposite: reinstall = new install = new id.
//   - Generated via Math.random because the bits don't need to be
//     cryptographically random — uniqueness per-install on this device
//     is the whole bar. If a future native crypto dep lands (e.g.
//     expo-crypto), swap the generator below without changing the
//     consumer surface.

let cached: string | null = null;
let inflight: Promise<string> | null = null;

function generateUuidV4(): string {
  // RFC 4122 v4 layout, populated from Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the device id, generating + persisting one on first call.
 * Subsequent calls reuse the cached value (no SecureStore round-trip).
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const existing = await secureStorage.getDeviceId();
      if (existing) {
        cached = existing;
        return existing;
      }
      const fresh = generateUuidV4();
      await secureStorage.setDeviceId(fresh);
      cached = fresh;
      return fresh;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Synchronous accessor for the cached id. Returns null if `getDeviceId`
 * has not been awaited yet. The api client's header provider uses this
 * — if it returns null on the first request, that request goes without
 * the header (legacy path on the backend). The hydrate step in
 * `_layout.tsx` calls `getDeviceId()` once at startup so the cache is
 * warm by the time anything important happens.
 */
export function getDeviceIdCached(): string | null {
  return cached;
}
