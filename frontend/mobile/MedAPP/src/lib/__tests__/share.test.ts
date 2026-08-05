// Locks @/lib/share: which mechanism runs, and that every failure path still
// gets the user's content out somehow.
//
// expo-sharing and expo-file-system are mocked at the MODULE boundary — neither
// native module exists under Jest, and a test that touched the real filesystem
// would be asserting on the OS rather than on us.

const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();

jest.mock("expo-sharing", () => ({
  isAvailableAsync: (...a: unknown[]) => mockIsAvailableAsync(...a),
  shareAsync: (...a: unknown[]) => mockShareAsync(...a),
}));

const mockCreate = jest.fn();
const mockWrite = jest.fn();

jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    uri: string;
    constructor(dir: { cache?: string } | string, name: string) {
      this.uri = `${typeof dir === "string" ? dir : dir.cache}/${name}`;
    }
    create(...a: unknown[]) {
      mockCreate(...a);
    }
    write(...a: unknown[]) {
      mockWrite(...a);
    }
  },
}));

import { Share } from "react-native";
import { shareText, shareTextFile } from "../share";

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  shareSpy = jest
    .spyOn(Share, "share")
    .mockResolvedValue({ action: Share.sharedAction } as never);
  mockIsAvailableAsync.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  shareSpy.mockRestore();
});

describe("shareText", () => {
  it("opens RN's sheet and reports a completed share", async () => {
    await expect(shareText("hello", { dialogTitle: "T", subject: "S" })).resolves.toBe("shared");
    expect(shareSpy).toHaveBeenCalledWith(
      { message: "hello", title: "S" },
      { dialogTitle: "T", subject: "S" },
    );
  });

  it("reports a dismissal as a dismissal, not a failure", async () => {
    shareSpy.mockResolvedValue({ action: Share.dismissedAction } as never);
    await expect(shareText("hello")).resolves.toBe("dismissed");
  });

  it("never throws at the caller when the OS refuses", async () => {
    shareSpy.mockRejectedValue(new Error("no activity"));
    await expect(shareText("hello")).resolves.toBe("failed");
  });

  it("refuses an empty message rather than opening an empty sheet", async () => {
    await expect(shareText("   ")).resolves.toBe("unavailable");
    expect(shareSpy).not.toHaveBeenCalled();
  });
});

describe("shareTextFile", () => {
  it("writes the body to the cache directory and shares that file", async () => {
    await expect(
      shareTextFile({ filename: "meds.txt", body: "BODY", dialogTitle: "T" }),
    ).resolves.toBe("shared");

    expect(mockCreate).toHaveBeenCalledWith({ overwrite: true, intermediates: true });
    expect(mockWrite).toHaveBeenCalledWith("BODY");
    expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/meds.txt", {
      dialogTitle: "T",
      mimeType: "text/plain",
      UTI: "public.plain-text",
    });
    // The file path was used; RN's text sheet was not.
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it("checks availability BEFORE touching the filesystem, and falls back to text", async () => {
    mockIsAvailableAsync.mockResolvedValue(false);

    await expect(shareTextFile({ filename: "meds.txt", body: "BODY" })).resolves.toBe("shared");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "BODY" }),
      expect.anything(),
    );
  });

  it("treats a thrown availability check as unavailable", async () => {
    mockIsAvailableAsync.mockRejectedValue(new Error("no module"));
    await expect(shareTextFile({ filename: "meds.txt", body: "BODY" })).resolves.toBe("shared");
    expect(shareSpy).toHaveBeenCalled();
  });

  it("does not lose the user's content when the write fails", async () => {
    mockWrite.mockImplementation(() => {
      throw new Error("disk full");
    });

    await expect(shareTextFile({ filename: "meds.txt", body: "BODY" })).resolves.toBe("shared");
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: "BODY" }),
      expect.anything(),
    );
  });

  it("refuses an empty body", async () => {
    await expect(shareTextFile({ filename: "meds.txt", body: "\n" })).resolves.toBe("unavailable");
    expect(mockIsAvailableAsync).not.toHaveBeenCalled();
  });
});
