// Reference display helpers retained for regression tests. Production medication data comes from medication-api.ts.
// The tracker uses server-generated slots; it does not use the sample adherence calculation.

import type { ActiveMedication } from "./types";

/** `5 August 2026` — en-GB, matching the date format used elsewhere in-app. */
function formatExportDate(at: Date): string {
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** The one sentence, repeated at both ends of the document. */
const SAMPLE_STATEMENT =
  "SAMPLE DATA — this is not a patient's medication record. The entries below are fixed demonstration data and describe nobody.";

export function buildMedicationListText(args: {
  medications: readonly ActiveMedication[];
  /** Injected so the output is deterministic under test. */
  at: Date;
  /**
   * True when the list is the local sample rather than a patient's record. See
   * the note in the header — this puts the statement inside the file.
   */
  sample?: boolean;
}): string {
  const { medications, at, sample = false } = args;

  const header = [
    ...(sample ? [SAMPLE_STATEMENT, ""] : []),
    "MedApp — medication list",
    `Exported ${formatExportDate(at)}`,
  ].join("\n");

  const entries = medications.map((m) => {
    const lines = [m.name, m.formAndStrength, m.instructions];
    if (m.prescriberName) lines.push(`Prescribed by ${m.prescriberName}`);
    if (m.refillsRemaining !== undefined) {
      // 0 is a fact, `undefined` is the absence of one — see ./types.ts. So the
      // check is against `undefined`, not falsiness, or "no refills left"
      // would silently become "we don't know".
      lines.push(`Refills remaining: ${m.refillsRemaining}`);
    }
    if (m.source === "self-reported") lines.push("Added by the patient, not prescribed");
    return lines.join("\n");
  });

  const footer = sample
    ? SAMPLE_STATEMENT
    : "Shared from MedApp by the patient. This list is patient-maintained and is not a clinical record issued by a provider.";

  return [header, ...entries, footer].join("\n\n");
}
