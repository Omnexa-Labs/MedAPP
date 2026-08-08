// The download controls on both script screens.
//
// Separate suite from ActiveScriptScreens.test.tsx because these two need the
// native file-system and sharing modules mocked, and that suite deliberately
// renders with nothing stubbed but the router.
//
// What is being guarded: the "Download PDF" button on the view screen ran an
// animation and wrote nothing, and the "Download PDF" row on the share screen had
// no `onPress` at all. Both now produce a real file — so the tests assert the
// FILE, and assert that no control anywhere still says PDF.
//
// Every value below is supplied BY THIS SUITE as route params. That is the
// second thing being guarded: the screens used to fall back to clinical
// constants, so an earlier version of this file asserted that the written
// document contained "Quantity: 30 Tablets" and "Indication: Hypertension
// management" — a test pinning fabricated clinical data into a persisted file.
// The file may now contain only what the caller passed.

import { readFileSync } from "fs";
import { join } from "path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-file-system", () => require("@/test/document-mocks").fileSystemMock());
jest.mock("expo-sharing", () => require("@/test/document-mocks").sharingMock());

/** Mutable so a case can vary the script; reset in `beforeEach`. */
const searchParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => searchParams,
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { documentMockState, onlyWrittenFile, resetDocumentMocks } from "@/test/document-mocks";
import { ActiveScriptShareScreen } from "../ActiveScriptShareScreen";
import { ActiveScriptViewScreen } from "../ActiveScriptViewScreen";

const DOWNLOAD_LABEL = "Download a text copy of this prescription";

/** The five core fields both screens require. */
const CORE = {
  drug: "Amlodipine 5mg",
  patient: "Ama Mensah",
  scriptId: "#4471-B",
  prescriber: "Dr. Adjoa Boateng",
  issuedDate: "3 Aug 2026",
};

/** The optional clinical fields, which only a caller can supply. */
const RICH = {
  ...CORE,
  quantity: "28 Tablets",
  refills: "1 Remaining",
  indication: "Blood pressure control",
  dob: "14 Feb 1979",
  license: "GH-MDC-4410",
  clinic: "Korle Bu Cardiology",
  instructions: "One tablet each morning",
  rxNumber: "#RX-4471",
};

function setParams(values: Record<string, string>) {
  for (const key of Object.keys(searchParams)) delete searchParams[key];
  Object.assign(searchParams, values);
}

beforeEach(() => {
  resetDocumentMocks();
  setParams(CORE);
});

/**
 * Presses Download and waits for the save to finish.
 *
 * The wait is on the MOCK, not on the toast text, and that is not a style
 * preference. <Toast> mounts conditionally and starts an `Animated.parallel` in
 * its mount effect; polling for its text inside `waitFor` puts an animation loop
 * inside act()'s flush and the poll never gets a turn — the test hangs to the
 * jest timeout rather than failing with "unable to find". Waiting on the recorded
 * side effect settles, after which the toast's state update has already been
 * flushed and the chip can be asserted synchronously.
 */
async function pressDownload() {
  fireEvent.press(screen.getByLabelText(DOWNLOAD_LABEL));
  await waitFor(() => expect(documentMockState.settled).toBe(true));
  // `settled` means "the last native call was REACHED", not "the app has
  // reacted to it". On the synchronous-throw branches (file-write, and the
  // sharing-unavailable refusal) the mock flips the flag BEFORE the value
  // propagates, so the catch has not run and the toast state is not applied
  // yet. One flush makes every branch wait for the same thing: the app having
  // reacted.
  await act(async () => {});
}

describe("ActiveScriptViewScreen download", () => {
  it("writes the prescription it is displaying and offers it to the share sheet", async () => {
    setParams(RICH);
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    const file = onlyWrittenFile();
    // Persistent storage, named for the record.
    expect(file.path).toBe("DOCUMENT_DIR/MedAppDocuments/prescription-amlodipine-5mg-4471-b.txt");
    // Every value in the file is one the CALLER passed and the screen renders.
    expect(file.body).toContain("Amlodipine 5mg");
    expect(file.body).toContain("Dr. Adjoa Boateng");
    expect(file.body).toContain("Quantity: 28 Tablets");
    expect(file.body).toContain("Indication: Blood pressure control");
    expect(file.body).toContain("Patient-exported copy");

    expect(documentMockState.shareCalls).toHaveLength(1);
    expect(documentMockState.shareCalls[0].uri).toBe(`file:///${file.path}`);
    // 20s, not the default 5s. This is the FIRST render in the suite and the
    // work is real, not a hang — the same case passes well inside the budget on
    // its own, but under the full suite's parallel workers it crossed 5s and
    // failed as a timeout rather than an assertion.
  }, 20000);

  it("omits the clinical fields the caller did not pass, rather than inventing them", async () => {
    // CORE only — no quantity, refills, indication, DOB or licence anywhere.
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    const body = onlyWrittenFile().body;
    expect(body).toContain("Amlodipine 5mg");
    expect(body).not.toMatch(/Quantity/);
    expect(body).not.toMatch(/Refills/);
    expect(body).not.toMatch(/Indication/);
    expect(body).not.toMatch(/License/);
    expect(body).not.toMatch(/Date of birth/);
    // And specifically none of the deleted constants.
    expect(body).not.toMatch(/30 Tablets|Hypertension management|MD-99283-A|Alex Rivers/);
  });

  it("tells the user the filename instead of a bare 'downloaded successfully'", async () => {
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    expect(screen.getByText("Saved prescription-amlodipine-5mg-4471-b.txt to your device")).toBeTruthy();
    // The stub's wording, which was true of nothing.
    expect(screen.queryByText("Document downloaded successfully")).toBeNull();
  });

  it("says the write failed, and does not claim a file, when storage refuses", async () => {
    documentMockState.failAt = "file-write";
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    expect(screen.getByText(/Couldn't save/)).toBeTruthy();
    // The whole point: no success wording behind a failed write.
    expect(screen.queryByText(/Saved .* to your device/)).toBeNull();
    expect(documentMockState.written).toHaveLength(0);
    expect(documentMockState.shareCalls).toHaveLength(0);
  });

  it("still reports the saved file when the device cannot share", async () => {
    documentMockState.sharingAvailable = false;
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    expect(screen.getByText(/can't share it out/)).toBeTruthy();
    // The file is real even though the hand-off never happened — so it is named.
    expect(onlyWrittenFile().body).toContain("Amlodipine 5mg");
  });

  it("ignores a second tap while the first write is in flight", async () => {
    render(<ActiveScriptViewScreen />);

    const button = screen.getByLabelText(DOWNLOAD_LABEL);
    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(button);

    await waitFor(() => expect(documentMockState.settled).toBe(true));
    // One tap, one file, one share sheet — not three stacked sheets.
    expect(documentMockState.shareCalls).toHaveLength(1);
    expect(documentMockState.written).toHaveLength(1);
  });

  it("offers no download at all when there is no script to download", () => {
    setParams({});
    render(<ActiveScriptViewScreen />);
    expect(screen.queryByLabelText(DOWNLOAD_LABEL)).toBeNull();
  });
});

describe("ActiveScriptShareScreen download", () => {
  it("writes a real file from the subset of fields it carries", async () => {
    render(<ActiveScriptShareScreen />);
    await pressDownload();

    const body = onlyWrittenFile().body;
    expect(body).toContain("Amlodipine 5mg");
    expect(body).toContain("Dr. Adjoa Boateng");
    // This screen has no quantity/refills in its params, and the document must be
    // shorter rather than invent them.
    expect(body).not.toMatch(/Quantity/);
    expect(body).not.toMatch(/Refills/);
  });

  it("reports the outcome, where the row used to do nothing at all", async () => {
    render(<ActiveScriptShareScreen />);
    await pressDownload();

    expect(screen.getByText(/^Saved prescription-.*\.txt to your device$/)).toBeTruthy();
  });

  it("offers no download at all when there is no script to share", () => {
    setParams({});
    render(<ActiveScriptShareScreen />);
    expect(screen.queryByLabelText(DOWNLOAD_LABEL)).toBeNull();
  });
});

describe("no control on either screen claims to produce a PDF", () => {
  // `expo-print` is not installed and there is no backend PDF endpoint, so a
  // control saying PDF would be the original lie with a file attached. This is a
  // source-level guard: it cannot be satisfied by a conditional at runtime.
  const source = (file: string) =>
    readFileSync(join(__dirname, "..", file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

  it.each(["ActiveScriptViewScreen.tsx", "ActiveScriptShareScreen.tsx"])(
    "%s names no PDF in a label or an icon",
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/Download PDF/);
      expect(text).not.toMatch(/picture-as-pdf/);
      // And no dependency crept in to justify one.
      expect(text).not.toMatch(/expo-print/);
    },
  );

  it("labels the control with the extension the user actually gets", () => {
    render(<ActiveScriptViewScreen />);
    expect(screen.getByText("Download Copy (.txt)")).toBeTruthy();
  });
});
