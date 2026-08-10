// The file-system / sharing boundary.
//
// This suite exists because the thing being replaced was a lie: a toast that said
// "Document downloaded successfully" with no file behind it. So the assertions are
// not "the function resolved" — they are "a file with this content exists at this
// path", and, for each failure, "the message the user sees does not claim
// otherwise".

jest.mock("expo-file-system", () => require("@/test/document-mocks").fileSystemMock());
jest.mock("expo-sharing", () => require("@/test/document-mocks").sharingMock());

import {
  documentMockState,
  onlyWrittenFile,
  resetDocumentMocks,
} from "@/test/document-mocks";
import {
  DOCUMENTS_FOLDER,
  describeSaveResult,
  saveTextDocument,
} from "../saveTextDocument";

describe("saveTextDocument", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    resetDocumentMocks();
    // Spied, not silenced-and-forgotten: several tests below ASSERT that the
    // failure was logged. "No silent catch blocks" is a requirement here, and a
    // requirement nobody checks is a requirement that regresses.
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("writes the body to persistent storage and hands the file:// uri to the share sheet", async () => {
    const result = await saveTextDocument({
      fileName: "prescription-lisinopril.txt",
      body: "REAL CONTENT",
      dialogTitle: "Save or send",
    });

    const file = onlyWrittenFile();
    expect(file.body).toBe("REAL CONTENT");
    // Paths.document, NOT Paths.cache — the SDK documents cache as deletable when
    // storage runs low, and a "download" that the OS may bin is not a download.
    expect(file.path).toBe(`DOCUMENT_DIR/${DOCUMENTS_FOLDER}/prescription-lisinopril.txt`);
    expect(documentMockState.createdDirectories).toContain(`DOCUMENT_DIR/${DOCUMENTS_FOLDER}`);

    expect(documentMockState.shareCalls).toHaveLength(1);
    // `file.uri`, not `file.contentUri`: expo-sharing's own Android module runs
    // FileProvider.getUriForFile on what it is given, so a content:// uri would be
    // converted twice.
    expect(documentMockState.shareCalls[0].uri).toBe(
      `file:///DOCUMENT_DIR/${DOCUMENTS_FOLDER}/prescription-lisinopril.txt`,
    );
    expect(documentMockState.shareCalls[0].options).toEqual({
      mimeType: "text/plain",
      dialogTitle: "Save or send",
      UTI: "public.plain-text",
    });

    expect(result).toEqual({
      status: "shared",
      fileName: "prescription-lisinopril.txt",
      uri: `file:///DOCUMENT_DIR/${DOCUMENTS_FOLDER}/prescription-lisinopril.txt`,
    });
  });

  it("reports saved-only, never failure, when the platform has no sharing", async () => {
    documentMockState.sharingAvailable = false;

    const result = await saveTextDocument({ fileName: "report.txt", body: "x" });

    // The file DID get written, so this must not read as an error — but the share
    // sheet never appeared, so it must not read as a completed hand-off either.
    expect(onlyWrittenFile().body).toBe("x");
    expect(documentMockState.shareCalls).toHaveLength(0);
    expect(result).toMatchObject({ status: "saved-only", reason: "sharing-unavailable" });
    expect(warnSpy).toHaveBeenCalled();
    expect(describeSaveResult(result)).toEqual({
      tone: "success",
      message: "Saved report.txt. This device can't share it out.",
    });
  });

  it("keeps the written file when the share sheet itself fails", async () => {
    documentMockState.failAt = "share";

    const result = await saveTextDocument({ fileName: "report.txt", body: "x" });

    expect(onlyWrittenFile().body).toBe("x");
    expect(result).toMatchObject({ status: "saved-only", reason: "share-failed" });
    expect(errorSpy).toHaveBeenCalled();
    expect(describeSaveResult(result)).toEqual({
      tone: "success",
      message: "Saved report.txt. The share sheet didn't open.",
    });
  });

  it.each([
    ["directory-create", "EACCES: permission denied, mkdir"],
    ["file-create", "ENOSPC: no space left on device"],
    ["file-write", "EIO: i/o error, write"],
  ] as const)("surfaces the real cause when %s throws", async (failAt, detail) => {
    documentMockState.failAt = failAt;

    const result = await saveTextDocument({ fileName: "report.txt", body: "x" });

    expect(documentMockState.written).toHaveLength(0);
    // Never offer to share a file that was not written.
    expect(documentMockState.shareCalls).toHaveLength(0);
    expect(result).toEqual({ status: "write-failed", fileName: "report.txt", detail });
    expect(errorSpy).toHaveBeenCalled();

    const described = describeSaveResult(result);
    expect(described.tone).toBe("error");
    // The cause reaches the user. "Something went wrong" would send them looking
    // for a file that is not there.
    expect(described.message).toContain(detail);
  });

  it("treats a dismissed share sheet as success, because the file still exists", async () => {
    // expo-sharing RESOLVES on cancel — a cancel is indistinguishable from a send,
    // and both leave the written file behind. Reporting cancel as an error would be
    // the mirror image of the original bug: a true file, denied.
    const result = await saveTextDocument({ fileName: "report.txt", body: "x" });
    expect(result.status).toBe("shared");
    expect(describeSaveResult(result).tone).toBe("success");
  });

  it("overwrites rather than accumulating copies on a second download", async () => {
    await saveTextDocument({ fileName: "report.txt", body: "first" });
    await saveTextDocument({ fileName: "report.txt", body: "second" });

    // Same path both times — the real `File.create({ overwrite: true })` replaces
    // it, so the user gets one current record instead of report(3).txt.
    const paths = new Set(documentMockState.written.map((w) => w.path));
    expect(paths.size).toBe(1);
    expect(documentMockState.written[1].body).toBe("second");
  });

  it("never phrases a success message without naming the file", () => {
    // Structural guard on the copy: the old stub's "Document downloaded
    // successfully" is unreachable by construction because every branch
    // interpolates the filename.
    for (const result of [
      { status: "shared", fileName: "a.txt", uri: "file:///a.txt" },
      { status: "saved-only", fileName: "b.txt", uri: "file:///b.txt", reason: "share-failed" },
      { status: "write-failed", fileName: "c.txt", detail: "boom" },
    ] as const) {
      expect(describeSaveResult(result).message).toContain(result.fileName);
    }
  });
});
