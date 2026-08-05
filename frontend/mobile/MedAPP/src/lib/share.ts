// Sharing — the app's two share mechanisms, in one place.
//
// ---------------------------------------------------------------------------
// WHY THERE ARE TWO, AND WHY THE CHOICE IS THE CALLER'S
// ---------------------------------------------------------------------------
//
// React Native's own `Share` moves a STRING (a message, optionally a URL)
// through the OS sheet. `expo-sharing` moves a FILE, and takes nothing but a
// local `file://` URI — it cannot share a string at all. Almost everything this
// app wants to share is neither: it is data held in memory.
//
// So the two are not interchangeable and there is no single right answer:
//
//   * A social post, an appointment — a few lines someone will paste into a
//     chat and read. `Share.share({ message })`. It works on every platform
//     including web, needs no filesystem, and leaves nothing behind on disk.
//     Wrapping this in a file would make the recipient open an attachment to
//     read two sentences.
//
//   * A medication list — a RECORD. The recipient (a pharmacist, a locum, a
//     relative) wants to keep it, print it, or attach it to something else.
//     That is a file: written to the cache directory, then handed to
//     `Sharing.shareAsync`.
//
// REJECTED: putting everything through `expo-sharing` "for consistency". A file
// share is strictly worse for short text and it is not available everywhere
// (`isAvailableAsync()` is false on web without HTTPS, and on any platform
// where no receiving app is installed) — so the text path would still have to
// exist as a fallback. Better to have both, named, than one plus a hidden
// second.
//
// REJECTED: `Sharing.shareAsync` with a `data:` URI. SDK 55's `shareAsync`
// documents a *local file URL*; a data URI is not one, and on Android the
// intent it builds needs a real content-resolvable path.
//
// ---------------------------------------------------------------------------
// WHAT THESE FUNCTIONS DO NOT DO
// ---------------------------------------------------------------------------
//
// They do not raise UI. A share sheet the user dismisses is not an error, and a
// platform with no share target is not a crash — both come back as an outcome
// the caller can ignore. Every path resolves; nothing here rejects. That is why
// callers can `void` them.

import { Share } from "react-native";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";

/**
 * The four things that can happen. `dismissed` and `unavailable` are both
 * NORMAL — see the note above. `failed` means the OS refused for a reason we
 * could not anticipate, and is the only one worth surfacing if a caller ever
 * decides to.
 */
export type ShareOutcome = "shared" | "dismissed" | "unavailable" | "failed";

/**
 * Share a block of text through the OS sheet.
 *
 * `dialogTitle` is Android-only (RN's own option; iOS names the sheet after the
 * activity). `subject` is used by mail targets on iOS and is worth setting
 * whenever the text has a natural heading.
 */
export async function shareText(
  message: string,
  options: { dialogTitle?: string; subject?: string } = {},
): Promise<ShareOutcome> {
  if (!message.trim()) return "unavailable";
  try {
    const result = await Share.share(
      { message, ...(options.subject ? { title: options.subject } : {}) },
      { dialogTitle: options.dialogTitle, subject: options.subject },
    );
    return result.action === Share.sharedAction ? "shared" : "dismissed";
  } catch {
    return "failed";
  }
}

/**
 * Write `body` to a text file in the cache directory and share the file.
 *
 * The cache directory, not documents: this file exists only to be handed to
 * another app. `Paths.cache` is the one place the OS is allowed to reclaim on
 * its own, which is the correct lifetime for an export — we deliberately do NOT
 * delete it ourselves on the way out, because the receiving app may still be
 * reading it when `shareAsync` resolves.
 *
 * `overwrite: true` rather than an exists-check-then-create: sharing twice in a
 * session is normal, and SDK 55's `create()` throws on an existing path.
 *
 * FALLS BACK TO TEXT, does not fail, when `isAvailableAsync()` is false. The
 * user asked to share a record; giving them the same content as a message is a
 * worse-but-real answer, and it is the only thing available on web.
 */
export async function shareTextFile(args: {
  /** Including the extension, e.g. `medications.txt`. */
  filename: string;
  body: string;
  dialogTitle?: string;
  subject?: string;
}): Promise<ShareOutcome> {
  const { filename, body, dialogTitle, subject } = args;
  if (!body.trim()) return "unavailable";

  let available = false;
  try {
    available = await Sharing.isAvailableAsync();
  } catch {
    available = false;
  }
  if (!available) return shareText(body, { dialogTitle, subject });

  try {
    const file = new File(Paths.cache, filename);
    file.create({ overwrite: true, intermediates: true });
    file.write(body);
    await Sharing.shareAsync(file.uri, {
      dialogTitle,
      mimeType: "text/plain",
      UTI: "public.plain-text",
    });
    // `shareAsync` resolves void whether the user picked a target or backed
    // out, so "shared" here means "the sheet opened", not "it was delivered".
    return "shared";
  } catch {
    // A filesystem failure must not lose the user's action — the text path
    // needs no disk at all.
    return shareText(body, { dialogTitle, subject });
  }
}
