// useComposerMedia — the attach-a-file and record-a-voice-note behaviour behind
// the two message composers (AiAssistantScreen, ChatThreadScreen).
//
// It lives here, next to its two call sites, rather than in src/lib, because it
// is not a general-purpose media service: it encodes composer-specific rules (one
// attachment slot, cancellable capture, a notice the composer renders inline).
// It was extracted because BOTH screens had the same two dead 44pt controls, and
// two copies of a permission flow is how the permission flow drifts.
//
// ---------------------------------------------------------------------------
// SDK 55 APIs USED, AND THE DOC FACTS THAT DECIDED THEM
// (https://docs.expo.dev/versions/v55.0.0/sdk/document-picker/,
//  .../sdk/audio/, .../sdk/filesystem/ — read before this file was written)
// ---------------------------------------------------------------------------
//
// expo-document-picker
//   `getDocumentAsync(options)` returns a DISCRIMINATED UNION, not a nullable
//   asset: `DocumentPickerSuccessResult { canceled: false; assets: [...] }` or
//   `DocumentPickerCanceledResult { canceled: true; assets: null }`. The flag is
//   spelled `canceled`, ONE l. So dismissal is a normal result, not a rejection
//   — which is exactly why the picker cannot leave the UI stuck: the `canceled`
//   branch is the same code path as success, minus the assignment.
//   `copyToCacheDirectory` DEFAULTS TO TRUE, so the returned `uri` is already a
//   stable `file://` copy in the app's cache. That is why this hook does NOT
//   copy anything itself, and why `asset.size` is trusted rather than re-stat'd
//   through expo-file-system.
//
// expo-audio (expo-av is superseded and is NOT installed — do not reach for it)
//   `useAudioRecorder(options, statusListener?)` returns an `AudioRecorder` that
//   releases itself on unmount. `prepareToRecordAsync()` MUST be awaited before
//   `record()`. `record()` is SYNCHRONOUS (returns void); `stop()` returns
//   `Promise<void>` and the file only becomes readable at `recorder.uri`
//   (`string | null`) after it resolves.
//   `requestRecordingPermissionsAsync()` / `getRecordingPermissionsAsync()`
//   resolve to a `PermissionResponse` — `{ granted, status, canAskAgain }`. The
//   `canAskAgain` field is the whole reason there are TWO denial messages below.
//   `setAudioModeAsync({ allowsRecording, playsInSilentMode })` configures the
//   session; the docs' recording example sets exactly that pair.
//
// expo-file-system
//   SDK 55's API is the `File` CLASS, not the old `FileSystem.*` functions.
//   `new File(uri)`, the `exists` boolean, and a `delete()` that is SYNCHRONOUS
//   and returns void. Used only to reap a discarded capture.
//
// expo-sharing is installed but deliberately UNUSED here — nothing in a composer
// shares outward. It is the records/prescriptions export path's dependency.
//
// ---------------------------------------------------------------------------
// WHAT IS REAL — and as of the voice-note pass, the upload is too
// ---------------------------------------------------------------------------
// The file picker, the microphone permission grant, the recording, and the
// on-device file were always real. THE MISSING PIECE WAS THE UPLOAD, and it is
// no longer missing: `chatApi.uploadAttachment` posts multipart to
// `POST /v1/threads/:id/attachments` and the message that follows carries
// `attachment_ids`. See `docs/api/inbox_service.md`.
//
// This hook still does NOT upload anything itself, and that is the division of
// labour rather than an omission: an upload belongs to a THREAD, and this hook
// is shared with AiAssistantScreen, which has no thread id. So the hook owns
// capture, permissions, the limits and the local file; `ChatThreadScreen` owns
// the upload and the send. `ComposerAttachment.uploaded` is therefore still
// `false` HERE — it describes what this hook produced, and every consumer must
// treat the uri as device-local until the screen has a server id for it.
//
// ---------------------------------------------------------------------------
// THE LIMITS ARE ENFORCED HERE, BEFORE THE REQUEST
// ---------------------------------------------------------------------------
// 8 MiB and four hours, from ./attachmentLimits. Both are checked client-side,
// not left to the server, because the server is RIGHT and unreadable: a 413
// whose body says "attachment exceeds the 8388608 byte limit" is a fact about
// bytes shown to someone who just recorded their symptoms. A refusal has to
// arrive before the upload, in words, with the recording still recoverable where
// that is possible:
//
//   • duration cap  -> the recorder STOPS ITSELF at four hours and KEEPS the
//     capture. Discarding four hours of audio to enforce a limit the audio
//     already satisfies would be the worse bug.
//   • size cap      -> a capture over 8 MiB cannot be sent at all, so it is
//     reaped and refused by name. A picked file is refused before it occupies
//     the slot, so the previous attachment survives.
//   • content type  -> checked against the same allowlist the server holds, so
//     a `.docx` referral is refused with "MedApp can send…" rather than a 415.
//
// ---------------------------------------------------------------------------
// HOLD-TO-RECORD **AND** TAP-TO-RECORD. BOTH. NOT ONE.
// ---------------------------------------------------------------------------
// The WhatsApp idiom is hold-to-record with slide-to-cancel and slide-to-lock,
// and it is genuinely better for the common case: one gesture, no state to
// remember, nothing left recording by accident.
//
// It is also UNREACHABLE for two groups. Switch Control has no "hold"; it has
// activate. VoiceOver and TalkBack intercept the touch and deliver an activation
// to the focused element, so `onPressIn`/`onPressOut` either never fire or fire
// back-to-back with no gesture between them. A hold-only mic is a control those
// users cannot operate at all.
//
// So the hook exposes BOTH, over ONE state machine rather than two:
//
//   held    beginHold() -> updateHold(dx, dy) -> endHold()
//   tapped  toggleRecording()   (start, then commit)
//
// `toggleRecording` starts the recording ALREADY LOCKED, because a tap has no
// release to commit on — which means the tap path lands in exactly the state a
// held gesture reaches by sliding up, and there is one set of controls to label
// and test rather than two. `isHolding` is the only thing the two differ on, and
// it exists purely so the composer can draw "Slide to cancel" for a finger that
// is actually down.
//
// The original argument for a toggle still stands and is why the tap path is not
// a fallback but the equal: the FIRST tap has to await a system permission
// dialog, and a press-and-hold cannot survive one — the finger lifts onto the
// dialog, `onPressOut` fires against a recorder that never started, and the user
// is left holding a button that did nothing. `beginHold` therefore resolves
// permission BEFORE it starts, and a hold that had to prompt records nothing and
// says so.
//
// ---------------------------------------------------------------------------
// STATE DELIBERATELY NOT MODELLED
// ---------------------------------------------------------------------------
//   • Multiple attachments. The slot is SINGLE. Neither composer's Figma frame
//     has a horizontally-scrolling attachment tray, and `multiple: false` keeps
//     the picker's own UI in single-select mode so the affordance matches. A
//     second pick REPLACES the first (and reaps the first file), which is the
//     honest behaviour for a one-slot UI — silently dropping the new pick would
//     read as a broken button.
//   • Upload PROGRESS. `fetch` with a `FormData` body reports no progress event,
//     and the backend has no resumable upload (its own doc: "an interrupted
//     8 MiB upload restarts"). An indeterminate state that says "Sending…" is
//     the honest one; a percentage would be invented.
//   • Pause/resume mid-recording. `recorder.pause()` exists; a paused voice note
//     is not a concept any frame draws.
//   • PLAYBACK. Deliberately not here: `useAudioPlayer` is a hook, so a player
//     owned by this hook would exist for every composer whether or not there is
//     anything to play, and would have to be told about a remote uri it knows
//     nothing about. Playback lives in the components that draw a player
//     (./VoiceNoteComposer for the review bar, ./VoiceNotePlayer for the bubble)
//     — which is also where `duration_ms` and the bearer headers already are.

import { useCallback, useEffect, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_DURATION_MS,
  formatByteCap,
  isAllowedContentType,
} from "./attachmentLimits";

/** Where the attachment came from. Screens map this to a glyph themselves. */
export type ComposerAttachmentKind = "file" | "recording";

export interface ComposerAttachment {
  id: string;
  kind: ComposerAttachmentKind;
  /** Display name. For a recording this is synthesised — there is no filename. */
  name: string;
  /** DEVICE-LOCAL uri. Never a server url; see the FLAGGED note above. */
  uri: string;
  /** Pre-formatted secondary line, e.g. "PDF · 2.4 MB" or "Voice note · 0:07". */
  meta: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMillis?: number;
  /**
   * Always `false`. Present so a consumer cannot forget that this is unsent
   * local media, and so the flag flips in ONE place when the endpoint ships.
   */
  uploaded: false;
}

/**
 * An inline, in-product message. NOT a native `Alert` — the same argument
 * src/components/ui/InfoCallout.tsx makes at length: a modal drawn by the OS in
 * the OS's typeface cannot carry an "Open Settings" affordance in the app's
 * idiom, and a permission refusal is not blocking. The composer renders this as
 * an `InfoCallout tone="error"` directly under the control that failed.
 */
export interface ComposerNotice {
  kind:
    | "permission-denied"
    | "permission-blocked"
    | "capture-failed"
    | "pick-failed"
    | "too-large"
    | "unsupported-type"
    | "duration-capped";
  message: string;
  /** True when the OS will no longer show a prompt, so the copy must say "Settings". */
  needsSettings: boolean;
}

const MIC_DENIED: ComposerNotice = {
  kind: "permission-denied",
  message:
    "MedApp needs microphone access to record a voice note. Nothing is recorded until you tap the mic, and recording stops the moment you tap it again.",
  needsSettings: false,
};

const MIC_BLOCKED: ComposerNotice = {
  kind: "permission-blocked",
  message:
    "Microphone access is turned off for MedApp, and your device will not ask again. Turn it on in Settings › MedApp › Microphone to record a voice note.",
  needsSettings: true,
};

const CAPTURE_FAILED: ComposerNotice = {
  kind: "capture-failed",
  message: "That recording could not be saved. Nothing was sent — please try again.",
  needsSettings: false,
};

const PICK_FAILED: ComposerNotice = {
  kind: "pick-failed",
  message: "That file could not be opened. Nothing was attached — please try another file.",
  needsSettings: false,
};

/**
 * Over the size cap. Says the cap, because "too large" leaves the user guessing
 * at what would work, and names WHY nothing is attached so the absence of a chip
 * does not read as a dead button.
 */
const TOO_LARGE: ComposerNotice = {
  kind: "too-large",
  message: `That file is larger than ${formatByteCap()}, which is the most this conversation can carry. Nothing was attached.`,
  needsSettings: false,
};

const UNSUPPORTED_TYPE: ComposerNotice = {
  kind: "unsupported-type",
  message:
    "This conversation can carry audio, photos and PDFs. Nothing was attached — please try one of those.",
  needsSettings: false,
};

/**
 * The recorder hit four hours and stopped itself. NOT a failure: the capture is
 * kept and is sendable, so the copy says what happened rather than apologising.
 */
const DURATION_CAPPED: ComposerNotice = {
  kind: "duration-capped",
  message:
    "Recording stopped at four hours, which is the longest a voice note can be. What you recorded is ready to send.",
  needsSettings: false,
};

/**
 * How often the recording timer ticks. 1s: the UI shows whole seconds, and the
 * duration cap is checked on the same tick — a four-hour recording does not need
 * to be stopped to the millisecond.
 */
const TICK_MS = 1000;

/**
 * How far the finger travels before a held recording arms cancel or locks.
 *
 * Both are in dp against the press origin, and both are larger than a scroll
 * threshold on purpose: the mic sits in a docked bar, so a small slide is a
 * mis-hold, not an intent. 64 left to cancel because cancelling destroys the
 * recording; 56 up to lock because locking destroys nothing.
 */
const CANCEL_SLIDE_DP = 64;
const LOCK_SLIDE_DP = 56;

let nextAttachmentId = 0;
function makeAttachmentId() {
  nextAttachmentId += 1;
  return `att${nextAttachmentId}`;
}

/** "0:07", "1:04". Matches the mm:ss the composer's timer shows. */
export function formatDuration(millis: number): string {
  const total = Math.max(0, Math.round(millis / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "2.4 MB". Decimal units, matching what a file manager shows the user — the
 * seeded `Lab_Panel_May2026.pdf` bubble already reads "PDF · 2.4 MB", so this is
 * the format the design has.
 */
export function formatSize(bytes: number | undefined): string | null {
  if (bytes === undefined || bytes < 0) return null;
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}

/**
 * The label a picked file's `meta` line gets: the MIME subtype uppercased, which
 * turns `application/pdf` into "PDF" and `image/jpeg` into "JPEG", plus the size.
 * Falls back to the extension, then to a bare "File", so the line is never empty.
 */
function describeFile(name: string, mimeType: string | undefined, bytes: number | undefined) {
  const subtype = mimeType?.split("/").pop();
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  const label = (subtype && subtype !== "octet-stream" ? subtype : extension) ?? "File";
  const size = formatSize(bytes);
  const kind = label.toUpperCase();
  return size ? `${kind} · ${size}` : kind;
}

/**
 * Best-effort reap of a capture the user threw away, so a discarded voice note
 * does not sit in the cache until the OS decides to clear it.
 *
 * Guarded three ways: only `file://` uris (a `content://` uri on Android is not
 * ours to delete), only when `exists`, and swallowing any throw — failing to
 * tidy up a cache file must never surface as an error to someone who just
 * pressed "discard".
 */
function discardLocalFile(uri: string | null | undefined) {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Intentionally silent — see above.
  }
}

/**
 * Byte size of a finished capture, or `null` when it cannot be read.
 *
 * A recording has no `asset.size` the way a picked document does, so the only
 * way to enforce the 8 MiB cap before uploading is to stat the file. NULL IS
 * TREATED AS "FINE", not as "too big": refusing to send a voice note because
 * expo-file-system could not read its size would fail closed on a capture that
 * is almost certainly under the cap — HIGH_QUALITY m4a is ~1 MB/minute, so 8 MiB
 * is about eight minutes of talking.
 */
function localFileSize(uri: string | null | undefined): number | null {
  if (!uri) return null;
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return typeof file.size === "number" ? file.size : null;
  } catch {
    return null;
  }
}

export interface ComposerMedia {
  /** The single pending attachment, or null. */
  attachment: ComposerAttachment | null;
  /** True while the system picker is being opened, so the control can disable. */
  isPicking: boolean;
  isRecording: boolean;
  /**
   * A finger is down on the mic. False for a recording started by TAP and for one
   * that has been locked, which is the only difference between the two paths —
   * see the hold-and-tap block at the top.
   */
  isHolding: boolean;
  /** Recording continues without a finger: after a slide up, or after a tap. */
  isLocked: boolean;
  /** The finger has slid past the cancel threshold; releasing now discards. */
  isCancelArmed: boolean;
  /** Elapsed capture time, for the composer's mm:ss readout. */
  recordingMillis: number;
  notice: ComposerNotice | null;
  dismissNotice: () => void;
  pickFile: () => Promise<void>;
  /**
   * THE ACCESSIBLE PATH, and not a lesser one: start, then commit. Starts the
   * recording already locked, so it lands in the same state a held gesture
   * reaches by sliding up.
   */
  toggleRecording: () => Promise<void>;
  /** Press-and-hold begins. Resolves permission BEFORE starting the recorder. */
  beginHold: () => Promise<void>;
  /** Finger movement since the press origin, in dp. */
  updateHold: (dx: number, dy: number) => void;
  /** Release: commits, or discards when cancel is armed. A locked hold ignores it. */
  endHold: () => Promise<void>;
  /** Abandon the in-flight recording and reap the file. */
  cancelRecording: () => Promise<void>;
  /** Drop the pending attachment (and reap it if it was a local capture). */
  clearAttachment: () => void;
  /** Called by `send()` once the attachment has been folded into a message. */
  consumeAttachment: () => void;
}

export function useComposerMedia(): ComposerMedia {
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const [recordingMillis, setRecordingMillis] = useState(0);
  const [notice, setNotice] = useState<ComposerNotice | null>(null);

  // HIGH_QUALITY (m4a, 44.1kHz, 128kbps) rather than LOW_QUALITY, which drops to
  // AMR-in-.3gp on Android. This is clinical dictation — a patient describing a
  // symptom to a doctor — so intelligibility beats a few hundred KB.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef<number>(0);
  // Guards the async start against a second tap arriving before `record()`
  // lands. `isRecording` cannot do this job: it is set a few awaits too late.
  const starting = useRef(false);
  // Set when the user cancels DURING capture, so the `stop()` continuation knows
  // to reap the file instead of attaching it.
  const abandoned = useRef(false);
  const mounted = useRef(true);
  // Mirrors `isCancelArmed` for the release handler. `endHold` reads the armed
  // flag in the same tick a `touchMove` may have set it, and state is a render
  // behind — a ref is the only value that is correct at release time.
  const cancelArmed = useRef(false);
  // Mirrors `isLocked` for the same reason: a release must not commit a
  // recording that the same gesture just locked.
  const locked = useRef(false);
  // Set when the tick stops the recorder at the duration cap, so the commit
  // continuation attaches the capture AND says why it ended.
  const cappedByDuration = useRef(false);

  const stopTick = useCallback(() => {
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
  }, []);

  // A recorder left running past unmount holds the audio session open and keeps
  // the OS recording indicator lit. `useAudioRecorder` releases the recorder
  // itself, but only stopping it ends the capture.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopTick();
      if (recorder.isRecording) {
        abandoned.current = true;
        void recorder.stop().catch(() => undefined);
      }
    };
  }, [recorder, stopTick]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const replaceAttachment = useCallback((next: ComposerAttachment | null) => {
    setAttachment((previous) => {
      // Only reap what WE created. A picked document's cache copy is also ours,
      // but the picker may hand back the same uri on a re-pick of the same file,
      // so only captures — which always get a fresh path — are deleted here.
      if (previous && previous.kind === "recording" && previous.uri !== next?.uri) {
        discardLocalFile(previous.uri);
      }
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Attach
  // -------------------------------------------------------------------------
  const pickFile = useCallback(async () => {
    if (isPicking) return;
    setNotice(null);
    setIsPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Unfiltered: this is a medical thread, and the useful set is PDFs, lab
        // images, and the occasional DOCX referral. A MIME allow-list here would
        // hide a file the user can see in their file manager, which reads as the
        // picker being broken.
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      // `canceled` (one l) is a NORMAL result. Falling through to `finally`
      // clears `isPicking`, so a dismissed picker leaves nothing stuck.
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      // REFUSED BEFORE THE SLOT IS TOUCHED, so a rejected pick leaves whatever
      // was already attached alone. The server would answer 413/415; this says
      // the same thing in words, without the round trip.
      if (asset.size !== undefined && asset.size > MAX_ATTACHMENT_BYTES) {
        if (mounted.current) setNotice(TOO_LARGE);
        return;
      }
      if (!isAllowedContentType(asset.mimeType)) {
        if (mounted.current) setNotice(UNSUPPORTED_TYPE);
        return;
      }
      replaceAttachment({
        id: makeAttachmentId(),
        kind: "file",
        name: asset.name,
        uri: asset.uri,
        meta: describeFile(asset.name, asset.mimeType, asset.size),
        mimeType: asset.mimeType,
        sizeBytes: asset.size,
        uploaded: false,
      });
    } catch {
      // The picker rejects on a provider error (an unreadable cloud file, a
      // revoked SAF grant). Surfaced, not swallowed — a dead button is the bug
      // this whole change exists to fix.
      if (mounted.current) setNotice(PICK_FAILED);
    } finally {
      if (mounted.current) setIsPicking(false);
    }
  }, [isPicking, replaceAttachment]);

  // -------------------------------------------------------------------------
  // Mic — hold-to-record AND tap-to-record, over one state machine
  //
  // See the block at the top of this file for why both exist and why the tap
  // path starts LOCKED. `startRecording` is shared by both; `lockImmediately`
  // is the only thing they pass differently.
  // -------------------------------------------------------------------------

  // The tick has to be able to commit (the duration cap stops the recorder), and
  // `commitRecording` is declared below it. A ref rather than a reorder: the two
  // genuinely refer to each other, and a lazily-read ref is honest about that
  // where a hoisted function would only hide it.
  const commitRef = useRef<(() => Promise<void>) | null>(null);

  const startRecording = useCallback(async (lockImmediately: boolean) => {
    if (starting.current || isRecording) return;
    starting.current = true;
    setNotice(null);
    cancelArmed.current = false;
    setIsCancelArmed(false);
    cappedByDuration.current = false;
    locked.current = lockImmediately;
    setIsLocked(lockImmediately);
    try {
      // Ask only when asking can work. `getRecordingPermissionsAsync()` never
      // shows UI, so this costs nothing and it is what makes the two denial
      // messages distinguishable: `canAskAgain === false` means the OS will not
      // prompt again and the only honest instruction is "go to Settings".
      const existing = await getRecordingPermissionsAsync();
      let granted = existing.granted;
      let canAskAgain = existing.canAskAgain;
      if (!granted && canAskAgain) {
        const asked = await requestRecordingPermissionsAsync();
        granted = asked.granted;
        canAskAgain = asked.canAskAgain;
      }
      if (!granted) {
        if (mounted.current) setNotice(canAskAgain ? MIC_DENIED : MIC_BLOCKED);
        return;
      }

      // iOS will not route the mic to the app without this, and it also lets a
      // note be recorded with the ringer switch silenced.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!mounted.current) return;
      abandoned.current = false;
      recorder.record();

      startedAt.current = Date.now();
      setRecordingMillis(0);
      setIsRecording(true);
      stopTick();
      tick.current = setInterval(() => {
        const elapsed = Date.now() - startedAt.current;
        setRecordingMillis(elapsed);
        // THE DURATION CAP, enforced here rather than at the upload: the server
        // rejects `duration_ms` over four hours with a 422, and discovering that
        // after four hours of recording is not a thing to do to someone. The
        // capture is KEPT — it is exactly at the limit, so it is valid.
        if (elapsed >= MAX_ATTACHMENT_DURATION_MS) {
          cappedByDuration.current = true;
          stopTick();
          void commitRef.current?.();
        }
      }, TICK_MS);
    } catch {
      if (mounted.current) {
        setIsRecording(false);
        setNotice(CAPTURE_FAILED);
      }
      stopTick();
    } finally {
      starting.current = false;
    }
  }, [isRecording, recorder, stopTick]);

  const commitRecording = useCallback(async () => {
    stopTick();
    const elapsed = Date.now() - startedAt.current;
    setIsRecording(false);
    setIsHolding(false);
    setIsLocked(false);
    setIsCancelArmed(false);
    locked.current = false;
    cancelArmed.current = false;
    try {
      await recorder.stop();
      // The uri is only readable after `stop()` resolves.
      const uri = recorder.uri;
      if (abandoned.current) {
        discardLocalFile(uri);
        return;
      }
      if (!uri) {
        if (mounted.current) setNotice(CAPTURE_FAILED);
        return;
      }
      if (!mounted.current) {
        discardLocalFile(uri);
        return;
      }
      // THE SIZE CAP. A capture has no `asset.size`, so this is the only place it
      // can be checked before the upload — and an 8 MiB refusal after the upload
      // is a 413 the user cannot read. Reaped rather than kept, because unlike the
      // duration cap there is no sendable version of an over-size file.
      const bytes = localFileSize(uri);
      if (bytes !== null && bytes > MAX_ATTACHMENT_BYTES) {
        discardLocalFile(uri);
        if (mounted.current) setNotice(TOO_LARGE);
        return;
      }
      replaceAttachment({
        id: makeAttachmentId(),
        kind: "recording",
        // A capture has no filename, so the name is the KIND and the length goes
        // on the meta line — deliberately not both, which read as a stutter
        // ("Voice note 0:07 / Voice note · 0:07") in the chip.
        name: "Voice note",
        uri,
        meta: `Audio · ${formatDuration(elapsed)}`,
        mimeType: "audio/m4a",
        durationMillis: elapsed,
        sizeBytes: bytes ?? undefined,
        uploaded: false,
      });
      if (cappedByDuration.current && mounted.current) setNotice(DURATION_CAPPED);
    } catch {
      if (mounted.current) setNotice(CAPTURE_FAILED);
    } finally {
      // Hand the audio session back so the mic indicator clears and playback
      // elsewhere in the app is not stuck in record mode.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      if (mounted.current) setRecordingMillis(0);
      cappedByDuration.current = false;
    }
  }, [recorder, replaceAttachment, stopTick]);

  // Read by the tick above. Assigned on every render so it is never a stale
  // closure over an old `recorder`.
  commitRef.current = commitRecording;

  const cancelRecording = useCallback(async () => {
    if (!isRecording) return;
    // Read by the `commitRecording` continuation, which reaps rather than
    // attaches. Cancelling still has to STOP the recorder — abandoning it would
    // leave the session open and the OS indicator lit.
    abandoned.current = true;
    await commitRecording();
    if (mounted.current) setNotice(null);
  }, [commitRecording, isRecording]);

  /**
   * THE ACCESSIBLE PATH. Starts LOCKED, so what it produces is the hands-free
   * state a held gesture reaches by sliding up — one state to draw, one set of
   * labels, one set of tests.
   */
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await commitRecording();
      return;
    }
    await startRecording(true);
  }, [commitRecording, isRecording, startRecording]);

  const beginHold = useCallback(async () => {
    if (isRecording) return;
    setIsHolding(true);
    // Unlocked: the release is what commits. `startRecording` awaits the
    // permission prompt first, so a hold that had to ask records nothing and
    // leaves a notice — which is honest, and is why the tap path exists.
    await startRecording(false);
  }, [isRecording, startRecording]);

  const updateHold = useCallback((dx: number, dy: number) => {
    if (locked.current) return;
    // Locking wins over cancelling when a diagonal slide crosses both: locking
    // is recoverable and cancelling is not.
    if (dy <= -LOCK_SLIDE_DP) {
      locked.current = true;
      setIsLocked(true);
      setIsHolding(false);
      cancelArmed.current = false;
      setIsCancelArmed(false);
      return;
    }
    const armed = dx <= -CANCEL_SLIDE_DP;
    if (armed !== cancelArmed.current) {
      cancelArmed.current = armed;
      setIsCancelArmed(armed);
    }
  }, []);

  const endHold = useCallback(async () => {
    // A locked recording ignores the release — that is what locking means.
    if (locked.current) {
      setIsHolding(false);
      return;
    }
    setIsHolding(false);
    if (!isRecording) return;
    if (cancelArmed.current) {
      await cancelRecording();
      return;
    }
    await commitRecording();
  }, [cancelRecording, commitRecording, isRecording]);

  const clearAttachment = useCallback(() => {
    replaceAttachment(null);
    setNotice(null);
  }, [replaceAttachment]);

  // Distinct from `clearAttachment`: the media is now referenced by a rendered
  // message, so the file must NOT be reaped. Dropping the slot is all that
  // happens.
  const consumeAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  return {
    attachment,
    isPicking,
    isRecording,
    isHolding,
    isLocked,
    isCancelArmed,
    recordingMillis,
    notice,
    dismissNotice,
    pickFile,
    toggleRecording,
    beginHold,
    updateHold,
    endHold,
    cancelRecording,
    clearAttachment,
    consumeAttachment,
  };
}
