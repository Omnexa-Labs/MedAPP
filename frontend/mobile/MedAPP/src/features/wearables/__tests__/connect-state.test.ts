// Which providers are connected, and the one failure this must never produce.
//
// The load-bearing case: a FAILED fetch must not yield three rows reading "Not
// Connected". That sentence sends a patient to re-pair a watch that is already
// paired, and it is the same defect features/medications/state.ts was written to
// prevent — except here there is a live endpoint, so the failure path is reachable
// in production rather than hypothetical.
//
// The second case is quieter and just as bad: a device whose `provider` string is
// not one of the three the screen knows about must still be SHOWN. Dropping it
// makes the screen silently incomplete, which is harder to notice than being
// visibly wrong.

import {
  deriveConnectState,
  normaliseProvider,
  type DevicesQueryLike,
} from "../connect-state";
import type { WearableDevice } from "../api";

function device(overrides: Partial<WearableDevice> = {}): WearableDevice {
  return {
    id: "d-1",
    provider: "apple_health",
    externalId: "ext-1",
    displayName: "Apple Watch",
    isActive: true,
    lastSyncedAtIso: "2026-08-10T09:00:00.000Z",
    ...overrides,
  };
}

function settled(data: WearableDevice[] | undefined): DevicesQueryLike {
  return { isPending: false, isError: false, error: null, data };
}

describe("a failure never becomes 'not connected'", () => {
  it("reports error, not three disconnected rows, when the query fails", () => {
    const state = deriveConnectState({
      isPending: false,
      isError: true,
      error: { status: 500 },
      data: undefined,
    });
    expect(state.kind).toBe("error");
  });

  it("reports error even when a failed query still holds stale devices", () => {
    // `isError` is tested BEFORE `data`. Stale data on a failed refetch is not an
    // answer about the present.
    const state = deriveConnectState({
      isPending: false,
      isError: true,
      error: { status: 500 },
      data: [device()],
    });
    expect(state.kind).toBe("error");
  });

  it("distinguishes offline from a server failure", () => {
    // ApiError uses status 0 for a network failure — see lib/api/client.ts.
    expect(deriveConnectState({ isPending: false, isError: true, error: { status: 0 }, data: undefined }))
      .toEqual({ kind: "error", offline: true });
    expect(deriveConnectState({ isPending: false, isError: true, error: { status: 503 }, data: undefined }))
      .toEqual({ kind: "error", offline: false });
  });

  it("treats a settled query with NO data as a failure, not an empty list", () => {
    expect(deriveConnectState(settled(undefined)).kind).toBe("error");
  });

  it("reports loading while pending, regardless of data", () => {
    expect(deriveConnectState({ isPending: true, isError: false, error: null, data: [] }).kind).toBe(
      "loading",
    );
  });
});

describe("an empty array IS a real answer", () => {
  it("renders three disconnected rows when the service says there are no devices", () => {
    const state = deriveConnectState(settled([]));
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.rows).toHaveLength(3);
    expect(state.rows.every((row) => !row.connected)).toBe(true);
    expect(state.rows.map((row) => row.label)).toEqual(["Apple Health", "Google Fit", "Fitbit"]);
  });
});

describe("matching a free-text provider", () => {
  it.each(["apple_health", "Apple Health", "APPLE-HEALTH", "applehealth"])(
    "matches %s to the Apple Health row",
    (provider) => {
      const state = deriveConnectState(settled([device({ provider })]));
      if (state.kind !== "ready") throw new Error("expected ready");
      const apple = state.rows.find((row) => row.key === "apple_health");
      expect(apple?.connected).toBe(true);
      // And it did not also invent a fourth row for the same device.
      expect(state.rows).toHaveLength(3);
    },
  );

  it("normalises punctuation and case consistently", () => {
    expect(normaliseProvider("Google Fit")).toBe(normaliseProvider("google_fit"));
    expect(normaliseProvider("FIT-BIT")).toBe("fitbit");
  });

  it("leaves the other rows disconnected", () => {
    const state = deriveConnectState(settled([device({ provider: "fitbit" })]));
    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.rows.find((row) => row.key === "fitbit")?.connected).toBe(true);
    expect(state.rows.find((row) => row.key === "google_fit")?.connected).toBe(false);
  });
});

describe("a provider the screen does not know about", () => {
  it("gets its own row rather than being hidden", () => {
    const state = deriveConnectState(
      settled([device({ provider: "garmin", displayName: "Forerunner 55" })]),
    );
    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.rows).toHaveLength(4);
    const extra = state.rows.find((row) => row.unrecognised);
    expect(extra?.label).toBe("Forerunner 55");
    expect(extra?.connected).toBe(true);
  });

  it("falls back to the provider string when the device has no display name", () => {
    const state = deriveConnectState(settled([device({ provider: "garmin", displayName: null })]));
    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.rows.find((row) => row.unrecognised)?.label).toBe("garmin");
  });

  it("keeps the three known rows in the frame's order, extras after", () => {
    const state = deriveConnectState(settled([device({ provider: "garmin" })]));
    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.rows.slice(0, 3).map((row) => row.key)).toEqual([
      "apple_health",
      "google_fit",
      "fitbit",
    ]);
    expect(state.rows[3].unrecognised).toBe(true);
  });
});

describe("several devices on one provider", () => {
  it("counts them and surfaces the most recently synced", () => {
    const state = deriveConnectState(
      settled([
        device({ id: "old", provider: "fitbit", lastSyncedAtIso: "2026-08-01T00:00:00.000Z" }),
        device({ id: "new", provider: "fitbit", lastSyncedAtIso: "2026-08-09T00:00:00.000Z" }),
      ]),
    );
    if (state.kind !== "ready") throw new Error("expected ready");
    const fitbit = state.rows.find((row) => row.key === "fitbit");
    expect(fitbit?.deviceCount).toBe(2);
    expect(fitbit?.device?.id).toBe("new");
  });

  it("prefers a synced device over one that has never synced", () => {
    const state = deriveConnectState(
      settled([
        device({ id: "never", provider: "fitbit", lastSyncedAtIso: null }),
        device({ id: "synced", provider: "fitbit", lastSyncedAtIso: "2026-08-09T00:00:00.000Z" }),
      ]),
    );
    if (state.kind !== "ready") throw new Error("expected ready");
    expect(state.rows.find((row) => row.key === "fitbit")?.device?.id).toBe("synced");
  });

  it("still reports connected when every device has never synced", () => {
    const state = deriveConnectState(settled([device({ provider: "fitbit", lastSyncedAtIso: null })]));
    if (state.kind !== "ready") throw new Error("expected ready");
    const fitbit = state.rows.find((row) => row.key === "fitbit");
    expect(fitbit?.connected).toBe(true);
    expect(fitbit?.device?.lastSyncedAtIso).toBeNull();
  });
});
