// The Overview screen's "Report" quick action.
//
// It was a filled primary CTA with no `onPress` — it animated and returned. These
// tests assert that a real file now comes out of it, that the file contains only
// what the screen shows, and that the failure paths say so.
//
// Kept apart from OverviewScreen.test.tsx (which locks the shell migration) so
// that suite keeps rendering with only the router stubbed.

import { readFileSync } from "fs";
import { join } from "path";
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
// OverviewScreen now reads live vitals, which pulls in three things this suite
// did not previously need. Predicted in docs/api/inbox_service.md after the
// chat migration hit the identical trio:
//   1. `@/hooks/use-current-user` -> auth-store -> `@/lib/config`, which THROWS
//      at require time under Jest (the landmine AccountMenu.tsx documents).
//   2. `./api` -> `@/lib/api/client` -> the same throw.
//   3. react-query hooks cannot be conditional, so a QueryClientProvider is
//      required even though these cases never exercise a live fetch.
// NULL on purpose, unlike the sibling suite. `useQuery` here is
// `enabled: Boolean(currentUser?.id)`, so a null user leaves the EHR query
// disabled and this suite fires no async state update at all. That matters:
// these cases press "Report" immediately after render and assert on the file
// body, and a summary resolving mid-press re-renders the metrics underneath
// them. This suite covers the report writer, not the EHR read — the sibling
// suite covers the live path — so the quiet harness is the correct one.
jest.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => null,
}));
jest.mock("../api", () => ({
  ehrApi: {
    getSummary: jest.fn(async () => ({ patient: null, latestVitals: [], activeConsents: [] })),
    getBundle: jest.fn(async () => ({ patient: null, vitals: [], consents: [] })),
    listVitals: jest.fn(async () => []),
  },
}));

import { OverviewScreen } from "../OverviewScreen";

const REPORT_LABEL = "Download your health report as a text file";

beforeEach(() => {
  resetDocumentMocks();
});

/** See the equivalent helper in the scripts suite for why this waits on the mock. */
async function pressReport() {
  fireEvent.press(screen.getByLabelText(REPORT_LABEL));
  await waitFor(() => expect(documentMockState.settled).toBe(true));
  // `settled` means "the last native call was REACHED", not "the app has
  // reacted to it". On the synchronous-throw branches (file-write, and the
  // sharing-unavailable refusal) the mock flips the flag BEFORE the value
  // propagates, so the catch has not run and the toast state is not applied
  // yet. The success path only passes without this because shareAsync resolves
  // asynchronously and hands over a spare microtask. One flush makes every
  // branch wait for the same thing: the app having reacted.
  //
  // Still not a tree query - the reason the helper waits on a recorded side
  // effect at all is that <Toast> runs an Animated loop, so a waitFor whose
  // predicate queries the tree hangs to the jest timeout instead of failing.
  await act(async () => {});
}

describe("OverviewScreen report download", () => {
  // 20s, not the default 5s. This is the FIRST render of a 780-line screen and
  // it now mounts a QueryClientProvider too; in isolation it takes ~2s, but
  // under the full suite's parallel workers it crossed 5s and failed as a
  // timeout rather than an assertion. The work is real, not a hang — the same
  // case passes serially — so the budget is raised rather than the setup faked.
  it("writes a real report to persistent storage and offers it to the share sheet", async () => {
    render(<OverviewScreen />);
    await pressReport();

    const file = onlyWrittenFile();
    expect(file.path).toBe("DOCUMENT_DIR/MedAppDocuments/health-report-7d.txt");
    expect(documentMockState.shareCalls).toHaveLength(1);
    expect(documentMockState.shareCalls[0].uri).toBe(`file:///${file.path}`);
  }, 20000);

  it("writes the screen's own content and nothing else", async () => {
    render(<OverviewScreen />);
    await pressReport();

    const body = onlyWrittenFile().body;
    // Vitals, with the window they belong to.
    expect(body).toContain("Trend window: 7D");
    expect(body).toContain("Heart Rate: 72 bpm");
    expect(body).toContain("Blood Pressure: 118 /76");
    // Adherence, spelled out rather than as a boolean.
    expect(body).toContain("Lisinopril 10mg - 08:00 AM - taken");
    expect(body).toContain("Atorvastatin 20mg - 09:00 PM - not yet taken");
    // Milestones and devices.
    expect(body).toContain("Cardiology Consultation");
    expect(body).toContain("Apple Watch Ultra");
    // No patient identity — the Overview screen displays none.
    expect(body).not.toMatch(/Alex Rivers|Ama Mensah/);
  });

  it("follows the selected trend range instead of hardcoding 7D", async () => {
    render(<OverviewScreen />);
    fireEvent.press(screen.getByText("3M"));
    await pressReport();

    const file = onlyWrittenFile();
    expect(file.path).toContain("health-report-3m.txt");
    // A vitals figure exported under the wrong window is a wrong reading.
    expect(file.body).toContain("Trend window: 3M");
  });

  it("names the file it saved", async () => {
    render(<OverviewScreen />);
    await pressReport();

    expect(screen.getByText("Saved health-report-7d.txt to your device")).toBeTruthy();
  });

  it("reports a write failure as a failure", async () => {
    documentMockState.failAt = "file-write";
    render(<OverviewScreen />);
    await pressReport();

    expect(screen.getByText(/Couldn't save/)).toBeTruthy();
    expect(screen.queryByText(/Saved .* to your device/)).toBeNull();
    expect(documentMockState.written).toHaveLength(0);
  });

  it("reports the saved file when the device offers no sharing", async () => {
    documentMockState.sharingAvailable = false;
    render(<OverviewScreen />);
    await pressReport();

    expect(screen.getByText(/can't share it out/)).toBeTruthy();
    expect(onlyWrittenFile().body).toContain("Trend window: 7D");
  });

  it("does not start a second write while the first is in flight", async () => {
    render(<OverviewScreen />);
    const button = screen.getByLabelText(REPORT_LABEL);
    fireEvent.press(button);
    fireEvent.press(button);

    await waitFor(() => expect(documentMockState.settled).toBe(true));
    expect(documentMockState.written).toHaveLength(1);
  });
});

describe("OverviewScreen clinical data", () => {
  // These names now reach a file the user keeps and may forward to a clinician, so
  // a fabricated prescriber is no longer merely cosmetic. The roster is
  // scripts/seed_dev_data.py.
  const SEEDED_DOCTORS = [
    "Kwabena Osei",
    "Adjoa Boateng",
    "Yaw Darko",
    "Efua Asante",
    "Nii Tetteh",
    "Abena Owusu",
  ];

  it("names only seeded doctors on screen", () => {
    render(<OverviewScreen />);
    for (const invented of ["Dr. Sarah Jenkins", "Dr. Mark Chen", "Dr. Jenkins"]) {
      expect(screen.queryByText(invented)).toBeNull();
    }
    expect(screen.getByText("Dr. Adjoa Boateng")).toBeTruthy();
    expect(screen.getByText("Dr. Kwabena Osei")).toBeTruthy();
  });

  it("exports no invented clinician", async () => {
    render(<OverviewScreen />);
    await pressReport();

    const body = onlyWrittenFile().body;
    expect(body).not.toMatch(/Jenkins|Mark Chen/);
    expect(SEEDED_DOCTORS.some((name) => body.includes(name))).toBe(true);
  });

  it("keeps invented names out of the source, so no path can reintroduce them", () => {
    const src = readFileSync(join(__dirname, "..", "OverviewScreen.tsx"), "utf8")
      // Comments stripped: the file documents WHICH invented names were replaced
      // and why, and that prose must survive the grep.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(src).not.toMatch(/Sarah Jenkins/);
    expect(src).not.toMatch(/Mark Chen/);
    expect(src).not.toMatch(/Dr\. Jenkins/);
  });
});
