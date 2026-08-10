// The ONE place the app turns on-screen clinical data into a file the user keeps.
//
// WHY THIS EXISTS
// The "Download" controls on the prescription and Overview screens used to run an
// animation and nothing else — ActiveScriptViewScreen literally called
// `showDownloadToast()`, which faded in the words "Document downloaded
// successfully" over a device where no file had been created. A control that
// lies about a medical record is worse than one that is disabled, so the write
// is real now and every failure path has its own honest message.
//
// WHY .txt AND NOT .pdf — READ THIS BEFORE "FIXING" THE LABELS
// There is no PDF generator in this project and no backend endpoint that returns
// one. `expo-print` is NOT a dependency and must not be added under a bug fix.
// The two options were (a) produce a real, keepable plain-text record and stop
// calling it a PDF, or (b) disable the controls with an honest "not available"
// message. (a) won: the data these screens show IS the document — a prescription
// record and a vitals summary are complete as text, a patient can mail one to a
// pharmacy or keep it in Files, and it needs no new dependency. (b) would have
// shipped a dead button in exchange for nothing.
// The consequence, and it is not optional: NO CALLER MAY LABEL THIS "PDF".
// Callers name the extension in the button text. If `expo-print` ever lands,
// this module grows a sibling and the labels change with it — not before.
//
// EXPO SDK 55 FACTS THIS IS BUILT ON (docs.expo.dev/versions/v55.0.0)
//   * expo-file-system's write surface is the `File` / `Directory` / `Paths`
//     OBJECT API. The old `FileSystem.writeAsStringAsync(uri, ...)` +
//     `FileSystem.documentDirectory` pair is the LEGACY namespace and is not
//     what this imports. `file.create()` and `file.write()` are SYNCHRONOUS and
//     return void — they signal failure by THROWING, which is why the write is
//     wrapped in try/catch rather than awaited.
//   * `Paths.document` is "safe from being deleted by the system"; `Paths.cache`
//     is explicitly documented as deletable when storage runs low. A file the UI
//     calls a download must survive, so it goes in `Paths.document`.
//   * Sharing takes `file.uri` (a `file://` URL), NOT `file.contentUri`. The
//     v55 File docs mention `contentUri` for handing files to other Android
//     apps, but expo-sharing's own Android module calls
//     `FileProvider.getUriForFile` on what you pass it
//     (node_modules/expo-sharing/android/.../SharingModule.kt) — so it wants the
//     plain path and converts internally. Passing `contentUri` double-converts.
//
// NO PERMISSION IS REQUESTED, AND THAT IS CORRECT
// `Paths.document` is app-scoped private storage on both platforms, and the
// hand-off goes through the OS share sheet (Android via expo-sharing's
// FileProvider), so there is no WRITE_EXTERNAL_STORAGE / Photos permission in
// this path to ask for. If a future version writes to the shared Downloads
// collection instead, that changes and this comment is the place to say so.

import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Subfolder under `Paths.document`. Everything the user can keep lands together,
 * so a future "my documents" screen has one directory to list and a failed share
 * leaves a findable file rather than one loose among library caches.
 */
export const DOCUMENTS_FOLDER = "MedAppDocuments";

/**
 * What actually happened, as three outcomes the UI can phrase differently.
 *
 * The split that matters is `shared` vs `saved-only`: in BOTH the file exists on
 * disk, so neither may say "failed", but only one of them actually put the share
 * sheet in front of the user. Collapsing them would either hide a real file or
 * claim a hand-off that never happened.
 */
export type SaveTextDocumentResult =
  | { status: "shared"; fileName: string; uri: string }
  | {
      status: "saved-only";
      fileName: string;
      uri: string;
      reason: "sharing-unavailable" | "share-failed";
      detail?: string;
    }
  | { status: "write-failed"; fileName: string; detail: string };

export interface SaveTextDocumentOptions {
  /** Including the extension. See the label rule above — callers show this. */
  fileName: string;
  /** The finished document. Built by the pure helpers in ./builders. */
  body: string;
  /** Android Intent type. `text/plain` unless a caller writes something else. */
  mimeType?: string;
  /** Share-sheet heading (Android + web). */
  dialogTitle?: string;
  /** iOS Uniform Type Identifier. `public.plain-text` matches `text/plain`. */
  utiType?: string;
}

/** Never swallow the cause — a bare `catch {}` here is how the stub shipped. */
function detailOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/**
 * Writes `body` to `fileName` in persistent app storage, then offers it to the
 * OS share sheet so the user can move it somewhere they control.
 *
 * Resolves with a result rather than throwing: all four things that can go wrong
 * (no disk, no sharing on this platform, a share sheet that fails to open, a
 * malformed name) are states the button has to render, not crashes.
 */
export async function saveTextDocument({
  fileName,
  body,
  mimeType = "text/plain",
  dialogTitle,
  utiType = "public.plain-text",
}: SaveTextDocumentOptions): Promise<SaveTextDocumentResult> {
  let file: File;

  try {
    const folder = new Directory(Paths.document, DOCUMENTS_FOLDER);
    // `idempotent` so a second download is not an error, `intermediates` so a
    // fresh install with no subfolder yet still works on the first tap.
    folder.create({ idempotent: true, intermediates: true });

    file = new File(folder, fileName);
    // `create` throws when the target already exists, so re-downloading the same
    // record has to overwrite deliberately. Overwrite is right for these
    // documents: the file is a snapshot of the screen, not an append log.
    file.create({ overwrite: true, intermediates: true });
    file.write(body);
  } catch (error) {
    console.error(`[documents] failed to write ${fileName}`, error);
    return { status: "write-failed", fileName, detail: detailOf(error) };
  }

  const uri = file.uri;

  try {
    // Documented as false on web without local-file support, and on any platform
    // with no share target. Checked rather than assumed so the "your file is at
    // …" message can be the truth instead of a crash.
    if (!(await Sharing.isAvailableAsync())) {
      console.warn(`[documents] wrote ${fileName} but sharing is unavailable on this platform`);
      return { status: "saved-only", fileName, uri, reason: "sharing-unavailable" };
    }

    // NOTE: `shareAsync` RESOLVES when the user dismisses the sheet without
    // picking a target. A cancel is therefore indistinguishable from a send, and
    // must not be reported as a failure — the file exists either way, which is
    // exactly what the success message claims and no more.
    await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: utiType });
    return { status: "shared", fileName, uri };
  } catch (error) {
    console.error(`[documents] wrote ${fileName} but could not open the share sheet`, error);
    return {
      status: "saved-only",
      fileName,
      uri,
      reason: "share-failed",
      detail: detailOf(error),
    };
  }
}

/** What the UI says, so both screens phrase the same outcome the same way. */
export interface SaveTextDocumentMessage {
  tone: "success" | "error";
  message: string;
}

/**
 * Turns a result into user-facing copy.
 *
 * Every string names the actual file. "Document downloaded successfully" — the
 * old stub's wording — is banned by construction: there is no branch here that
 * can claim a download without a filename behind it.
 */
export function describeSaveResult(result: SaveTextDocumentResult): SaveTextDocumentMessage {
  switch (result.status) {
    case "shared":
      return { tone: "success", message: `Saved ${result.fileName} to your device` };
    case "saved-only":
      return {
        tone: "success",
        message:
          result.reason === "sharing-unavailable"
            ? `Saved ${result.fileName}. This device can't share it out.`
            : `Saved ${result.fileName}. The share sheet didn't open.`,
      };
    case "write-failed":
      return { tone: "error", message: `Couldn't save ${result.fileName}: ${result.detail}` };
  }
}
