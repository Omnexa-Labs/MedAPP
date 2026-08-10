// Reference ranges for clinical observations — the ONE place a reading is
// judged in-range or out-of-range.
//
// ===========================================================================
// WHY THIS FILE EXISTS
// ===========================================================================
// `RecordVital` used to carry `abnormal?: boolean`, and nothing computed it. It
// was hand-typed in the mock — one `true`, on one blood pressure — so the flag
// was a property of the FIXTURE, not of the reading. The consequence was
// waiting in the wire type: `VitalOutWire` is `{kind, value, unit}` with no
// bounds anywhere, so the moment real vitals arrived EVERY reading would have
// rendered untinted and unqualified. A 91% oxygen saturation would have shown
// as an ordinary number.
//
// So `abnormal` is gone from the type. Callers pass a reading and get an
// assessment; there is no prop through which a screen can assert a verdict.
//
// ===========================================================================
// UNIT-AWARE, AND STRICTLY SO
// ===========================================================================
// Bounds are declared PER UNIT and are never converted. A temperature of 98.6
// is a healthy adult in °F and a corpse in °C, and `unit` is `string | null` on
// the wire — so a reading whose unit is missing, or is not one this table
// declares bounds for, is `unclassified`. It is NOT assumed to be the common
// unit, and it is NOT assumed to be normal.
//
// `unclassified` is a real third state and the screen must render it as one.
// Collapsing it into "normal" is the exact defect this file was written to
// remove, one level up.
//
// ===========================================================================
// WHAT IS NOT MODELLED — READ BEFORE EXTENDING
// ===========================================================================
// These are ADULT ranges. `audience` is on every entry, and it is `"adult"` on
// every entry, because that is the only cohort declared here.
//
// Paediatric, neonatal and pregnancy ranges differ substantially (an infant's
// normal heart rate is above an adult's tachycardia threshold), and sex-specific
// intervals exist for several analytes. None of that is modelled, and it CANNOT
// be from what the app receives: `PatientBundleWire` carries `patient_id`,
// `user_id` and `display_name` — no date of birth, no sex. The age on the old
// patient-record fixture was fabricated, so deriving a cohort from it would have
// been deriving a clinical threshold from an invented number.
//
// `audience` therefore exists as a field rather than as a comment: when
// demographics reach the client, entries for other cohorts are added beside
// these and `assessVital` gains a cohort argument. Until then a paediatric
// reading is scored against adult bounds, which is why the caller-facing
// `ReferenceRange.label` says "adult" in words wherever it is surfaced.
//
// Thresholds are conventional adult reference intervals for OBSERVATION
// FLAGGING — the point at which a reading is worth a clinician's eye — not
// diagnostic criteria. Nothing here diagnoses, and no copy derived from it may.

/**
 * Canonical vital kinds this table has bounds for.
 *
 * `kind` is FREE TEXT on the wire (`max_length=64`, not an enum — see
 * features/overview/api.ts), so this is a normalisation TARGET, not a parse of
 * the wire value. An unrecognised kind is carried through and assessed as
 * `unclassified`; it is never dropped, because a vital the UI cannot name is
 * still a vital somebody recorded.
 */
export type VitalKind =
  | "heart_rate"
  | "blood_pressure"
  | "oxygen_saturation"
  | "respiratory_rate"
  | "temperature"
  | "blood_glucose";

/** Which half of a paired reading a range describes. `null` for scalar kinds. */
export type VitalComponent = "systolic" | "diastolic" | null;

export interface ReferenceRange {
  kind: VitalKind;
  /** For paired readings. Blood pressure has two ranges; everything else has one. */
  component: VitalComponent;
  /** The unit these bounds are expressed in. Bounds are NEVER converted. */
  unit: string;
  /** Inclusive. A reading exactly on a bound is in range. */
  low: number;
  high: number;
  /** The cohort the bounds describe. See the header: only `adult` exists. */
  audience: "adult";
  /** Spoken form, e.g. "94–100 % (adult)". Copy, so it is decided once. */
  label: string;
}

export type VitalStatus = "in-range" | "out-of-range" | "unclassified";

export interface VitalAssessment {
  status: VitalStatus;
  /** The ranges applied. Empty when `unclassified`. */
  ranges: readonly ReferenceRange[];
  /**
   * The subset of `ranges` the reading actually fell outside. Empty unless
   * `out-of-range`. Kept separate so a blood pressure whose DIASTOLIC alone is
   * high is described by the diastolic bound — naming the systolic one there
   * would point a clinician at the half that was fine.
   */
  breached: readonly ReferenceRange[];
  /**
   * Why nothing could be decided. Present only when `unclassified`, and worded
   * for a clinician reading the screen, not for a log.
   */
  reason?: "unknown-kind" | "unknown-unit" | "unreadable-value";
}

function range(
  kind: VitalKind,
  component: VitalComponent,
  unit: string,
  low: number,
  high: number,
  label: string,
): ReferenceRange {
  return { kind, component, unit, low, high, audience: "adult", label };
}

/**
 * The table. Keyed `kind|unit` so a lookup is one step and adding a unit is one
 * line rather than a branch — the paired kinds hold two entries.
 *
 * Units are the NORMALISED forms produced by `normaliseUnit`, not the raw wire
 * strings.
 */
const RANGES: Readonly<Record<string, readonly ReferenceRange[]>> = {
  "heart_rate|bpm": [range("heart_rate", null, "bpm", 60, 100, "60–100 bpm (adult, at rest)")],
  "blood_pressure|mmHg": [
    range("blood_pressure", "systolic", "mmHg", 90, 139, "systolic 90–139 mmHg (adult)"),
    range("blood_pressure", "diastolic", "mmHg", 60, 89, "diastolic 60–89 mmHg (adult)"),
  ],
  "oxygen_saturation|%": [
    range("oxygen_saturation", null, "%", 94, 100, "94–100 % (adult, on room air)"),
  ],
  "respiratory_rate|/min": [
    range("respiratory_rate", null, "/min", 12, 20, "12–20 breaths/min (adult, at rest)"),
  ],
  // Both scales are declared. Neither is converted into the other — see header.
  "temperature|°C": [range("temperature", null, "°C", 36.1, 37.9, "36.1–37.9 °C (adult)")],
  "temperature|°F": [range("temperature", null, "°F", 97.0, 100.2, "97.0–100.2 °F (adult)")],
  "blood_glucose|mmol/L": [
    range("blood_glucose", null, "mmol/L", 4.0, 7.8, "4.0–7.8 mmol/L (adult, random)"),
  ],
  "blood_glucose|mg/dL": [
    range("blood_glucose", null, "mg/dL", 72, 140, "72–140 mg/dL (adult, random)"),
  ],
};

/** Strip everything that is not a letter or a digit, and lowercase. */
function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Wire `kind` (and the label a screen shows) onto a canonical kind.
 *
 * Deliberately a fixed synonym table rather than a fuzzy match: a substring
 * rule that turned "blood glucose" into blood PRESSURE would score a sugar
 * against mmHg bounds, and the failure would look like a working feature.
 * Anything absent returns null and is assessed as `unclassified`.
 */
export function normaliseKind(raw: string): VitalKind | null {
  const SYNONYMS: Readonly<Record<string, VitalKind>> = {
    heartrate: "heart_rate",
    hr: "heart_rate",
    pulse: "heart_rate",
    pulserate: "heart_rate",
    bloodpressure: "blood_pressure",
    bp: "blood_pressure",
    // "SpO₂" folds to "spo" — the subscript two is not [a-z0-9].
    spo: "oxygen_saturation",
    spo2: "oxygen_saturation",
    sao2: "oxygen_saturation",
    o2sat: "oxygen_saturation",
    oxygensaturation: "oxygen_saturation",
    oxygensat: "oxygen_saturation",
    respiratoryrate: "respiratory_rate",
    resprate: "respiratory_rate",
    rr: "respiratory_rate",
    breathingrate: "respiratory_rate",
    temperature: "temperature",
    temp: "temperature",
    bodytemperature: "temperature",
    bloodglucose: "blood_glucose",
    glucose: "blood_glucose",
    bloodsugar: "blood_glucose",
    bg: "blood_glucose",
  };
  return SYNONYMS[fold(raw)] ?? null;
}

/**
 * Wire `unit` onto the exact spelling the table is keyed by.
 *
 * A null or blank unit returns null — see the header. There is no default unit
 * per kind, because "assume the usual one" is how a °F reading gets scored
 * against °C bounds.
 */
export function normaliseUnit(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  // "%" MUST be tested before folding. Every character in it is stripped by
  // `fold`, so it is indistinguishable from a blank unit afterwards — which
  // made every oxygen saturation unclassifiable, the exact reading this file
  // exists to flag.
  if (raw.trim() === "%") return "%";
  const folded = fold(raw);
  if (folded === "") return null;
  if (folded === "percent" || folded === "spo2") return "%";
  const UNITS: Readonly<Record<string, string>> = {
    bpm: "bpm",
    beatsmin: "bpm",
    beatsperminute: "bpm",
    min1: "/min",
    breathsmin: "/min",
    breathsperminute: "/min",
    brpm: "/min",
    mmhg: "mmHg",
    c: "°C",
    degc: "°C",
    celsius: "°C",
    f: "°F",
    degf: "°F",
    fahrenheit: "°F",
    mmoll: "mmol/L",
    mgdl: "mg/dL",
  };
  return UNITS[folded] ?? null;
}

/**
 * Numbers inside a reading, in order.
 *
 * `value` is a STRING on the wire ("122/80") and must never be coerced with
 * `Number()`, which yields NaN for the pair and 98 for "98%". This pulls out the
 * numeric runs and leaves the caller to decide how many it needed.
 */
function numbersIn(value: string): number[] {
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Judge one reading against the table.
 *
 * The ONLY function that decides whether a vital is abnormal. Screens call this;
 * they do not accept a flag, and there is no prop for one.
 */
export function assessVital(reading: {
  kind: string;
  value: string;
  unit: string | null | undefined;
}): VitalAssessment {
  const kind = normaliseKind(reading.kind);
  if (!kind) return { status: "unclassified", ranges: [], breached: [], reason: "unknown-kind" };

  const unit = normaliseUnit(reading.unit);
  if (!unit) return { status: "unclassified", ranges: [], breached: [], reason: "unknown-unit" };

  const ranges = RANGES[`${kind}|${unit}`];
  // A kind we know, in a unit we hold no bounds for (a heart rate reported in
  // mmHg, say). Not an error to hide — a verdict we cannot give.
  if (!ranges) return { status: "unclassified", ranges: [], breached: [], reason: "unknown-unit" };

  const numbers = numbersIn(reading.value);
  // A paired kind needs both halves. "145/" is not a blood pressure, and
  // scoring the systolic alone would silently drop half the reading.
  if (numbers.length < ranges.length) {
    return { status: "unclassified", ranges: [], breached: [], reason: "unreadable-value" };
  }

  const breached = ranges.filter((r, index) => {
    const n = numbers[index];
    return n < r.low || n > r.high;
  });

  return { status: breached.length > 0 ? "out-of-range" : "in-range", ranges, breached };
}

/**
 * The `tone` a `VitalStatCard` should render for a reading.
 *
 * A COMPUTED property with no caller-supplied path. `unclassified` maps to
 * `normal`, which is the neutral tint — VitalStatCard's `normal` makes no
 * textual claim, and the abnormal state's mandatory words are what would be the
 * lie. Screens must still SEPARATE unclassified readings visibly rather than
 * mixing them in as though they had passed a check; see PatientRecordScreen.
 */
export function toneFor(assessment: VitalAssessment): "normal" | "abnormal" {
  return assessment.status === "out-of-range" ? "abnormal" : "normal";
}

/**
 * The words beside the abnormal glyph. States the fact and names the bound it
 * fell outside; it does not diagnose, and BRAND forbids alarm language here.
 *
 * Built from `breached`, not `ranges` — a blood pressure of 124/92 is described
 * by the diastolic bound alone.
 */
export function abnormalLabelFor(assessment: VitalAssessment): string {
  if (assessment.breached.length === 0) return "Outside the reference range";
  return `Outside ${assessment.breached.map((r) => r.label).join(" and ")}`;
}
