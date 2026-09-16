// Which providers are connected, derived in ONE place.
//
// ===========================================================================
// THIS FILE EXISTS TO MAKE THE SAME BUG features/medications/state.ts PREVENTS
// ===========================================================================
// The frame draws three rows — Apple Health, Google Fit, Fitbit — each reading
// "Not Connected". The obvious wiring is
//
//     const devices = useQuery(...).data ?? [];
//     const connected = devices.some(d => d.provider === "apple_health");
//
// and that turns a 500 into three rows confidently reading "Not Connected". The
// patient concludes their watch was never paired, goes and re-pairs it, and the
// whole time the service was down and the record was intact.
//
// So this takes the QUERY OBJECT, tests `isError` BEFORE it looks at `data`, and
// has no branch that can produce a per-provider verdict from a failure. The
// screen switches on `kind` and never asks "is this provider in the array".
//
// ===========================================================================
// `provider` IS FREE TEXT ON THE WIRE
// ===========================================================================
// `WearableDevice.provider` is typed `string`, not a union, and api.ts warns the
// same thing about `WearableSample.kind`: "Do not switch on it exhaustively."
// Matching is therefore normalised (lowercased, non-alphanumerics stripped) so
// "Apple Health", "apple_health" and "apple-health" all land on the same row.
//
// And crucially, a device whose provider matches NONE of the three known rows is
// still SHOWN — as its own row, under whatever name the backend gave it. Hiding a
// device the patient really has connected, because this file did not recognise the
// string, would be a worse lie than the one above: the screen would be silently
// incomplete rather than visibly wrong.

import type { WearableDevice } from "./api";

/** The providers the frame gives a row of their own, in its order. */
export const KNOWN_PROVIDERS = [
  { id: "apple_health", label: "Apple Health" },
  { id: "google_fit", label: "Google Fit" },
  { id: "fitbit", label: "Fitbit" },
] as const;

export type KnownProviderId = (typeof KNOWN_PROVIDERS)[number]["id"];

/** `"Apple Health"` / `"apple-health"` / `"APPLE_HEALTH"` -> `"applehealth"`. */
export function normaliseProvider(provider: string): string {
  return provider.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** One row on the screen: a provider, and the device backing it if there is one. */
export type ProviderRow = {
  /** Stable key. The known id, or the normalised provider for an unknown one. */
  key: string;
  label: string;
  /** True when the backend reports at least one device for this provider. */
  connected: boolean;
  /**
   * The connected device, when there is exactly one. `undefined` when none.
   *
   * When a provider has SEVERAL devices this is the most recently synced one, and
   * `deviceCount` says how many there are — a patient with two Fitbits should not
   * see one of them silently dropped.
   */
  device?: WearableDevice;
  deviceCount: number;
  /** True for a provider the frame does not draw, surfaced because it is real. */
  unrecognised: boolean;
};

export type ConnectState =
  | { kind: "loading" }
  /** A real failure. No per-provider verdict is available, and none is invented. */
  | { kind: "error"; offline: boolean }
  /** The service answered. Rows are trustworthy, including the disconnected ones. */
  | { kind: "ready"; rows: readonly ProviderRow[] };

/** The shape read off a `UseQueryResult`, declared structurally so a test can pass a literal. */
export interface DevicesQueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: readonly WearableDevice[] | undefined;
}

export function deriveConnectState(query: DevicesQueryLike): ConnectState {
  if (query.isPending) return { kind: "loading" };
  // BEFORE `data`. A failed query may hold stale or absent data, and neither is
  // "nothing is connected".
  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status;
    return { kind: "error", offline: status === 0 };
  }
  // Settled, not errored, and nothing came back at all. That is a failure too —
  // an empty ARRAY is a valid "no devices", but `undefined` is not an answer.
  if (!query.data) return { kind: "error", offline: false };
  return { kind: "ready", rows: buildRows(query.data) };
}

/** Most recently synced first; a never-synced device sorts last. */
function mostRecentlySynced(devices: readonly WearableDevice[]): WearableDevice {
  return devices.reduce((best, candidate) => {
    if (!candidate.lastSyncedAtIso) return best;
    if (!best.lastSyncedAtIso) return candidate;
    return candidate.lastSyncedAtIso > best.lastSyncedAtIso ? candidate : best;
  }, devices[0]);
}

function buildRows(devices: readonly WearableDevice[]): readonly ProviderRow[] {
  const byProvider = new Map<string, WearableDevice[]>();
  for (const device of devices) {
    const key = normaliseProvider(device.provider);
    const existing = byProvider.get(key);
    if (existing) existing.push(device);
    else byProvider.set(key, [device]);
  }

  const rows: ProviderRow[] = KNOWN_PROVIDERS.map(({ id, label }) => {
    const matched = byProvider.get(normaliseProvider(id)) ?? [];
    byProvider.delete(normaliseProvider(id));
    return {
      key: id,
      label,
      connected: matched.length > 0,
      device: matched.length > 0 ? mostRecentlySynced(matched) : undefined,
      deviceCount: matched.length,
      unrecognised: false,
    };
  });

  // Whatever is left is a real, connected device this file does not have a row
  // for. It gets one, labelled with the device's own name where it has one.
  for (const [key, matched] of byProvider) {
    const device = mostRecentlySynced(matched);
    rows.push({
      key,
      label: device.displayName ?? device.provider,
      connected: true,
      device,
      deviceCount: matched.length,
      unrecognised: true,
    });
  }

  return rows;
}
