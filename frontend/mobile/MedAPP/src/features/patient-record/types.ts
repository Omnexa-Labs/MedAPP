import type { HealthIconName } from "@/components/ui";

/**
 * One observation, as the screen draws it.
 *
 * ===========================================================================
 * THERE IS NO `abnormal` FIELD, AND THERE MUST NOT BE ONE
 * ===========================================================================
 * This type used to end `abnormal?: boolean`. Nothing computed it — it was
 * hand-typed in the fixture on one blood pressure — so it recorded the author's
 * opinion of a made-up number rather than a property of a reading. Adding it
 * back is what would let a caller assert a clinical verdict again.
 *
 * Abnormality is DERIVED, in exactly one place: `assessVital` in
 * ./vital-ranges.ts, from `kind`, `value` and `unit`. `kind` is on this type for
 * that reason and no other — `label` is display copy and a range must never be
 * selected from copy.
 */
export type RecordVital = {
  /** Display copy. Never used to pick a reference range. */
  label: string;
  /** Wire `kind` (free text, max 64). The input to `assessVital`. */
  kind: string;
  /** A STRING, e.g. "122/80". Never parsed as a number outside vital-ranges.ts. */
  value: string;
  /** `null` on the wire is common, and it makes the reading unclassifiable. */
  unit: string | null;
  icon: HealthIconName;
  /** When the lab/monitor recorded it, ISO. Drives the "updated" line. */
  recordedAtIso: string;
};

/**
 * A patient's record, holding ONLY what `GET /v1/patients/{userId}/records`
 * actually returns.
 *
 * Gone from this type, with the fixture that supplied them: `age`, `ward`,
 * `patientCode`, `reviewStatus`, `reviewed`, `summary` and `timeline`. The
 * bundle is `patient + vitals + consents` (ehr_service `PatientBundleOut`) and
 * carries no demographics beyond a display name, no ward, no triage status and
 * no clinical notes. Every one of those fields was invented by the mock — the
 * care timeline named a consultation with a clinician who is not in the dev
 * seed — so they are removed rather than defaulted. See docs/api/README.md's
 * gap register for what restoring each would cost.
 */
export type PatientRecord = {
  /** The USER id the record was addressed by — not `patient.patientId`. */
  id: string;
  /** `display_name` is nullable on the wire. Absence is rendered as absence. */
  name: string | null;
  /** Derived from `name`; `null` when there is no name to derive from. */
  initials: string | null;
  /** The service's own patient id, distinct from `id`. See features/overview/api.ts. */
  patientId: string;
  /** Latest reading per kind, newest first. */
  vitals: readonly RecordVital[];
  /** How many access consents are currently active on this record. */
  activeConsentCount: number;
};
