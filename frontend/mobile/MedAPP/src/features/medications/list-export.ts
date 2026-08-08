// The plain-text body behind "Share medication list".
//
// A PURE function of the data plus the export instant, deliberately separate
// from the screen: what goes into a shared medication record is the part worth
// asserting on in a test, and it must not need a rendered FlatList to check.
//
// ---------------------------------------------------------------------------
// WHAT IS IN IT, AND WHAT IS DELIBERATELY NOT
// ---------------------------------------------------------------------------
//
// IN — every field `ActiveMedication` actually carries: name, form/strength,
// instructions, and (where the record has them) prescriber and refills left.
// `prescriberName` and `refillsRemaining` are NOT drawn on the list screen —
// only on MedicationDetailsScreen — but they are real fields on the same local
// record, and a medication list handed to a pharmacist without the prescriber
// is the one thing they will ask for next. Omitting them would be the "silently
// dropped information" failure, not caution.
//
// OUT — "Last filled 12 Jul · 14 days left". That line is hardcoded in the card
// JSX, identical for all three medications, and corresponds to no field on the
// type. It is placeholder chrome. Putting it in an export would turn a layout
// stub into a clinical claim about a specific drug, in a document someone else
// reads. When the record API supplies real fill dates this is where they go.
//
// OUT — `refillLabel` ("Refill available in 6 days", "Added by you"). It was the
// list card's own display copy keyed to a UI state, `refillsRemaining` is the
// underlying fact, and the field has since been deleted from the type along
// with the refill control it fed. `source` is stated instead, in words, because
// "who says you take this" is the part that changes how a clinician reads the
// line.
//
// OUT — any invented total, adherence figure, or "as of" clinical status. There
// is no medication endpoint (see ./sample-data.ts); nothing here may read as a
// record that arrived from a provider.
//
// ---------------------------------------------------------------------------
// THE SAMPLE-DATA STATEMENT GOES IN THE FILE, NOT BESIDE IT
// ---------------------------------------------------------------------------
// The screen's callout stays on the screen. This document is the one artefact
// that LEAVES the app — it is written to disk, handed to a share sheet, and may
// be printed or attached to a referral by somebody who never saw the screen. So
// `sample` puts the statement on the FIRST line, before any drug name, and
// repeats it in the footer. A reader who sees only the top of the file, and a
// reader who reads only the end, both get it.

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
