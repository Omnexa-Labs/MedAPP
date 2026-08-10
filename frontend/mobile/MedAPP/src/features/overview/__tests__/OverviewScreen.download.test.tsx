// The Overview screen's "Report" download.
//
// It was a filled primary CTA with no `onPress` — it animated and returned.
// These tests assert that a real file now comes out of it, that the file
// contains only LIVE readings, and that the failure paths say so.
//
// The second half is newer and is the reason this file changed shape. The report
// used to be assembled from MED_DOSES ("Lisinopril 10mg - 08:00 AM - taken"),
// MILESTONES ("BP stabilized to 120/80 within 7 days") and DEVICES ("Apple Watch
// Ultra"), all module constants — so the button wrote a fabricated medical
// record to a file the patient could forward to a clinician. Those three are
// deleted, and the cases below assert they cannot come back through the
// builder.
//
// Kept apart from OverviewScreen.test.tsx (which locks the shell and the query
// states) so that suite keeps rendering with only the router stubbed.

import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderWithSafeArea as renderRaw } from "@/test/safe-area";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderRaw(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

jest.mock("expo-file-system", () => require("@/test/document-mocks").fileSystemMock());
jest.mock("expo-sharing", () => require("@/test/document-mocks").sharingMock());

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

import { documentMockState, onlyWrittenFile, resetDocumentMocks } from "@/test/document-mocks";

// See the sibling suite for why these three mocks are needed at all (a
// require-time throw in `@/lib/config`, reached through both the auth store and
// the API client, plus react-query's non-conditional hooks).
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ id: "me", displayName: "Ama Mensah", email: "a@b.test", avatarUrl: null }),
}));

// `mock`-prefixed so jest's out-of-scope guard permits the factory below.
const mockGetSummary = jest.fn();
const mockListVitals = jest.fn();

jest.mock("../api", () => ({
  ehrApi: {
    getSummary: (...args: unknown[]) => mockGetSummary(...args),
    getBundle: jest.fn(),
    listVitals: (...args: unknown[]) => mockListVitals(...args),
  },
}));

import { OverviewScreen } from "../OverviewScreen";

const REPORT_LABEL = "Download your health report as a text file";

function vital(kind: string, value: string, unit: string | null) {
  return {
    id: kind,
    patientId: "p1",
    recordedByUserId: "me",
    kind,
    value,
    unit,
    recordedAtIso: new Date().toISOString(),
    note: null,
  };
}

const LIVE = [vital("heart_rate", "64", "bpm"), vital("blood_pressure", "122/80", null)];

function summaryWith(latestVitals: ReturnType<typeof vital>[]) {
  return {
    patient: { patientId: "p1", userId: "me", displayName: "Ama" },
    latestVitals,
    activeConsents: [],
  };
}

beforeEach(() => {
  resetDocumentMocks();
  mockGetSummary.mockReset().mockResolvedValue(summaryWith(LIVE));
  mockListVitals.mockReset().mockResolvedValue([]);
});

/** Waits for the query to settle so the button is live before pressing it. */
async function ready() {
  await waitFor(() => expect(screen.getByText("64")).toBeTruthy());
}

/** See the equivalent helper in the scripts suite for why this waits on the mock. */
async function pressReport() {
  fireEvent.press(screen.getByLabelText(REPORT_LABEL));
  await waitFor(() => expect(documentMockState.settled).toBe(true));
  // `settled` means "the last native call was REACHED", not "the app has
  // reacted to it". On the synchronous-throw branches (file-write, and the
  // sharing-unavailable refusal) the mock flips the flag BEFORE the value
  // propagates, so the catch has not run and the toast state is not applied
  // yet. One flush makes every branch wait for the same thing.
  //
  // Still not a tree query — the reason the helper waits on a recorded side
  // effect at all is that <Toast> runs an Animated loop, so a waitFor whose
  // predicate queries the tree hangs to the jest timeout instead of failing.
  await act(async () => {});
}

describe("OverviewScreen report download", () => {
  // 20s, not the default 5s. This is the FIRST render of the screen and it
  // mounts a QueryClientProvider too; in isolation it takes ~2s, but under the
  // full suite's parallel workers it crossed 5s and failed as a timeout rather
  // than an assertion. The work is real, not a hang.
  it("writes a real report to persistent storage and offers it to the share sheet", async () => {
    render(<OverviewScreen />);
    await ready();
    await pressReport();

    const file = onlyWrittenFile();
    expect(file.path).toBe("DOCUMENT_DIR/MedAppDocuments/health-report-7d.txt");
    expect(documentMockState.shareCalls).toHaveLength(1);
    expect(documentMockState.shareCalls[0].uri).toBe(`file:///${file.path}`);
  }, 20000);

  it("writes the LIVE readings and nothing else", async () => {
    render(<OverviewScreen />);
    await ready();
    await pressReport();

    const body = onlyWrittenFile().body;
    // The readings, with the window they belong to.
    expect(body).toContain("Trend window: 7D");
    expect(body).toContain("Heart Rate: 64 bpm");
    expect(body).toContain("Blood Pressure: 122/80");
    // No patient identity — the Overview screen displays none.
    expect(body).not.toMatch(/Alex Rivers|Ama Mensah/);
  });

  it("carries none of the deleted constants into the file", async () => {
    render(<OverviewScreen />);
    await ready();
    await pressReport();

    const body = onlyWrittenFile().body;
    // Every one of these was written to disk by the previous version.
    expect(body).not.toMatch(/Lisinopril|Atorvastatin/);
    expect(body).not.toMatch(/Medication adherence/i);
    expect(body).not.toMatch(/Clinical milestones/i);
    expect(body).not.toMatch(/BP stabilized/);
    expect(body).not.toMatch(/Connected devices/i);
    expect(body).not.toMatch(/Apple Watch|Oura/);
  });

  it("follows the selected trend range instead of hardcoding 7D", async () => {
    render(<OverviewScreen />);
    await ready();
    fireEvent.press(screen.getByText("3M"));
    await pressReport();

    const file = onlyWrittenFile();
    expect(file.path).toContain("health-report-3m.txt");
    // A reading exported under the wrong window is a wrong reading.
    expect(file.body).toContain("Trend window: 3M");
  });

  it("names the file it saved", async () => {
    render(<OverviewScreen />);
    await ready();
    await pressReport();

    expect(screen.getByText("Saved health-report-7d.txt to your device")).toBeTruthy();
  });

  it("reports a write failure as a failure", async () => {
    documentMockState.failAt = "file-write";
    render(<OverviewScreen />);
    await ready();
    await pressReport();

    expect(screen.getByText(/Couldn't save/)).toBeTruthy();
    expect(screen.queryByText(/Saved .* to your device/)).toBeNull();
    expect(documentMockState.written).toHaveLength(0);
  });

  it("reports the saved file when the device offers no sharing", async () => {
    documentMockState.sharingAvailable = false;
    render(<OverviewScreen />);
    await ready();
    await pressReport();

    expect(screen.getByText(/can't share it out/)).toBeTruthy();
    expect(onlyWrittenFile().body).toContain("Trend window: 7D");
  });

  it("does not start a second write while the first is in flight", async () => {
    render(<OverviewScreen />);
    await ready();
    const button = screen.getByLabelText(REPORT_LABEL);
    fireEvent.press(button);
    fireEvent.press(button);

    await waitFor(() => expect(documentMockState.settled).toBe(true));
    expect(documentMockState.written).toHaveLength(1);
  });

  it("writes NOTHING when there are no readings to write", async () => {
    mockGetSummary.mockResolvedValue(summaryWith([]));
    render(<OverviewScreen />);
    await waitFor(() => expect(screen.getByTestId("vitals-empty")).toBeTruthy());

    // Disabled, and it says why rather than producing an empty file under a
    // name that sounds like a medical record.
    const button = screen.getByLabelText(REPORT_LABEL);
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("There are no readings to export yet.")).toBeTruthy();

    fireEvent.press(button);
    expect(documentMockState.written).toHaveLength(0);
  });
});

describe("OverviewScreen invented clinical data", () => {
  it("names no invented clinician or patient in the source", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require("path");
    const src = readFileSync(join(__dirname, "..", "OverviewScreen.tsx"), "utf8")
      // Comments stripped: the file documents WHICH constants were removed and
      // why, and that prose must survive the grep.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    for (const invented of [
      "Sarah Jenkins",
      "Mark Chen",
      "Alex Rivers",
      "Lisinopril",
      "Atorvastatin",
      "Apple Watch",
      "Oura",
      "BP stabilized",
      "TREND_METRICS",
      "MED_DOSES",
      "MILESTONES",
    ]) {
      expect(src).not.toContain(invented);
    }
    // The stranger's photograph shown as every user's avatar.
    expect(src).not.toMatch(/googleusercontent/);
  });
});
