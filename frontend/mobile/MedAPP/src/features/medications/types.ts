/** A local display model until the medication-record API is available. */
export type ActiveMedication = {
  id: string;
  name: string;
  formAndStrength: string;
  instructions: string;
  refillLabel: string;
  refillAvailable: boolean;
  source: "prescribed" | "self-reported";

  // ---- Detail-only facts (MedicationDetailsScreen) ----------------------
  //
  // OPTIONAL ON PURPOSE, two reasons.
  //
  // 1. ActiveMedicationsScreen reads none of them, so adding them cannot move a
  //    pixel on the list — the list card and its test stay exactly as they are.
  // 2. A medication record is not uniformly populated. A self-reported entry has
  //    no prescriber and no refill count, and the detail screen must render that
  //    absence as absence — the row simply does not appear. This is the same
  //    stance ReviewAppointmentScreen took when its `FALLBACK` was deleted: on a
  //    clinical screen, a plausible invented value is worse than a missing row.

  // There is deliberately NO `directions` field here. `instructions` above
  // already carries the frame's sig line verbatim ("Take 1 tablet with breakfast
  // and dinner."), so a second copy of the same clinical sentence would be one
  // more place for the two to drift — and a dosage line that disagrees with
  // itself between the list and the detail screen is the kind of drift that
  // matters on a medication record. The detail screen reads `instructions`.

  /** Clinician of record, e.g. "Dr. Ama Boateng". Absent on a self-reported entry. */
  prescriberName?: string;
  /**
   * Refills left on the prescription. A number, not the pre-formatted string, so
   * the screen owns the wording ("2 remaining") and 0 stays distinguishable from
   * "unknown" — `0` is a fact, `undefined` is the absence of one. `refillLabel`
   * above is the list's own copy and deliberately not reused here.
   */
  refillsRemaining?: number;
};

export type MedicationScreenState = "ready" | "loading" | "empty" | "error" | "offline";
