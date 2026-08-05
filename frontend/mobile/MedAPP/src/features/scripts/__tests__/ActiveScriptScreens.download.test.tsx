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

import { readFileSync } from "fs";
import { join } from "path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-file-system", () => require("@/test/document-mocks").fileSystemMock());
jest.mock("expo-sharing", () => require("@/test/document-mocks").sharingMock());

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: jest.fn() }),
}));

import { documentMockState, onlyWrittenFile, resetDocumentMocks } from "@/test/document-mocks";
import { ActiveScriptShareScreen } from "../ActiveScriptShareScreen";
import { ActiveScriptViewScreen } from "../ActiveScriptViewScreen";

const DOWNLOAD_LABEL = "Download a text copy of this prescription";

beforeEach(() => {
  resetDocumentMocks();
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
  // yet. The success path only passes without this because shareAsync resolves
  // asynchronously and hands over a spare microtask. One flush makes every
  // branch wait for the same thing: the app having reacted.
  //
  // Still not a tree query - the reason the helper waits on a recorded side
  // effect at all is that <Toast> runs an Animated loop, so a waitFor whose
  // predicate queries the tree hangs to the jest timeout instead of failing.
  await act(async () => {});
}

describe("ActiveScriptViewScreen download", () => {
  it("writes the prescription it is displaying and offers it to the share sheet", async () => {
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    const file = onlyWrittenFile();
    // Persistent storage, named for the record.
    expect(file.path).toBe(
      "DOCUMENT_DIR/MedAppDocuments/prescription-lisinopril-10mg-8829-x.txt",
    );
    // Every value in the file is one the screen renders above.
    expect(file.body).toContain("Lisinopril 10mg");
    expect(file.body).toContain("Dr. Adjoa Boateng");
    expect(file.body).toContain("Quantity: 30 Tablets");
    expect(file.body).toContain("Indication: Hypertension management");
    expect(file.body).toContain("Patient-exported copy");

    expect(documentMockState.shareCalls).toHaveLength(1);
    expect(documentMockState.shareCalls[0].uri).toBe(`file:///${file.path}`);
  });

  it("tells the user the filename instead of a bare 'downloaded successfully'", async () => {
    render(<ActiveScriptViewScreen />);
    await pressDownload();

    expect(
      screen.getByText("Saved prescription-lisinopril-10mg-8829-x.txt to your device"),
    ).toBeTruthy();
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
    expect(onlyWrittenFile().body).toContain("Lisinopril 10mg");
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
});

describe("ActiveScriptShareScreen download", () => {
  it("writes a real file from the subset of fields it carries", async () => {
    render(<ActiveScriptShareScreen />);
    await pressDownload();

    const body = onlyWrittenFile().body;
    expect(body).toContain("Lisinopril 10mg");
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
