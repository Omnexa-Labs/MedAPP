// Turning a wearable SAMPLE STREAM into the daily figures the Lifestyle screen
// shows ("Steps Today 6,240").
//
// ---------------------------------------------------------------------------
// THE RULE, AND WHOSE RULE IT IS
// ---------------------------------------------------------------------------
// PO ruling 2026-08-07: **readings are CUMULATIVE — take the latest per device
// per day.**
//
// That is not something the contract states. `wearable_sync_service` stores
// `{kind, value, recorded_at}` and offers no daily endpoint, so a client that
// SUMS the samples would report 6,240 steps for a watch that had walked 1,940
// — three cumulative snapshots added together. The number would look entirely
// normal and nothing would flag it, which is exactly why this was asked rather
// than guessed.
//
// It lives here as a pure function, not inline in a screen, because it is the
// one piece of arithmetic in the feature that can be silently wrong.
//
// ---------------------------------------------------------------------------
// LOCAL DAY, NOT UTC
// ---------------------------------------------------------------------------
// "Today" means the patient's calendar day. A server in UTC and a patient in
// Accra disagree for part of every day, and a step count that resets at the
// wrong hour is a bug the patient can see.
//
// ---------------------------------------------------------------------------
// MULTIPLE DEVICES: SUMMED, AND FLAGGED
// ---------------------------------------------------------------------------
// "Latest per device" yields one figure per device, and this sums them. That is
// the literal reading of the ruling and is right for a watch plus a scale
// (different `kind`s). It is WRONG for two devices both counting steps — a
// phone and a watch would double the total.
//
// Not guessed around: `deviceCount` is returned so a caller can show a warning,
// and the case is recorded in docs/api/wearable_sync_service.md as needing a
// decision if it ever arises. Today the seeded data has one device.

import type { WearableSample } from "./api";

export interface DailyTotal {
  kind: string;
  /** Summed across devices, each contributing its latest cumulative reading. */
  value: number;
  unit: string | null;
  /** How many devices contributed. >1 means the sum may double-count. */
  deviceCount: number;
  /** The newest reading that fed this total, for a "as of…" line. */
  latestAtIso: string;
}

/** Local calendar day key, e.g. "2026-08-07". NOT a UTC date. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Collapse a sample stream into one figure per `kind` for the given local day.
 *
 * `value` is a STRING on the wire and may be non-numeric ("122/80" for blood
 * pressure). Anything that does not parse as a finite number is SKIPPED rather
 * than coerced — `Number("122/80")` is `NaN`, and letting that reach a total
 * would render "NaN" or, worse, silently drop to 0.
 */
export function dailyTotals(
  samples: WearableSample[],
  day: string = localDayKey(new Date().toISOString()),
): DailyTotal[] {
  // kind -> deviceId -> the latest sample seen for that pair
  const latest = new Map<string, Map<string, WearableSample>>();

  for (const s of samples) {
    if (localDayKey(s.recordedAtIso) !== day) continue;
    if (!Number.isFinite(Number(s.value))) continue;

    const perDevice = latest.get(s.kind) ?? new Map<string, WearableSample>();
    const held = perDevice.get(s.deviceId);
    // CUMULATIVE: the latest reading supersedes earlier ones, it does not add.
    if (!held || Date.parse(s.recordedAtIso) > Date.parse(held.recordedAtIso)) {
      perDevice.set(s.deviceId, s);
    }
    latest.set(s.kind, perDevice);
  }

  const out: DailyTotal[] = [];
  for (const [kind, perDevice] of latest) {
    const rows = [...perDevice.values()];
    out.push({
      kind,
      value: rows.reduce((sum, r) => sum + Number(r.value), 0),
      unit: rows[0]?.unit ?? null,
      deviceCount: rows.length,
      latestAtIso: rows
        .map((r) => r.recordedAtIso)
        .sort()
        .at(-1) as string,
    });
  }
  return out;
}

/** Convenience for a screen that wants one named figure. */
export function dailyTotalFor(
  samples: WearableSample[],
  kind: string,
  day?: string,
): DailyTotal | null {
  const wanted = kind.toLowerCase();
  return dailyTotals(samples, day).find((t) => t.kind.toLowerCase() === wanted) ?? null;
}
