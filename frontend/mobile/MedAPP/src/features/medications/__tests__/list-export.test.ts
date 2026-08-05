// The shared medication record, asserted on directly.
//
// The negative assertions are the point of this file. A share sheet is where an
// invented clinical value does the most damage — it leaves the app and gets read
// out at a pharmacy counter — so the export is pinned against the specific
// fabrications available to it.

import { buildMedicationListText } from "../list-export";
import { ACTIVE_MEDICATIONS } from "../mock-data";

const AT = new Date("2026-08-05T10:00:00Z");

describe("buildMedicationListText", () => {
  it("carries every real field on the record, prescriber included", () => {
    const text = buildMedicationListText({ medications: ACTIVE_MEDICATIONS, at: AT });

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
    const text = buildMedicationListText({ medications: ACTIVE_MEDICATIONS, at: AT });
    // Amlodipine: refillsRemaining 0 — a fact, and it must be stated.
    expect(text).toContain("Refills remaining: 0");
    expect(text).toContain("Refills remaining: 2");
    // Vitamin D3 has no refill count and no prescriber: absence renders as
    // absence, not as "Refills remaining: undefined" or a blank.
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text.match(/Refills remaining:/g)).toHaveLength(2);
  });

  it("marks a self-reported entry as not prescribed", () => {
    const text = buildMedicationListText({ medications: ACTIVE_MEDICATIONS, at: AT });
    expect(text).toContain("Added by the patient, not prescribed");
    expect(text).toContain("patient-maintained and is not a clinical record");
  });

  it("exports no fill dates, because the screen has none", () => {
    const text = buildMedicationListText({ medications: ACTIVE_MEDICATIONS, at: AT });
    // "Last filled 12 Jul · 14 days left" is hardcoded card chrome, identical
    // for every drug and backed by no field. It must never become an exported
    // clinical claim.
    expect(text).not.toMatch(/Last filled/i);
    expect(text).not.toMatch(/12 Jul/);
    expect(text).not.toMatch(/days left/i);
  });

  it("only names clinicians the dev seed actually creates", () => {
    const text = buildMedicationListText({ medications: ACTIVE_MEDICATIONS, at: AT });
    const seeded = ["Kwabena Osei", "Adjoa Boateng", "Yaw Darko", "Efua Asante", "Nii Tetteh", "Abena Owusu"];
    for (const name of text.match(/Prescribed by Dr\. (.+)/g) ?? []) {
      expect(seeded.some((s) => name.includes(s))).toBe(true);
    }
  });

  it("says so when the list is a stale offline copy", () => {
    const text = buildMedicationListText({ medications: ACTIVE_MEDICATIONS, at: AT, offline: true });
    expect(text).toContain("Last saved copy, exported 5 August 2026 while offline");
    expect(text).not.toMatch(/^Exported/m);
  });
});
