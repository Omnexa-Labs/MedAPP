// Document TEXT, built as pure functions.
//
// Separate from saveTextDocument.ts on purpose: the layout of a clinical record
// is the part worth testing exhaustively, and here it can be asserted
// character-for-character with no native module in sight. The screens stay
// presentational — they hand over the values they already render and get a
// string back.
//
// THE CONTENT RULE, which is the whole reason these are functions and not
// template strings inlined at the call site:
// A builder may only write values its CALLER already displays. It invents no
// dosage, no date, no prescriber, no clinical reading, and it has no sample data
// of its own to fall back on — a missing field is omitted from the document
// rather than filled in. An exported file outlives the screen that produced it,
// so a plausible-looking guess in here is a fabricated medical record.
//
// Clinician names come from the seeded roster (scripts/seed_dev_data.py: doctors
// Kwabena Osei, Adjoa Boateng, Yaw Darko, Efua Asante, Nii Tetteh, Abena Owusu).
// No name is hardcoded in this file at all, which is the structural version of
// that rule: there is nowhere here for an invented "Dr. Sarah Jenkins" to live.

/** ASCII only. A .txt opened in Notepad on Windows should not show mojibake. */
const RULE = "=".repeat(60);
const THIN_RULE = "-".repeat(60);

/** Drops empty sections instead of printing a heading over nothing. */
function section(heading: string, lines: (string | null | undefined)[]): string[] {
  const kept = lines.filter((line): line is string => Boolean(line && line.trim()));
  if (kept.length === 0) return [];
  return ["", heading.toUpperCase(), THIN_RULE, ...kept];
}

/** `Label: value`, or nothing when the screen had no value to show. */
function field(label: string, value: string | null | undefined): string | null {
  return value && value.trim() ? `${label}: ${value.trim()}` : null;
}

/**
 * The footer every document carries.
 *
 * It says what the file IS, because a patient who mails this to a pharmacy needs
 * the receiving end to know it is a patient-exported copy and not a dispensable
 * instrument. The "not a substitute" line is the honest counterpart to the
 * on-screen "Verified" chip, which this file cannot carry over: nothing in the
 * export is signed.
 */
function footer(generatedAt: string): string[] {
  return [
    "",
    RULE,
    `Exported from MedApp on ${generatedAt}`,
    "Patient-exported copy. Not a signed or dispensable document,",
    "and not a substitute for advice from your care team.",
    RULE,
  ];
}

// ---------------------------------------------------------------------------
// Prescription record — ActiveScriptViewScreen / ActiveScriptShareScreen
// ---------------------------------------------------------------------------

/**
 * Exactly the fields the Rx document on screen renders, all optional because the
 * screen's params are.
 *
 * Deliberately absent: the signature hash and the QR image. The hash shown on
 * screen is the placeholder `SHA-256: f1e2d3c4b5a6…` — copying a truncated fake
 * integrity check into a file that claims to be a record is the same lie in a
 * new container, so the export omits it and the footer says the copy is unsigned.
 */
export interface PrescriptionDocumentFields {
  drug?: string;
  patient?: string;
  scriptId?: string;
  prescriber?: string;
  issuedDate?: string;
  rxNumber?: string;
  dob?: string;
  clinic?: string;
  license?: string;
  quantity?: string;
  refills?: string;
  instructions?: string;
  indication?: string;
  /** Formatted by the caller — builders stay pure and clock-free. */
  generatedAt: string;
}

export function buildPrescriptionDocument(f: PrescriptionDocumentFields): string {
  return [
    RULE,
    "MEDAPP - DIGITAL PRESCRIPTION RECORD",
    RULE,
    ...[field("Rx number", f.rxNumber), field("Issued", f.issuedDate)].filter(Boolean),
    ...section("Patient", [
      f.patient ?? null,
      field("ID", f.scriptId),
      field("Date of birth", f.dob),
    ]),
    ...section("Prescriber", [f.prescriber ?? null, f.clinic ?? null, field("License", f.license)]),
    ...section("Medication", [
      f.drug ?? null,
      field("Quantity", f.quantity),
      field("Refills", f.refills),
      field("Indication", f.indication),
    ]),
    ...section("Instructions", [f.instructions ?? null]),
    ...footer(f.generatedAt),
    "",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

/**
 * `prescription-lisinopril-10mg-8829-x.txt`.
 *
 * Built from the record rather than a timestamp so re-downloading overwrites the
 * same file instead of littering storage with near-identical copies.
 */
export function prescriptionFileName(f: Pick<PrescriptionDocumentFields, "drug" | "scriptId">) {
  return `${slug(["prescription", f.drug, f.scriptId])}.txt`;
}

// ---------------------------------------------------------------------------
// Health report — OverviewScreen
// ---------------------------------------------------------------------------

export interface HealthReportMetric {
  label: string;
  value: string;
  unit: string;
}

export interface HealthReportDose {
  name: string;
  time: string;
  taken: boolean;
}

export interface HealthReportMilestone {
  date: string;
  title: string;
  body: string;
}

export interface HealthReportDevice {
  name: string;
  syncedAgo: string;
}

/**
 * The Overview screen's own content, nothing more.
 *
 * No patient name: the Overview screen does not display one, so the export does
 * not get to add one. The 7-day sparkline bar arrays are also left out — they are
 * static design values with no dates or units attached, and a column of bare
 * numbers under a real vitals heading would read as measurements.
 */
export interface HealthReportFields {
  /** The selected 7D/1M/3M/1Y range, so the numbers have a stated window. */
  range: string;
  metrics: HealthReportMetric[];
  doses: HealthReportDose[];
  milestones: HealthReportMilestone[];
  devices: HealthReportDevice[];
  generatedAt: string;
}

export function buildHealthReportDocument(f: HealthReportFields): string {
  return [
    RULE,
    "MEDAPP - HEALTH OVERVIEW REPORT",
    RULE,
    `Trend window: ${f.range}`,
    ...section(
      "Latest vitals",
      f.metrics.map((m) => `${m.label}: ${m.value} ${m.unit}`.trim()),
    ),
    ...section(
      "Medication adherence",
      f.doses.map((d) => `${d.name} - ${d.time} - ${d.taken ? "taken" : "not yet taken"}`),
    ),
    ...section(
      "Clinical milestones",
      f.milestones.flatMap((m) => [`${m.date} - ${m.title}`, `  ${m.body}`]),
    ),
    ...section(
      "Connected devices",
      f.devices.map((d) => `${d.name} - ${d.syncedAgo}`),
    ),
    ...footer(f.generatedAt),
    "",
  ].join("\n");
}

export function healthReportFileName(f: Pick<HealthReportFields, "range">) {
  return `${slug(["health-report", f.range])}.txt`;
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * Filename-safe lowercase slug.
 *
 * Not cosmetic: the screens' script ids look like `#8829-X`, and `#` in a
 * filename is a URI fragment delimiter once the path becomes a `file://` URL.
 * Anything outside `[a-z0-9]` collapses to a single hyphen.
 */
function slug(parts: (string | undefined)[]): string {
  const joined = parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return joined || "medapp-document";
}

/**
 * `5 Aug 2026, 14:32` — the timestamp in every footer.
 *
 * Here rather than in src/lib/format so the two callers cannot drift, and taking
 * an injected `Date` so the builders' tests stay deterministic. Locale is fixed
 * to en-GB: the file may be read on a machine other than the one that wrote it,
 * and `05/08/2026` is ambiguous across regions in a way `5 Aug 2026` is not.
 */
export function formatDocumentTimestamp(date: Date = new Date()): string {
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${date.getFullYear()}, ${hh}:${mm}`;
}
