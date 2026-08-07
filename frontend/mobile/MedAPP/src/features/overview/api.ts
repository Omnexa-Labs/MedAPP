// EHR API — ehr_service, `/v1/patients`.
//
// Shared by `overview` (the patient's own health summary) and `patient-record`
// (the fuller bundle). One module rather than one per feature, because both read
// the same three routes off the same service and a second copy would be a second
// set of wire types to keep in step with `app/schemas/record.py`.
//
// ---------------------------------------------------------------------------
// THE ROUTES ARE ADDRESSED BY *USER* ID, NOT PATIENT ID
// ---------------------------------------------------------------------------
// `/v1/patients/{patient_id}/…` names the path parameter `patient_id`, but the
// service resolves the caller's PATIENT row from it lazily — passing the
// authenticated user's id is what works, and is what the live verification on
// 2026-08-07 used. `PatientOut` then returns BOTH ids, and `patient_id` in the
// response is a different value from the one in the path. Do not feed the
// response's `patientId` back into these calls.
//
// ---------------------------------------------------------------------------
// WHAT IS NOT HERE
// ---------------------------------------------------------------------------
//   * `GET /v1/patients` (the list) returns 404 through the gateway. It is a
//     clinician-facing index and is not what either of these screens needs.
//   * Consent CREATE/DELETE exist (`POST /{id}/consents`,
//     `DELETE /{id}/consents/{consent_id}`) and are deliberately NOT wrapped
//     yet: granting a doctor access to a medical record is a consent action
//     with legal weight (Ghana DPA 2012 §20, GDPR Art. 9), and it needs a
//     designed confirmation flow, not a client method sitting ready for a
//     caller to wire to a button.
//
// Both PHI routes 500'd until 2026-08-07 — see docs/api/ehr_service.md for the
// two stacked bugs behind that.

import { client } from "@/lib/api/client";

export const PATIENTS_PATH = "/v1/patients";

// ---------------------------------------------------------------------------
// Wire types — mirroring app/schemas/record.py
// ---------------------------------------------------------------------------

interface PatientOutWire {
  patient_id: string;
  user_id: string;
  display_name: string | null;
}

interface VitalOutWire {
  vital_id: string;
  patient_id: string;
  recorded_by_user_id: string;
  kind: string;
  value: string;
  unit: string | null;
  recorded_at: string;
  note: string | null;
}

interface ConsentOutWire {
  consent_id: string;
  patient_id: string;
  doctor_user_id: string;
  scope: string;
  granted_by_user_id: string;
  granted_at: string;
}

interface PatientSummaryWire {
  patient: PatientOutWire;
  latest_vitals: VitalOutWire[];
  active_consents: ConsentOutWire[];
}

interface PatientBundleWire {
  patient: PatientOutWire;
  vitals: VitalOutWire[];
  consents: ConsentOutWire[];
}

interface VitalTimelineWire {
  items: VitalOutWire[];
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Patient {
  patientId: string;
  userId: string;
  displayName: string | null;
}

export interface Vital {
  id: string;
  patientId: string;
  recordedByUserId: string;
  /** Free-text on the wire (`max_length=64`) — NOT an enum. Do not switch on it. */
  kind: string;
  /** A STRING on the wire, e.g. "122/80". Never parse it as a number. */
  value: string;
  unit: string | null;
  recordedAtIso: string;
  note: string | null;
}

export interface Consent {
  id: string;
  patientId: string;
  doctorUserId: string;
  scope: string;
  grantedByUserId: string;
  grantedAtIso: string;
}

export interface PatientSummary {
  patient: Patient;
  latestVitals: Vital[];
  activeConsents: Consent[];
}

export interface PatientBundle {
  patient: Patient;
  vitals: Vital[];
  consents: Consent[];
}

const toPatient = (w: PatientOutWire): Patient => ({
  patientId: w.patient_id,
  userId: w.user_id,
  displayName: w.display_name,
});

const toVital = (w: VitalOutWire): Vital => ({
  id: w.vital_id,
  patientId: w.patient_id,
  recordedByUserId: w.recorded_by_user_id,
  kind: w.kind,
  value: w.value,
  unit: w.unit,
  recordedAtIso: w.recorded_at,
  note: w.note,
});

const toConsent = (w: ConsentOutWire): Consent => ({
  id: w.consent_id,
  patientId: w.patient_id,
  doctorUserId: w.doctor_user_id,
  scope: w.scope,
  grantedByUserId: w.granted_by_user_id,
  grantedAtIso: w.granted_at,
});

export const ehrApi = {
  /** `GET /{userId}/summary` — patient + latest vitals + active consents. */
  async getSummary(userId: string): Promise<PatientSummary> {
    const w = await client.get<PatientSummaryWire>(`${PATIENTS_PATH}/${userId}/summary`);
    return {
      patient: toPatient(w.patient),
      latestVitals: (w.latest_vitals ?? []).map(toVital),
      activeConsents: (w.active_consents ?? []).map(toConsent),
    };
  },

  /** `GET /{userId}/records` — the full bundle. */
  async getBundle(userId: string): Promise<PatientBundle> {
    const w = await client.get<PatientBundleWire>(`${PATIENTS_PATH}/${userId}/records`);
    return {
      patient: toPatient(w.patient),
      vitals: (w.vitals ?? []).map(toVital),
      consents: (w.consents ?? []).map(toConsent),
    };
  },

  /** `GET /{userId}/vitals` — the timeline. `{ items }`, unlike the two above. */
  async listVitals(userId: string): Promise<Vital[]> {
    const w = await client.get<VitalTimelineWire>(`${PATIENTS_PATH}/${userId}/vitals`);
    return (w.items ?? []).map(toVital);
  },
};
