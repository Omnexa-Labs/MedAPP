// Fakes for the two native modules behind @/lib/documents, shared by every suite
// that exercises a download.
//
// WHY A SHARED FILE AND NOT A FACTORY PER SUITE
// Four suites need the same two mocks, and `jest.mock` factories are hoisted
// above imports — so each one that inlines its own fake has to re-solve the same
// temporal-dead-zone puzzle, and they drift. Installed from a suite as:
//
//   jest.mock("expo-file-system", () => require("@/test/document-mocks").fileSystemMock());
//   jest.mock("expo-sharing", () => require("@/test/document-mocks").sharingMock());
//
// The `require` inside the factory is what makes that legal: it runs when the
// mocked module is first pulled in, by which point this module has initialised.
//
// NO NATIVE MODULE IS EVER TOUCHED. `expo-file-system` and `expo-sharing` both
// reach a native bridge that does not exist under Jest; a test that hit the real
// one would either throw or, worse on a dev machine, write actual files. These
// fakes record intent in memory instead, which is also the only way to assert
// what the app WOULD have written — the point of the exercise.

/** Which step should blow up. `null` = the happy path. */
export type DocumentFailurePoint =
  | null
  | "directory-create"
  | "file-create"
  | "file-write"
  | "share";

export interface WrittenFile {
  /** Joined path segments, e.g. `DOCUMENT_DIR/MedAppDocuments/report.txt`. */
  path: string;
  body: string;
}

export const documentMockState = {
  written: [] as WrittenFile[],
  createdDirectories: [] as string[],
  failAt: null as DocumentFailurePoint,
  /** expo-sharing's `isAvailableAsync` answer. */
  sharingAvailable: true,
  shareCalls: [] as { uri: string; options: unknown }[],
  /**
   * True once the save has reached its LAST native call, whichever branch it took
   * — the throw, the `isAvailableAsync` refusal, or the share attempt.
   *
   * Exists because component tests must not poll the rendered tree for the
   * outcome toast: <Toast> starts an Animated loop on mount, and a `waitFor` whose
   * predicate queries the tree hangs to the jest timeout instead of failing
   * cleanly. Suites wait on this flag, then assert the chip synchronously.
   */
  settled: false,
};

/** Called at every terminal point of a save, so `settled` needs no derivation. */
function markSettled() {
  documentMockState.settled = true;
}

export function resetDocumentMocks() {
  documentMockState.written = [];
  documentMockState.createdDirectories = [];
  documentMockState.failAt = null;
  documentMockState.sharingAvailable = true;
  documentMockState.shareCalls = [];
  documentMockState.settled = false;
}

/** The single file the app is expected to have written. Fails loudly otherwise. */
export function onlyWrittenFile(): WrittenFile {
  if (documentMockState.written.length !== 1) {
    throw new Error(
      `expected exactly 1 written file, got ${documentMockState.written.length}: ` +
        documentMockState.written.map((w) => w.path).join(", "),
    );
  }
  return documentMockState.written[0];
}

/**
 * A stand-in for the SDK 55 `File` / `Directory` / `Paths` object API.
 *
 * Deliberately mirrors the real surface rather than a convenient one: `create`
 * and `write` are SYNCHRONOUS and signal failure by THROWING, and `uri` is a
 * `file://` string. A mock with async methods would let production code that
 * forgot to catch a synchronous throw pass its tests.
 */
export function fileSystemMock() {
  const segment = (part: unknown): string =>
    typeof part === "string" ? part : String((part as { path?: string }).path ?? part);

  class MockDirectory {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.map(segment).join("/");
    }
    create() {
      if (documentMockState.failAt === "directory-create") {
        markSettled();
        throw new Error("EACCES: permission denied, mkdir");
      }
      documentMockState.createdDirectories.push(this.path);
    }
  }

  class MockFile {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.map(segment).join("/");
    }
    get uri() {
      return `file:///${this.path}`;
    }
    create() {
      if (documentMockState.failAt === "file-create") {
        markSettled();
        throw new Error("ENOSPC: no space left on device");
      }
    }
    write(body: string) {
      if (documentMockState.failAt === "file-write") {
        markSettled();
        throw new Error("EIO: i/o error, write");
      }
      documentMockState.written.push({ path: this.path, body });
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      // Named so an assertion on a path proves the PERSISTENT directory was used
      // and not the system-evictable cache.
      get document() {
        return new MockDirectory("DOCUMENT_DIR");
      },
      get cache() {
        return new MockDirectory("CACHE_DIR");
      },
    },
  };
}

export function sharingMock() {
  return {
    isAvailableAsync: () => {
      // Only terminal when it says NO — a `true` answer is followed by the share.
      if (!documentMockState.sharingAvailable) markSettled();
      return Promise.resolve(documentMockState.sharingAvailable);
    },
    shareAsync: (uri: string, options: unknown) => {
      documentMockState.shareCalls.push({ uri, options });
      markSettled();
      if (documentMockState.failAt === "share") {
        return Promise.reject(new Error("No activity found to handle Intent"));
      }
      return Promise.resolve();
    },
  };
}
