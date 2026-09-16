// The prescription list, and the ways it could contradict the medication list.
//
// The load-bearing cases here are the CROSS-FILE ones. Sample prescriptions and
// sample medications describe the same patient from two angles, and nothing in
// the type system stops them disagreeing — a drug renamed in one file, a
// prescriber changed in the other, and the app tells a patient two different
// stories one tap apart. These tests are what makes that a failing build.

import { SAMPLE_MEDICATIONS } from "@/features/medications/sample-data";
import {
  formatIssuedDate,
  prescriptionsWithStatus,
  statusCounts,
  type Prescription,
} from "../prescriptions";
import { buildSamplePrescriptions } from "../prescriptions-sample-data";

const ANCHOR = new Date(2026, 7, 10); // 10 Aug 2026, local

describe("the sample prescriptions against the sample medications", () => {
  const prescriptions = buildSamplePrescriptions(ANCHOR);

  it("gives every ACTIVE script a matching medication, with the same prescriber", () => {
    const byName = new Map(SAMPLE_MEDICATIONS.map((medication) => [medication.name, medication]));
    for (const prescription of prescriptionsWithStatus(prescriptions, "active")) {
      const medication = byName.get(prescription.drugName);
      expect(medication).toBeDefined();
      expect(prescription.strengthAndForm).toBe(medication?.formAndStrength);
      expect(prescription.prescriberName).toBe(medication?.prescriberName);
    }
  });

  it("never lists a self-reported medication as a prescription", () => {
    // Vitamin D3 is `source: "self-reported"` with no prescriber, so no
    // prescription exists behind it. It appearing here would be a fabricated
    // clinical record.
    const selfReported = SAMPLE_MEDICATIONS.filter(
      (medication) => medication.source === "self-reported",
    );
    expect(selfReported.length).toBeGreaterThan(0); // guard: the case still exists
    for (const medication of selfReported) {
      expect(prescriptions.some((rx) => rx.drugName === medication.name)).toBe(false);
    }
  });

  it("leaves no prescriber blank", () => {
    // The two active entries read their prescriber off SAMPLE_MEDICATIONS, where
    // the field is optional. If one is ever changed to self-reported there, this
    // fails loudly instead of rendering an empty prescriber line.
    for (const prescription of prescriptions) {
      expect(prescription.prescriberName).not.toBe("");
    }
  });

  it("names only clinicians the dev seed creates", () => {
    // scripts/seed_dev_data.py's rule: a screen needing a clinician the seed
    // lacks gets the clinician ADDED there. These are the seeded six.
    const seeded = new Set([
      "Dr. Kwabena Osei",
      "Dr. Adjoa Boateng",
      "Dr. Yaw Darko",
      "Dr. Efua Asante",
      "Dr. Nii Tetteh",
      "Dr. Abena Owusu",
    ]);
    for (const prescription of prescriptions) {
      expect(seeded.has(prescription.prescriberName)).toBe(true);
    }
  });
});

describe("dates", () => {
  it("dates every script relative to the anchor, with none in the future", () => {
    for (const prescription of buildSamplePrescriptions(ANCHOR)) {
      expect(prescription.issuedDate <= "2026-08-10").toBe(true);
    }
  });

  it("moves with the anchor rather than being frozen", () => {
    const then = buildSamplePrescriptions(new Date(2026, 0, 15));
    const later = buildSamplePrescriptions(new Date(2027, 0, 15));
    expect(then[0].issuedDate).not.toBe(later[0].issuedDate);
  });

  it("keeps an ACTIVE script recent — a three-year-old active script is a contradiction", () => {
    const active = prescriptionsWithStatus(buildSamplePrescriptions(ANCHOR), "active");
    for (const prescription of active) {
      expect(prescription.issuedDate >= "2026-06-10").toBe(true);
    }
  });

  it("crosses a month boundary backwards without a day 0", () => {
    // 2 Mar minus 28 days lands in February, and 2026 is not a leap year.
    const prescriptions = buildSamplePrescriptions(new Date(2026, 2, 2));
    expect(prescriptions[0].issuedDate).toBe("2026-02-02");
  });
});

describe("formatIssuedDate", () => {
  it("formats by splitting the string, so the day never shifts via UTC", () => {
    expect(formatIssuedDate("2026-08-10")).toBe("10 Aug 2026");
    expect(formatIssuedDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatIssuedDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns a malformed value unchanged rather than inventing a date", () => {
    expect(formatIssuedDate("not-a-date")).toBe("not-a-date");
    expect(formatIssuedDate("2026-13-01")).toBe("2026-13-01");
    expect(formatIssuedDate("")).toBe("");
  });
});

describe("tab filtering", () => {
  const rows: readonly Prescription[] = [
    { id: "a", rxNumber: "1", drugName: "A", strengthAndForm: "x", status: "active", prescriberName: "Dr. Kwabena Osei", issuedDate: "2026-01-01" },
    { id: "b", rxNumber: "2", drugName: "B", strengthAndForm: "x", status: "active", prescriberName: "Dr. Kwabena Osei", issuedDate: "2026-03-01" },
    { id: "c", rxNumber: "3", drugName: "C", strengthAndForm: "x", status: "past", prescriberName: "Dr. Kwabena Osei", issuedDate: "2025-01-01" },
  ];

  it("returns only the requested status, newest first", () => {
    expect(prescriptionsWithStatus(rows, "active").map((rx) => rx.id)).toEqual(["b", "a"]);
  });

  it("returns an empty list for a status with none, without throwing", () => {
    expect(prescriptionsWithStatus(rows, "new")).toEqual([]);
  });

  it("counts every status, including the empty ones", () => {
    expect(statusCounts(rows)).toEqual({ active: 2, new: 0, past: 1 });
  });

  it("does not mutate the input while sorting", () => {
    const order = rows.map((rx) => rx.id);
    prescriptionsWithStatus(rows, "active");
    expect(rows.map((rx) => rx.id)).toEqual(order);
  });
});
