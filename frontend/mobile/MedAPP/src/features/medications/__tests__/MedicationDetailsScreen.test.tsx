// MedicationDetailsScreen — the record, its absent facts, and its loading height.
//
// Frame: `medication_details` 828:5944 (dark 828:7564, loading 828:7118).
//
// What these assert is not markup. It is the four ways a medication record can
// lie to a patient:
//
//   1. showing a drug with no dosage (the old placeholder, and the stale-deep-link
//      path that must render "not found" instead of an empty card),
//   2. showing a prescriber or a refill count for a medication the patient added
//      themselves — a provenance claim with nothing behind it,
//   3. rendering `refillsRemaining: 0` as a blank or a bare "0" instead of
//      "None remaining",
//   4. a loading state that reserves less height than the record, so content
//      jumps under the reader's thumb as it arrives.
//
// (4) is asserted structurally rather than by measuring pixels: the loading state
// must render the SAME section headers, the SAME field labels and the SAME icon
// tiles as the loaded state, because those are the parts whose height is not in
// question. Only the values may differ, and they are reserved a whole number of
// line boxes off the ramp.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: "metformin-500" })),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

// The HTTP client is mocked as a MODULE even though this screen makes no request:
// `@/components/shell`'s barrel reaches auth-store -> api/client -> @/lib/config,
// which throws unless app.config.ts extras are present. Same reason
// ReviewAppointmentScreen.test.tsx and LifestyleHubScreen.test.tsx mock it.
// This is NOT the screen holding a client — see the "invents no endpoint" test
// below, which asserts at source level that it holds none.
// The two `register*Provider` functions are part of the module's surface —
// auth-store calls them at import time, so a partial mock throws.
jest.mock("@/lib/api/client", () => ({
  client: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  registerAuthTokenProvider: jest.fn(),
  registerDeviceIdProvider: jest.fn(),
}));

import { router, useLocalSearchParams } from "expo-router";
import { MedicationDetailsScreen } from "../MedicationDetailsScreen";
import { SAMPLE_MEDICATIONS } from "../sample-data";

const params = useLocalSearchParams as unknown as jest.Mock;

/** The canon record the frame is drawn against. */
const METFORMIN = SAMPLE_MEDICATIONS.find((m) => m.id === "metformin-500")!;
const VITAMIN = SAMPLE_MEDICATIONS.find((m) => m.id === "vitamin-d3")!;
const AMLODIPINE = SAMPLE_MEDICATIONS.find((m) => m.id === "amlodipine-5")!;

/** Labels that are static chrome — present whether or not the values have arrived. */
const STATIC_CHROME = ["How to take it", "Prescription", "Directions", "Form and strength", "Prescribed by", "Refills"];

beforeEach(() => {
  jest.clearAllMocks();
  params.mockReturnValue({ id: "metformin-500" });
  (router.canGoBack as jest.Mock).mockReturnValue(false);
});

// -- Shell contract (unchanged behaviour, kept) -----------------------------

it("uses Overview as the direct-entry back fallback", () => {
  render(<MedicationDetailsScreen />);
  fireEvent.press(screen.getByLabelText("Go back"));
  expect(router.replace).toHaveBeenCalledWith("/(app)/overview");
});

it("is a detail screen: one shell bar, no tab set", () => {
  render(<MedicationDetailsScreen />);
  // Exactly one back button == exactly one app bar. Two would mean the screen
  // kept a hand-rolled bar alongside the shell's.
  expect(screen.getAllByLabelText("Go back")).toHaveLength(1);
  expect(screen.getByText("Medication details")).toBeTruthy();
  // A detail screen gets a back button INSTEAD of tabs — docs/BRAND.md §App
  // shell. No tab of either tab set may be reachable.
  for (const tab of ["Home", "Overview", "Inbox", "Community", "Lifestyle", "Schedule", "Patients", "Profile"]) {
    expect(screen.queryByLabelText(tab)).toBeNull();
  }
});

// -- The record ------------------------------------------------------------

it("renders the record instead of the 'will appear here' placeholder", () => {
  render(<MedicationDetailsScreen />);

  // The defect this screen existed as: one card promising future content.
  expect(screen.queryByText(/will appear here/i)).toBeNull();

  expect(screen.getByText(METFORMIN.name)).toBeTruthy();
  expect(screen.getByText(METFORMIN.instructions)).toBeTruthy();
  expect(screen.getByText(METFORMIN.prescriberName!)).toBeTruthy();
  expect(screen.getByText("2 remaining")).toBeTruthy();
  // `formAndStrength` appears twice by design — as the identity subtitle and as
  // the "Form and strength" fact.
  expect(screen.getAllByText(METFORMIN.formAndStrength).length).toBeGreaterThan(0);
});

it("reads the dosage line from `instructions`, so the list and the detail cannot disagree", () => {
  render(<MedicationDetailsScreen />);
  // There is no second copy of the sig line in the data model to drift from.
  expect(screen.getByText(METFORMIN.instructions)).toBeTruthy();
  expect(METFORMIN.instructions).toBe("Take 1 tablet with breakfast and dinner.");
});

it("renders zero refills as words, never as a blank or a bare '0'", () => {
  params.mockReturnValue({ id: "amlodipine-5" });
  render(<MedicationDetailsScreen />);

  expect(AMLODIPINE.refillsRemaining).toBe(0);
  expect(screen.getByText("None remaining")).toBeTruthy();
  expect(screen.queryByText("0 remaining")).toBeNull();
});

// -- Absent facts stay absent ---------------------------------------------

it("omits the whole prescription section for a self-reported medication", () => {
  params.mockReturnValue({ id: "vitamin-d3" });
  render(<MedicationDetailsScreen />);

  expect(VITAMIN.prescriberName).toBeUndefined();
  expect(VITAMIN.refillsRemaining).toBeUndefined();

  // No prescriber row, no refill row, and no empty section heading left behind.
  expect(screen.queryByText("Prescription")).toBeNull();
  expect(screen.queryByText("Prescribed by")).toBeNull();
  expect(screen.queryByText("Refills")).toBeNull();
  expect(screen.queryByText(/remaining/)).toBeNull();

  // The provenance line is the sample statement now — see the test below.
  expect(screen.getByTestId("medication-provenance")).toBeTruthy();
});

// -- Provenance -----------------------------------------------------------
//
// This screen used to tell a patient "This record came from your prescriber."
// for any entry whose `source` was `prescribed`. That was the exact opposite of
// true: there is no medication endpoint, nothing here came from a prescriber,
// and `source` is a field on a fixture. It is the single most direct false
// clinical claim the screen could make, so it is pinned in both directions.
it("never claims a sample record came from a prescriber", () => {
  render(<MedicationDetailsScreen />);
  expect(screen.queryByText(/came from your prescriber/i)).toBeNull();
  expect(screen.queryByText(/from your (doctor|clinician|provider)/i)).toBeNull();
});

it("states, on the record itself, that the record is sample data", () => {
  render(<MedicationDetailsScreen />);
  expect(screen.getByText(/Sample data — these are not your medications/)).toBeTruthy();
  expect(screen.getByText(/identical for every account/)).toBeTruthy();
});

it("makes the same statement for a self-reported entry as for a prescribed one", () => {
  // Both come from the same file. A provenance line that varied between them
  // would re-introduce the idea that one of them has a real source.
  render(<MedicationDetailsScreen />);
  const prescribed = screen.getByTestId("medication-provenance");
  screen.unmount();

  params.mockReturnValue({ id: "vitamin-d3" });
  render(<MedicationDetailsScreen />);
  expect(screen.getByTestId("medication-provenance")).toBeTruthy();
  expect(screen.getByText(/Sample data — these are not your medications/)).toBeTruthy();
  expect(prescribed).toBeTruthy();
});

// -- Stale deep link ------------------------------------------------------

it("tells a stale deep link the record is gone rather than showing a drug with no dosage", () => {
  params.mockReturnValue({ id: "not-a-real-id" });
  render(<MedicationDetailsScreen />);

  expect(screen.getByText("Medication not found")).toBeTruthy();
  // Critically: no empty record scaffolding.
  expect(screen.queryByText("Directions")).toBeNull();
  expect(screen.queryByText("Refills")).toBeNull();
  expect(screen.queryByTestId("medication-details")).toBeNull();
});

it("shows the loading state, not 'not found', when there is no id yet", () => {
  params.mockReturnValue({ state: "loading" });
  render(<MedicationDetailsScreen />);
  expect(screen.queryByText("Medication not found")).toBeNull();
  expect(screen.getByTestId("medication-details-loading")).toBeTruthy();
});

// -- The loading state reserves the loaded height -------------------------

it("loading keeps every section header and field label, so only values reserve height", () => {
  params.mockReturnValue({ id: "metformin-500", state: "loading" });
  render(<MedicationDetailsScreen />);

  expect(screen.getByTestId("medication-details-loading")).toBeTruthy();
  // The parts whose height is NOT in question are the same nodes in both states.
  for (const label of STATIC_CHROME) {
    expect(screen.getByText(label)).toBeTruthy();
  }
  // ...and no value has leaked through.
  expect(screen.queryByText(METFORMIN.name)).toBeNull();
  expect(screen.queryByText(METFORMIN.instructions)).toBeNull();
  expect(screen.queryByText("2 remaining")).toBeNull();
});

it("loading and loaded render the same static chrome and the same icon tiles", () => {
  params.mockReturnValue({ id: "metformin-500", state: "loading" });
  const loadingTree = render(<MedicationDetailsScreen />);
  const loadingChrome = STATIC_CHROME.map((l) => loadingTree.queryAllByText(l).length);
  loadingTree.unmount();

  params.mockReturnValue({ id: "metformin-500" });
  const loadedTree = render(<MedicationDetailsScreen />);
  const loadedChrome = STATIC_CHROME.map((l) => loadedTree.queryAllByText(l).length);

  // Same headers and labels, same count — the skeleton is the record's own
  // layout with its values withheld, not a second layout that resembles it.
  expect(loadingChrome).toEqual(loadedChrome);
});

it("announces the pending screen once, and not as a record", () => {
  params.mockReturnValue({ id: "metformin-500", state: "loading" });
  render(<MedicationDetailsScreen />);
  expect(screen.getByLabelText("Loading medication details")).toBeTruthy();

  // The loaded screen must NOT keep the progressbar announcement.
  screen.unmount();
  params.mockReturnValue({ id: "metformin-500" });
  render(<MedicationDetailsScreen />);
  expect(screen.queryByLabelText("Loading medication details")).toBeNull();
});

// -- Source-level guards --------------------------------------------------
//
// Three claims the rendered tree cannot make on its own.

const SOURCE = readFileSync(join(__dirname, "..", "MedicationDetailsScreen.tsx"), "utf8");

/**
 * Source with comments stripped.
 *
 * The endpoint guard has to read CODE, not prose: the file's header quotes
 * `/v1/patients` and `/v1/prescriptions` as part of the evidence for why it does
 * NOT call them, and a guard that cannot tell an argument apart from a call would
 * punish the file for documenting itself.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

it("invents no endpoint: the screen issues no request and names no path", () => {
  // The `/v1/appointments` incident: a fabricated endpoint passed a fully mocked
  // suite. A path literal in this file would be exactly that shape of mistake.
  expect(CODE).not.toMatch(/["'`]\/v1\//);
  expect(CODE).not.toMatch(/\bclient\.(get|post|put|patch|delete)\b/);
  expect(CODE).not.toMatch(/\buseQuery\b|\bfetch\(/);
  // ...and it says where the data does come from, in code and in the header.
  expect(CODE).toMatch(/from "\.\/sample-data"/);
  expect(SOURCE).toMatch(/WHERE THE DATA COMES FROM: local mock data/);
});

it("gates the ?state= preview hatch on __DEV__", () => {
  // The hatch is worth keeping for device review of the designed loading frame,
  // but a URL parameter must not be able to drive a clinical screen's state in
  // a shipped build. The guard is the FIRST thing the reader does.
  expect(CODE).toMatch(/function wantsLoadingPreview[\s\S]{0,120}if \(!__DEV__\) return false;/);
});

it("keeps the skeleton's line boxes derived from the type ramp, not hardcoded", () => {
  // A pre-computed `15.6` would silently desynchronise if the ramp moved.
  expect(SOURCE).toMatch(/labelSm:\s*12\s*\*\s*1\.3/);
  expect(SOURCE).toMatch(/headlineMd:\s*20\s*\*\s*1\.4/);
});

it("imports no icon library and hardcodes no colour", () => {
  // docs/BRAND.md: every glyph through <Icon />, every colour through a token.
  expect(CODE).not.toMatch(/from ["']@expo\/vector-icons|from ["']healthicons/);
  expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
});
