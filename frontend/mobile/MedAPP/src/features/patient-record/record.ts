// Bundle -> screen model for the patient record.
//
// ===========================================================================
// THIS FILE REPLACES `mock-data.ts`, WHICH IS DELETED
// ===========================================================================
// What was there: fourteen complete patient records — names, ages, wards,
// diagnoses and clinical notes — derived from `roster2/mock-data.ts`, with a
// shared three-entry care timeline and a shared vitals triple. Three separate
// defects came out with it:
//
//   1. `DEFAULT_PATIENT_RECORD_ID = "amina-mensah"`. `findPatientRecord()` fell
//      back to it, so a MISSING id opened a specific named patient's chart. An
//      absent id now renders not-found, and there is no default. That behaviour
//      is not reproducible here because there is no lookup to default: the id
//      is a path parameter on a request.
//   2. The same three vitals on every record, one of them carrying a hand-typed
//      `abnormal: true`. See ./vital-ranges.ts.
//   3. A timeline naming "Consultation · Dr Miller" — a clinician who is not in
//      scripts/seed_dev_data.py, inside a fabricated clinical note.
//
// `GET /v1/patients/{userId}/records` (features/overview/api.ts `getBundle`,
// which had no caller until now) returns `patient + vitals + consents`. That is
// the whole of what this screen may draw. Nothing here fills a gap with a
// plausible value; a field the bundle does not carry is a field the screen does
// not have.

import type { PatientBundle, Vital } from "@/features/overview/api";
import { normaliseKind, type VitalKind } from "./vital-ranges";
import type { HealthIconName } from "@/components/ui";
import type { PatientRecord, RecordVital } from "./types";

/**
 * Glyph and display copy per canonical kind.
 *
 * Keyed by the NORMALISED kind, so a record reporting "HR" and one reporting
 * "heart_rate" get the same row. An unrecognised kind keeps its wire spelling as
 * the label and takes the neutral stethoscope — a vital the UI cannot name is
 * still a vital somebody recorded, and dropping it would be the silent loss this
 * screen exists to avoid.
 */
const PRESENTATION: Readonly<Record<VitalKind, { label: string; icon: HealthIconName }>> = {
  heart_rate: { label: "Heart rate", icon: "heart-rate" },
  blood_pressure: { label: "Blood pressure", icon: "blood-pressure" },
  oxygen_saturation: { label: "Oxygen saturation", icon: "oxygen-saturation" },
  respiratory_rate: { label: "Respiratory rate", icon: "lungs" },
  temperature: { label: "Temperature", icon: "temperature" },
  blood_glucose: { label: "Blood glucose", icon: "lab-sample" },
};

function toRecordVital(v: Vital): RecordVital {
  const kind = normaliseKind(v.kind);
  const meta = kind ? PRESENTATION[kind] : null;
  return {
    label: meta?.label ?? v.kind,
    kind: v.kind,
    value: v.value,
    unit: v.unit,
    icon: meta?.icon ?? "stethoscope",
    recordedAtIso: v.recordedAtIso,
  };
}

/**
 * Initials for the avatar, or null.
 *
 * `display_name` is nullable on the wire. A null name yields NULL initials
 * rather than "?" or a placeholder pair: `AvatarWithFallback` already draws a
 * silhouette when it is given nothing, and two invented letters on a patient
 * record read as a real person's initials.
 */
export function initialsFor(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const letters = [parts[0][0], parts.length > 1 ? parts[parts.length - 1][0] : ""].join("");
  return letters.toUpperCase() || null;
}

/**
 * The LATEST reading per kind, newest first.
 *
 * `GET /{id}/records` returns the full vitals history, not a snapshot — the
 * "latest vitals" heading would otherwise be a list with the same measurement
 * several times over, oldest included. Grouping is on the NORMALISED kind so a
 * service that has spelled it two ways over time collapses to one row; a kind
 * that normalises to nothing falls back to its raw spelling, which keeps
 * unrecognised kinds separate from each other instead of merging them.
 */
function latestPerKind(vitals: readonly Vital[]): RecordVital[] {
  const newest = new Map<string, Vital>();
  for (const v of vitals) {
    const key = normaliseKind(v.kind) ?? `raw:${v.kind.toLowerCase()}`;
    const held = newest.get(key);
    if (!held || Date.parse(v.recordedAtIso) > Date.parse(held.recordedAtIso)) {
      newest.set(key, v);
    }
  }
  return [...newest.values()]
    .sort((a, b) => Date.parse(b.recordedAtIso) - Date.parse(a.recordedAtIso))
    .map(toRecordVital);
}

export function toPatientRecord(userId: string, bundle: PatientBundle): PatientRecord {
  return {
    id: userId,
    name: bundle.patient.displayName,
    initials: initialsFor(bundle.patient.displayName),
    patientId: bundle.patient.patientId,
    vitals: latestPerKind(bundle.vitals),
    activeConsentCount: bundle.consents.length,
  };
}

export const __testables = { latestPerKind };
