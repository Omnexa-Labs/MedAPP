// The shared medication record, asserted on directly.
//
// The negative assertions are the point of this file. A share sheet is where an
// invented clinical value does the most damage — it leaves the app and gets read
// out at a pharmacy counter — so the export is pinned against the specific
// fabrications available to it.

import { buildMedicationListText } from "../list-export";
import { SAMPLE_MEDICATIONS } from "../sample-data";

const AT = new Date("2026-08-05T10:00:00Z");

describe("buildMedicationListText", () => {
  it("carries every real field on the record, prescriber included", () => {
    const text = buildMedicationListText({ medications: SAMPLE_MEDICATIONS, at: AT });

    expect(text).toContain("Amlodipine");
    expect(text).toContain("Tablet · 5 mg");
    expect(text).toContain("Take 1 tablet once daily in the morning.");
    // Prescriber is a real field the list screen happens not to draw — a
    // medication list without it is the one a pharmacist sends back.
    expect(text).toContain("Prescribed by Dr. Adjoa Boateng");
    expect(text).toContain("Prescribed by Dr. Kwabena Osei");
    expect(text).toContain("Exported 5 August 2026");
  });

  it("distinguishes zero refills from unknown refills", () => {
    const text = buildMedicationListText({ medications: SAMPLE_MEDICATIONS, at: AT });
    // Amlodipine: refillsRemaining 0 — a fact, and it must be stated.
    expect(text).toContain("Refills remaining: 0");
    expect(text).toContain("Refills remaining: 2");
    // Vitamin D3 has no refill count and no prescriber: absence renders as
    // absence, not as "Refills remaining: undefined" or a blank.
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text.match(/Refills remaining:/g)).toHaveLength(2);
  });

  it("marks a self-reported entry as not prescribed", () => {
    const text = buildMedicationListText({ medications: SAMPLE_MEDICATIONS, at: AT });
    expect(text).toContain("Added by the patient, not prescribed");
    expect(text).toContain("patient-maintained and is not a clinical record");
  });

  // -------------------------------------------------------------------------
  // The sample-data statement travels INSIDE the file.
  // -------------------------------------------------------------------------
  // This document is the only artefact that leaves the app. It can be printed,
  // forwarded, or attached to a referral by somebody who never saw the screen's
  // callout, so the statement cannot live only on the screen.
  it("stamps a sample export as sample, at both ends of the document", () => {
    const text = buildMedicationListText({
      medications: SAMPLE_MEDICATIONS,
      at: AT,
      sample: true,
    });

    // FIRST line — before any drug name. A reader who sees only the top of the
    // file still gets it.
    expect(text.split("\n")[0]).toMatch(/^SAMPLE DATA —/);
    expect(text).toContain("this is not a patient's medication record");
    // ...and again at the end, for a reader who scrolls to the bottom.
    expect(text.trimEnd().endsWith("describe nobody.")).toBe(true);
    // The non-sample footer would claim the list is the patient's own,
    // maintained by them. It must not appear on a sample export.
    expect(text).not.toContain("Shared from MedApp by the patient");
  });

  it("does not stamp a real export as sample", () => {
    const text = buildMedicationListText({ medications: SAMPLE_MEDICATIONS, at: AT });
    expect(text).not.toMatch(/SAMPLE DATA/);
    expect(text).toContain("Shared from MedApp by the patient");
  });

  it("exports no fill dates, because the screen has none", () => {
    const text = buildMedicationListText({ medications: SAMPLE_MEDICATIONS, at: AT });
    // "Last filled 12 Jul · 14 days left" is hardcoded card chrome, identical
    // for every drug and backed by no field. It must never become an exported
    // clinical claim.
    expect(text).not.toMatch(/Last filled/i);
    expect(text).not.toMatch(/12 Jul/);
    expect(text).not.toMatch(/days left/i);
  });

  it("only names clinicians the dev seed actually creates", () => {
    const text = buildMedicationListText({ medications: SAMPLE_MEDICATIONS, at: AT });
    const seeded = ["Kwabena Osei", "Adjoa Boateng", "Yaw Darko", "Efua Asante", "Nii Tetteh", "Abena Owusu"];
    for (const name of text.match(/Prescribed by Dr\. (.+)/g) ?? []) {
      expect(seeded.some((s) => name.includes(s))).toBe(true);
    }
  });

  // The `offline` flag is gone with the screen's fabricated offline state: there
  // was no cache and no "last saved list", so "Last saved copy … while offline"
  // described a fixture rather than a stale read. `sample` replaced it above.
});
