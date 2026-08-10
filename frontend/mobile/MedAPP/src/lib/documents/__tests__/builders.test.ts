// Document CONTENT. No native modules involved — these are pure functions, which
// is why they were split out.
//
// The assertions that matter most here are the NEGATIVE ones. An exported file
// outlives the screen that made it, so the risks are (1) a builder filling a gap
// with a plausible sample value, and (2) an invented clinician reaching a
// persisted medical record. Both are checked directly.

import {
  buildHealthReportDocument,
  buildPrescriptionDocument,
  formatDocumentTimestamp,
  healthReportFileName,
  prescriptionFileName,
} from "../builders";

const GENERATED_AT = "5 Aug 2026, 14:32";

/** The seeded roster — scripts/seed_dev_data.py. Nobody else may appear. */
const SEEDED_DOCTORS = [
  "Kwabena Osei",
  "Adjoa Boateng",
  "Yaw Darko",
  "Efua Asante",
  "Nii Tetteh",
  "Abena Owusu",
];

/** Names this project has invented before and must never write to a file. */
const INVENTED_NAMES = [/Sarah Jenkins/i, /Mark Chen/i, /Dr\.?\s*Jenkins/i, /John Doe/i];

describe("buildPrescriptionDocument", () => {
  const full = {
    drug: "Lisinopril 10mg",
    patient: "Alex Rivers",
    scriptId: "#8829-X",
    prescriber: "Dr. Adjoa Boateng",
    issuedDate: "Oct 12, 2023",
    rxNumber: "#RX-992-Rivers",
    dob: "12/05/1988",
    clinic: "Central Cardiology Center",
    license: "MD-99283-A",
    quantity: "30 Tablets",
    refills: "3 Remaining",
    instructions: "Once daily in the morning",
    indication: "Hypertension management",
    generatedAt: GENERATED_AT,
  };

  it("writes every field it is given, under its own heading", () => {
    const doc = buildPrescriptionDocument(full);

    expect(doc).toContain("MEDAPP - DIGITAL PRESCRIPTION RECORD");
    for (const heading of ["PATIENT", "PRESCRIBER", "MEDICATION", "INSTRUCTIONS"]) {
      expect(doc).toContain(heading);
    }
    expect(doc).toContain("Dr. Adjoa Boateng");
    expect(doc).toContain("Quantity: 30 Tablets");
    expect(doc).toContain("Refills: 3 Remaining");
    expect(doc).toContain("Indication: Hypertension management");
    expect(doc).toContain("License: MD-99283-A");
    expect(doc).toContain(`Exported from MedApp on ${GENERATED_AT}`);
  });

  it("OMITS what it is not given instead of substituting a sample value", () => {
    // The share screen only carries five of the thirteen fields. The record it
    // produces has to be SHORTER, not padded out with a dosage nobody prescribed.
    const doc = buildPrescriptionDocument({
      drug: "Lisinopril 10mg",
      patient: "Alex Rivers",
      scriptId: "#8829-X",
      prescriber: "Dr. Adjoa Boateng",
      issuedDate: "Oct 12, 2023",
      generatedAt: GENERATED_AT,
    });

    expect(doc).not.toMatch(/Quantity/);
    expect(doc).not.toMatch(/Refills/);
    expect(doc).not.toMatch(/License/);
    expect(doc).not.toMatch(/Date of birth/);
    expect(doc).not.toMatch(/INSTRUCTIONS/);
    expect(doc).not.toMatch(/Indication/);
    // No `Label:` sitting over nothing, and no placeholder standing in for a
    // clinical value. (The bare-hyphen check the first draft had matched the
    // section rules themselves — hence the word boundaries.)
    expect(doc).not.toMatch(/:\s*$/m);
    expect(doc).not.toMatch(/\b(N\/A|TBD|unknown|none|pending)\b/i);
    // What it DOES have is still there.
    expect(doc).toContain("Lisinopril 10mg");
    expect(doc).toContain("Dr. Adjoa Boateng");
  });

  it("carries no clinical value of its own — an empty record stays empty", () => {
    const doc = buildPrescriptionDocument({ generatedAt: GENERATED_AT });

    // Not one mg, not one date, not one name. If a builder had sample fallbacks
    // this is where they would show up.
    expect(doc).not.toMatch(/\d+\s?mg/i);
    expect(doc).not.toMatch(/tablet/i);
    expect(doc).not.toMatch(/\bDr\.?\b/);
    expect(doc).toContain("MEDAPP - DIGITAL PRESCRIPTION RECORD");
  });

  it("does not copy the screen's placeholder signature hash into the file", () => {
    // The screen shows `SHA-256: f1e2d3c4b5a6…`, which is a mock. A truncated fake
    // integrity check inside a document claiming to be a record is the original bug
    // wearing a different hat.
    const doc = buildPrescriptionDocument(full);
    expect(doc).not.toMatch(/SHA-?256/i);
    expect(doc).not.toMatch(/f1e2d3c4b5a6/);
  });

  it("states that the export is unsigned, since the on-screen 'Verified' chip cannot travel", () => {
    const doc = buildPrescriptionDocument(full);
    expect(doc).toContain("Patient-exported copy");
    expect(doc).toMatch(/Not a signed or dispensable document/);
    // And it must not re-assert the chip it can't back up.
    expect(doc).not.toMatch(/\bVerified\b/);
  });

  it("names no clinician the seed roster doesn't have", () => {
    const doc = buildPrescriptionDocument(full);
    for (const invented of INVENTED_NAMES) {
      expect(doc).not.toMatch(invented);
    }
    // The one doctor in this record is a seeded one.
    expect(SEEDED_DOCTORS.some((name) => doc.includes(name))).toBe(true);
  });
});

describe("prescriptionFileName", () => {
  it("strips characters that break a file:// path", () => {
    // `#` in a filename is a URI fragment delimiter once the path becomes a URL,
    // and the screens' script ids look like `#8829-X`.
    expect(prescriptionFileName({ drug: "Lisinopril 10mg", scriptId: "#8829-X" })).toBe(
      "prescription-lisinopril-10mg-8829-x.txt",
    );
    expect(prescriptionFileName({ drug: undefined, scriptId: undefined })).toBe(
      "prescription.txt",
    );
  });

  it("is stable for the same record, so re-downloading overwrites", () => {
    const args = { drug: "Lisinopril 10mg", scriptId: "#8829-X" };
    expect(prescriptionFileName(args)).toBe(prescriptionFileName(args));
  });
});

describe("buildHealthReportDocument", () => {
  const report = {
    range: "7D",
    metrics: [
      { label: "Heart Rate", value: "72", unit: "bpm" },
      { label: "Hydration", value: "1.8", unit: "L" },
    ],
    doses: [
      { name: "Lisinopril 10mg", time: "08:00 AM", taken: true },
      { name: "Atorvastatin 20mg", time: "09:00 PM", taken: false },
    ],
    milestones: [
      {
        date: "Oct 28, 2023",
        title: "Cardiology Consultation",
        body: "Follow-up with Dr. Adjoa Boateng. Heart rate variability improving.",
      },
    ],
    devices: [{ name: "Apple Watch Ultra", syncedAgo: "Last synced: 2m ago" }],
    generatedAt: GENERATED_AT,
  };

  it("states the window the numbers belong to", () => {
    // A vitals figure with no time window is not a reading, it is a rumour.
    expect(buildHealthReportDocument(report)).toContain("Trend window: 7D");
  });

  it("writes each section from the screen's own content", () => {
    const doc = buildHealthReportDocument(report);
    expect(doc).toContain("Heart Rate: 72 bpm");
    expect(doc).toContain("Hydration: 1.8 L");
    expect(doc).toContain("Lisinopril 10mg - 08:00 AM - taken");
    expect(doc).toContain("Atorvastatin 20mg - 09:00 PM - not yet taken");
    expect(doc).toContain("Oct 28, 2023 - Cardiology Consultation");
    expect(doc).toContain("Apple Watch Ultra - Last synced: 2m ago");
  });

  it("spells out adherence rather than exporting a bare boolean", () => {
    // `taken: false` printed as "false" is unreadable; printed as nothing is a
    // dose that looks taken.
    const doc = buildHealthReportDocument(report);
    expect(doc).not.toMatch(/\b(true|false)\b/);
  });

  it("adds no patient name, because the Overview screen shows none", () => {
    const doc = buildHealthReportDocument(report);
    expect(doc).not.toMatch(/Alex Rivers|Ama Mensah|Patient:/);
  });

  it("names no invented clinician", () => {
    const doc = buildHealthReportDocument(report);
    for (const invented of INVENTED_NAMES) {
      expect(doc).not.toMatch(invented);
    }
  });

  it("drops sections it has no rows for", () => {
    const doc = buildHealthReportDocument({
      range: "1M",
      metrics: [],
      doses: [],
      milestones: [],
      devices: [],
      generatedAt: GENERATED_AT,
    });
    expect(doc).not.toMatch(/LATEST VITALS/);
    expect(doc).not.toMatch(/MEDICATION ADHERENCE/);
    expect(doc).not.toMatch(/CONNECTED DEVICES/);
    expect(doc).toContain("Trend window: 1M");
  });

  it("names the range in the filename", () => {
    expect(healthReportFileName({ range: "7D" })).toBe("health-report-7d.txt");
  });
});

describe("formatDocumentTimestamp", () => {
  it("uses an unambiguous day-month form", () => {
    // The file may be read on a machine in another region, where 05/08/2026 means
    // a different day.
    expect(formatDocumentTimestamp(new Date(2026, 7, 5, 14, 32))).toBe("5 Aug 2026, 14:32");
  });

  it("zero-pads the clock", () => {
    expect(formatDocumentTimestamp(new Date(2026, 0, 9, 7, 4))).toBe("9 Jan 2026, 07:04");
  });
});

describe("every document", () => {
  it("stays ASCII, so a .txt opened in Notepad shows no mojibake", () => {
    const docs = [
      buildPrescriptionDocument({ drug: "Lisinopril 10mg", generatedAt: GENERATED_AT }),
      buildHealthReportDocument({
        range: "7D",
        metrics: [{ label: "Heart Rate", value: "72", unit: "bpm" }],
        doses: [],
        milestones: [],
        devices: [],
        generatedAt: GENERATED_AT,
      }),
    ];
    for (const doc of docs) {
      // eslint-disable-next-line no-control-regex
      expect(doc).not.toMatch(/[^\x00-\x7F]/);
    }
  });
});
