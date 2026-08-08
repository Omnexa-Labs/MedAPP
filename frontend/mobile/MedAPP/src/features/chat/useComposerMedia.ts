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
// WHAT IS REAL AND WHAT IS NOT — read this before trusting the UI
// ---------------------------------------------------------------------------
// The file picker, the microphone permission grant, the recording, and the
// on-device file are ALL REAL. What this hook still does not do is UPLOAD, so an
// "attached" file never leaves the handset. The message the composer appends
// carries the local `file://` uri and the metadata, and the bubble renders from
// that. `ComposerAttachment.uploaded` is hardcoded `false` and every consumer
// must treat the uri as device-local.
//
// THE ENDPOINT THIS FILE ASKED FOR NOW EXISTS (backend, 2026-08-08):
//
//   POST /v1/threads/:id/attachments        multipart `file` + optional
//                                           `duration_ms` -> 201 AttachmentOut
//   POST /v1/threads/:id/messages           { body, attachment_ids: [id] }
//   GET  /v1/threads/:id/attachments/:aid/content
//
// See `docs/api/inbox_service.md`. Two things to know before wiring it:
//   • Upload is a SEPARATE call from send. The attachment is staged
//     (`message_id: null`) and adopted by the message that references it, so
//     the upload can start the moment the file is picked.
//   • There is NO url on the response, on purpose — a link that grants access
//     is a bearer credential for PHI. Build the content path from the ids and
//     send the normal bearer token.
//
// Limits the UI has to respect: 8 MiB (413 over), and an allowlist of audio,
// image and PDF types (415 otherwise). `duration_ms` should be passed for a
// recording — the server persists it so the player renders without a download.
//
// Still hardcoding `uploaded: false` until that wiring lands. The original
// judgement stands: render the picked file LOCALLY rather than fake a POST,
// because a faked upload reads as working software and is discovered only in QA.
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
//   • Upload progress / retry / queue. There is nothing to upload to (above).
//     A spinner over a no-op is worse than no spinner.
//   • Recording PLAYBACK before send. `useAudioPlayer` would give it cheaply,
//     but a review-and-scrub affordance is a design surface (waveform, scrubber,
//     trim) that no frame specifies. The cancel path covers the actual need —
//     "I misspoke, throw it away".
//   • Pause/resume mid-recording. `recorder.pause()` exists; a paused voice note
//     is not a concept either composer draws.

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
  kind: "permission-denied" | "permission-blocked" | "capture-failed" | "pick-failed";
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

/** How often the recording timer ticks. 1s: the UI shows whole seconds. */
const TICK_MS = 1000;

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

export interface ComposerMedia {
  /** The single pending attachment, or null. */
  attachment: ComposerAttachment | null;
  /** True while the system picker is being opened, so the control can disable. */
  isPicking: boolean;
  isRecording: boolean;
  /** Elapsed capture time, for the composer's mm:ss readout. */
  recordingMillis: number;
  notice: ComposerNotice | null;
  dismissNotice: () => void;
  pickFile: () => Promise<void>;
  /** Toggle entry point for the mic control — starts, or commits if recording. */
  toggleRecording: () => Promise<void>;
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
  // Mic
  //
  // PRESS-TO-START / PRESS-TO-STOP, not hold-to-record. The reason is the
  // PERMISSION MODAL: the first tap has to await a system dialog, and a
  // press-and-hold gesture cannot survive one — the finger lifts onto the
  // dialog, so `onPressOut` fires against a recorder that has not started and
  // the user is left holding a button that did nothing. A toggle also gives the
  // cancel path somewhere to live: a second, separate "Discard recording"
  // target, which hold-to-record can only express as a slide-off gesture that
  // no frame specifies and that has no accessible equivalent.
  // -------------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    if (starting.current || isRecording) return;
    starting.current = true;
    setNotice(null);
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
        setRecordingMillis(Date.now() - startedAt.current);
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
        uploaded: false,
      });
    } catch {
      if (mounted.current) setNotice(CAPTURE_FAILED);
    } finally {
      // Hand the audio session back so the mic indicator clears and playback
      // elsewhere in the app is not stuck in record mode.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      if (mounted.current) setRecordingMillis(0);
    }
  }, [recorder, replaceAttachment, stopTick]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await commitRecording();
      return;
    }
    await startRecording();
  }, [commitRecording, isRecording, startRecording]);

  const cancelRecording = useCallback(async () => {
    if (!isRecording) return;
    // Read by the `commitRecording` continuation, which reaps rather than
    // attaches. Cancelling still has to STOP the recorder — abandoning it would
    // leave the session open and the OS indicator lit.
    abandoned.current = true;
    await commitRecording();
    if (mounted.current) setNotice(null);
  }, [commitRecording, isRecording]);

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
    recordingMillis,
    notice,
    dismissNotice,
    pickFile,
    toggleRecording,
    cancelRecording,
    clearAttachment,
    consumeAttachment,
  };
}
