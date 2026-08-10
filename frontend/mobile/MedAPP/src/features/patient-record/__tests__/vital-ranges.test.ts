// Reference ranges — the file that decides whether a reading is abnormal.
//
// Two failure modes are worth more than the happy path here:
//
//   1. Flagging nothing. `abnormal` used to be a hand-typed boolean in a
//      fixture, so a real 91% oxygen saturation would have rendered untinted
//      and unqualified. Every out-of-range case below is that bug.
//   2. Flagging from the WRONG bounds. A temperature scored against the other
//      scale, a blood pressure scored on its systolic alone, or a reading with
//      no unit assumed into the common one. Those produce a confident verdict
//      about a number nobody checked, which is worse than no verdict.

import {
  abnormalLabelFor,
  assessVital,
  normaliseKind,
  normaliseUnit,
  toneFor,
} from "../vital-ranges";

describe("normaliseKind", () => {
  it("folds the spellings one service can emit for one measurement", () => {
    for (const raw of ["heart_rate", "Heart Rate", "HR", "pulse"]) {
      expect(normaliseKind(raw)).toBe("heart_rate");
    }
    // "SpO₂" — the subscript two is not [a-z0-9] and folds away.
    for (const raw of ["SpO₂", "spo2", "oxygen saturation", "O2 sat"]) {
      expect(normaliseKind(raw)).toBe("oxygen_saturation");
    }
  });

  it("returns null for anything it does not know, rather than guessing", () => {
    expect(normaliseKind("peak flow")).toBeNull();
    expect(normaliseKind("")).toBeNull();
  });

  it("does not confuse blood glucose with blood pressure", () => {
    // A substring rule would score a sugar against mmHg bounds and look like a
    // working feature while doing it.
    expect(normaliseKind("blood glucose")).toBe("blood_glucose");
    expect(normaliseKind("blood pressure")).toBe("blood_pressure");
  });
});

describe("normaliseUnit", () => {
  it("keeps the two temperature scales distinct", () => {
    expect(normaliseUnit("°C")).toBe("°C");
    expect(normaliseUnit("celsius")).toBe("°C");
    expect(normaliseUnit("°F")).toBe("°F");
    expect(normaliseUnit("F")).toBe("°F");
  });

  it("returns null for an absent unit instead of a default", () => {
    expect(normaliseUnit(null)).toBeNull();
    expect(normaliseUnit(undefined)).toBeNull();
    expect(normaliseUnit("   ")).toBeNull();
  });
});

describe("assessVital", () => {
  it("flags a low oxygen saturation — the reading the old model could not flag", () => {
    const a = assessVital({ kind: "SpO₂", value: "91", unit: "%" });
    expect(a.status).toBe("out-of-range");
    expect(toneFor(a)).toBe("abnormal");
    expect(abnormalLabelFor(a)).toContain("94–100 %");
  });

  it("passes a normal oxygen saturation", () => {
    const a = assessVital({ kind: "SpO₂", value: "98", unit: "%" });
    expect(a.status).toBe("in-range");
    expect(toneFor(a)).toBe("normal");
  });

  it("scores BOTH halves of a blood pressure, and names only the half that failed", () => {
    // 145/92 — the fixture's hand-flagged reading. Both halves are out.
    const both = assessVital({ kind: "blood_pressure", value: "145/92", unit: "mmHg" });
    expect(both.status).toBe("out-of-range");
    expect(both.breached).toHaveLength(2);

    // Diastolic alone. Naming the systolic bound here would point a clinician
    // at the half that was fine.
    const diastolic = assessVital({ kind: "blood_pressure", value: "124/92", unit: "mmHg" });
    expect(diastolic.status).toBe("out-of-range");
    expect(diastolic.breached).toHaveLength(1);
    expect(abnormalLabelFor(diastolic)).toContain("diastolic");
    expect(abnormalLabelFor(diastolic)).not.toContain("systolic");

    // The roster's constant. In range on both.
    expect(assessVital({ kind: "BP", value: "124/78", unit: "mmHg" }).status).toBe("in-range");
  });

  it("flags a tachycardia and passes a resting rate", () => {
    expect(assessVital({ kind: "HR", value: "126", unit: "bpm" }).status).toBe("out-of-range");
    expect(assessVital({ kind: "HR", value: "76", unit: "bpm" }).status).toBe("in-range");
  });

  it("treats a bound itself as in range", () => {
    expect(assessVital({ kind: "HR", value: "60", unit: "bpm" }).status).toBe("in-range");
    expect(assessVital({ kind: "HR", value: "100", unit: "bpm" }).status).toBe("in-range");
    expect(assessVital({ kind: "HR", value: "101", unit: "bpm" }).status).toBe("out-of-range");
  });

  // -------------------------------------------------------------------------
  // Unit awareness. This is the case that makes the ranges unit-keyed rather
  // than unit-agnostic.
  // -------------------------------------------------------------------------
  it("does not score a Fahrenheit temperature against Celsius bounds", () => {
    // 98.6 °F is a healthy adult. Against the Celsius bounds it is a verdict of
    // catastrophic hyperthermia.
    expect(assessVital({ kind: "temperature", value: "98.6", unit: "°F" }).status).toBe("in-range");
    expect(assessVital({ kind: "temperature", value: "37.0", unit: "°C" }).status).toBe("in-range");
    expect(assessVital({ kind: "temperature", value: "39.4", unit: "°C" }).status).toBe(
      "out-of-range",
    );
    expect(assessVital({ kind: "temperature", value: "102.9", unit: "°F" }).status).toBe(
      "out-of-range",
    );
  });

  it("keeps the two glucose scales apart", () => {
    // 5.5 mmol/L is normal; 5.5 mg/dL would be profound hypoglycaemia.
    expect(assessVital({ kind: "glucose", value: "5.5", unit: "mmol/L" }).status).toBe("in-range");
    expect(assessVital({ kind: "glucose", value: "5.5", unit: "mg/dL" }).status).toBe(
      "out-of-range",
    );
  });

  // -------------------------------------------------------------------------
  // Unclassified is a REAL third state, and it is not "normal".
  // -------------------------------------------------------------------------
  it("refuses to judge a reading with no unit", () => {
    const a = assessVital({ kind: "temperature", value: "98.6", unit: null });
    expect(a.status).toBe("unclassified");
    expect(a.reason).toBe("unknown-unit");
    // Not asserted as a pass. `toneFor` maps it to the neutral tint because
    // VitalStatCard has no third tone, and the SCREEN is what must separate it
    // — see PatientRecordScreen's "Not checked against a reference range".
    expect(a.breached).toHaveLength(0);
  });

  it("refuses to judge a kind it holds no bounds for", () => {
    const a = assessVital({ kind: "peak flow", value: "410", unit: "L/min" });
    expect(a.status).toBe("unclassified");
    expect(a.reason).toBe("unknown-kind");
  });

  it("refuses to judge a kind reported in a unit it has no bounds for", () => {
    const a = assessVital({ kind: "heart_rate", value: "76", unit: "mmHg" });
    expect(a.status).toBe("unclassified");
    expect(a.reason).toBe("unknown-unit");
  });

  it("refuses a half-written pair rather than scoring the half it can read", () => {
    const a = assessVital({ kind: "blood_pressure", value: "145/", unit: "mmHg" });
    expect(a.status).toBe("unclassified");
    expect(a.reason).toBe("unreadable-value");
  });

  it("refuses a value with no number in it", () => {
    expect(assessVital({ kind: "HR", value: "—", unit: "bpm" }).status).toBe("unclassified");
    expect(assessVital({ kind: "HR", value: "", unit: "bpm" }).status).toBe("unclassified");
  });

  it("reads a number out of a value that carries its unit inline", () => {
    // The old roster wrote SpO₂ as "98%" with an empty unit column.
    expect(assessVital({ kind: "SpO₂", value: "91%", unit: "%" }).status).toBe("out-of-range");
  });
});
