// The one piece of arithmetic in this feature that can be silently wrong.
//
// A summed-instead-of-latest step count renders as a perfectly normal number,
// so every case below is a wrong answer that would not look wrong.

import { dailyTotals, dailyTotalFor, localDayKey } from "../daily";
import type { WearableSample } from "../api";

/** Local-time ISO so the tests exercise the same day boundary the code uses. */
function at(hh: number, mm = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const sample = (over: Partial<WearableSample> = {}): WearableSample => ({
  id: Math.random().toString(36).slice(2),
  deviceId: "watch",
  kind: "steps",
  value: "1000",
  unit: "steps",
  recordedAtIso: at(9),
  syncStatus: "synced",
  syncError: null,
  syncedToEhr: true,
  ehrVitalId: null,
  ...over,
});

describe("dailyTotals — cumulative, latest per device per day", () => {
  it("takes the LATEST reading, it does not add the snapshots up", () => {
    // The whole point. Summing gives 6240; the patient walked 1940.
    const samples = [
      sample({ value: "1200", recordedAtIso: at(8, 15) }),
      sample({ value: "3100", recordedAtIso: at(12, 40) }),
      sample({ value: "1940", recordedAtIso: at(18, 5) }),
    ];
    expect(dailyTotalFor(samples, "steps")?.value).toBe(1940);
  });

  it("is not fooled by out-of-order arrival", () => {
    // Samples can sync late. Latest means latest by TIMESTAMP, not by position.
    const samples = [
      sample({ value: "1940", recordedAtIso: at(18, 5) }),
      sample({ value: "1200", recordedAtIso: at(8, 15) }),
    ];
    expect(dailyTotalFor(samples, "steps")?.value).toBe(1940);
  });

  it("ignores yesterday", () => {
    const samples = [
      sample({ value: "9999", recordedAtIso: at(18, 0, -1) }),
      sample({ value: "1940", recordedAtIso: at(9, 0) }),
    ];
    expect(dailyTotalFor(samples, "steps")?.value).toBe(1940);
  });

  it("sums ACROSS devices, each contributing its own latest", () => {
    const samples = [
      sample({ deviceId: "watch", value: "1000", recordedAtIso: at(8) }),
      sample({ deviceId: "watch", value: "1500", recordedAtIso: at(17) }),
      sample({ deviceId: "band", value: "400", recordedAtIso: at(9) }),
    ];
    const total = dailyTotalFor(samples, "steps");
    expect(total?.value).toBe(1900);
    // Surfaced so a caller can warn: two step-counting devices double-count.
    expect(total?.deviceCount).toBe(2);
  });

  it("keeps each kind separate", () => {
    const samples = [
      sample({ kind: "steps", value: "1940" }),
      sample({ kind: "sleep_minutes", value: "440", unit: "min" }),
    ];
    expect(dailyTotalFor(samples, "steps")?.value).toBe(1940);
    expect(dailyTotalFor(samples, "sleep_minutes")?.value).toBe(440);
  });

  it("SKIPS a non-numeric value rather than coercing it", () => {
    // `Number("122/80")` is NaN. Letting it through renders "NaN" or silently
    // becomes 0 — a blood-pressure reading must not corrupt a step total.
    const samples = [
      sample({ kind: "blood_pressure", value: "122/80", unit: "mmHg" }),
      sample({ value: "1940" }),
    ];
    expect(dailyTotalFor(samples, "blood_pressure")).toBeNull();
    expect(dailyTotalFor(samples, "steps")?.value).toBe(1940);
  });

  it("returns null for a kind with no readings today, not zero", () => {
    // Zero steps is a claim the patient did not move. No data is not that.
    expect(dailyTotalFor([sample({ kind: "steps" })], "sleep_minutes")).toBeNull();
  });

  it("matches kind case-insensitively", () => {
    expect(dailyTotalFor([sample({ kind: "Steps", value: "500" })], "steps")?.value).toBe(500);
  });

  it("uses the LOCAL calendar day, not UTC", () => {
    // A patient in Accra and a server in UTC disagree for part of every day; a
    // count that resets at the wrong hour is a bug the patient can see.
    const local = new Date();
    local.setHours(23, 30, 0, 0);
    expect(localDayKey(local.toISOString())).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`,
    );
  });

  it("reports the newest contributing reading for an as-of line", () => {
    const samples = [
      sample({ value: "1000", recordedAtIso: at(8) }),
      sample({ value: "1940", recordedAtIso: at(18) }),
    ];
    expect(dailyTotalFor(samples, "steps")?.latestAtIso).toBe(at(18));
  });

  it("returns nothing at all for an empty stream", () => {
    expect(dailyTotals([])).toEqual([]);
  });
});
