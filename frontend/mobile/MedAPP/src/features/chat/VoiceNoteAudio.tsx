// Voice-note playback primitives — the waveform, the play/pause target, and the
// player hook the composer's review bar and the sent bubble both use.
//
// Figma: Messaging page, `voice_note — 5 · review before send` and
// `voice_note — 6/7 · sent bubble / playing`, each with a DARK proof beneath it.
//
// ---------------------------------------------------------------------------
// THE WAVEFORM IS A PROGRESS BAR, NOT AN ANALYSIS
// ---------------------------------------------------------------------------
// `docs/api/inbox_service.md` lists "Thumbnails, transcoding, waveform
// generation" under WHAT WAS NOT BUILT, and there is no client-side decoder
// either — expo-audio exposes position and duration, not samples. So the bars
// are a FIXED amplitude figure and the only real number in the control is
// `duration_ms`, which the server persists precisely so a player can be drawn
// without downloading the audio.
//
// This is stated here, in the file that draws it, because a waveform is exactly
// the kind of ornament that gets read as data. Nothing in it describes the
// recording. Every number the user sees — the duration, the elapsed time, the
// played fraction — is real.
//
// ---------------------------------------------------------------------------
// SDK 55 APIs USED, AND THE DOC FACTS THAT DECIDED THEM
// (https://docs.expo.dev/versions/v55.0.0/sdk/audio/ — read before this file)
// ---------------------------------------------------------------------------
// expo-audio (expo-av is superseded and is NOT installed)
//   `useAudioPlayer(source?, options?)` returns an `AudioPlayer` that RELEASES
//   ITSELF on unmount — so a transcript of twenty voice notes does not leak
//   twenty players, and nothing here calls `remove()` by hand.
//   `AudioSource` is `string | number | null | object`, and the object form
//   carries `headers?: Record<string, string>` — "HTTP headers to send with
//   requests for remote audio". THAT FIELD IS THE WHOLE REASON PLAYBACK WORKS
//   HERE: there is no attachment url and no signed url (see ./api), so the
//   bytes are fetched from a path composed of ids with the normal bearer token
//   attached. A `null` source is legal and gives an idle player, which is what
//   this file passes while the token is still being read.
//   `useAudioPlayerStatus(player)` returns `AudioStatus`: `currentTime` and
//   `duration` in SECONDS (not millis — `duration_ms` from the wire has to be
//   divided), plus `playing`, `isLoaded` and `didJustFinish`.
//   `play()` and `pause()` are SYNCHRONOUS and return void; `seekTo(seconds)`
//   returns a Promise.
//   `setAudioModeAsync({ playsInSilentMode })` is what lets a note play with the
//   ringer switch silenced — a patient's reply that is silent on an iPhone with
//   the switch flipped reads as a broken player.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Icon } from "@/components/ui";
import { useTokenColor, type ColorToken } from "@/lib/tokens";
import { attachmentAuthHeaders, attachmentContentUri } from "./api";
import { formatDuration } from "./useComposerMedia";

/**
 * The bar heights, in dp. Twenty-eight of them at 2 wide with a 2 gap is 110dp,
 * which is what fits the review pill beside two 44 targets and a duration at
 * 361 — the content width `Composer / Chat` 550:2002 is drawn at.
 *
 * Fixed rather than random: a figure that changes on every render reads as the
 * audio being re-analysed, and a snapshot test of a random waveform is a
 * snapshot test of nothing.
 */
const BARS = [6, 10, 16, 22, 14, 9, 18, 24, 20, 12, 7, 15, 21, 17, 10, 6, 13, 19, 23, 16, 11, 8, 14, 20, 18, 12, 9, 6];

export interface VoiceWaveformProps {
  /** 0..1. The played portion, which is the only thing these bars encode. */
  progress: number;
  /** Token name for the played bars. */
  playedToken: ColorToken;
  /** Token name for the rest. */
  restToken: ColorToken;
  /** Alpha for the rest, so a wash on an accent surface inverts with it. */
  restAlpha?: number;
}

export function VoiceWaveform({
  progress,
  playedToken,
  restToken,
  restAlpha,
}: VoiceWaveformProps) {
  const played = useTokenColor(playedToken);
  const rest = useTokenColor(restToken, restAlpha);
  const cut = Math.round(BARS.length * Math.min(1, Math.max(0, progress)));

  return (
    // Decorative in the accessibility tree: the duration and the play control
    // beside it carry every fact this figure could convey, and a screen reader
    // announcing twenty-eight bars is noise.
    <View
      className="flex-1 flex-row items-center"
      style={{ gap: 2, height: 24 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {BARS.map((height, i) => (
        <View
          key={i}
          style={{
            width: 2,
            height,
            borderRadius: 1,
            backgroundColor: i < cut ? played : rest,
          }}
        />
      ))}
    </View>
  );
}

export interface VoiceNoteSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * The source for a voice note that is still on this device (the review bar).
 * Memoised so the player is not re-created on every keystroke in the composer.
 */
export function useLocalVoiceNoteSource(uri: string | null): VoiceNoteSource | null {
  return useMemo(() => (uri ? { uri } : null), [uri]);
}

/**
 * The source for a voice note the server holds.
 *
 * Composed from ids, never from a url on the wire — there is none, deliberately
 * (see ./api). The bearer token is read fresh each time rather than captured,
 * because a concurrent query may have rotated it; and the source stays `null`
 * until it resolves, which is why the play control reports "loading" rather than
 * failing on a mount race.
 */
export function useRemoteVoiceNoteSource(
  threadId: string | undefined,
  attachmentId: string | undefined,
): VoiceNoteSource | null {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!threadId || !attachmentId) return;
    let alive = true;
    void attachmentAuthHeaders().then((h) => {
      if (alive) setHeaders(h);
    });
    return () => {
      alive = false;
    };
  }, [threadId, attachmentId]);

  return useMemo(() => {
    if (!threadId || !attachmentId || !headers) return null;
    return { uri: attachmentContentUri(threadId, attachmentId), headers };
  }, [threadId, attachmentId, headers]);
}

export interface VoiceNotePlayback {
  isPlaying: boolean;
  isReady: boolean;
  /** 0..1, for the waveform. */
  progress: number;
  /**
   * The mm:ss the control shows: elapsed while playing or part-way through,
   * total at rest. WhatsApp's behaviour, and the one that answers the question
   * the user is actually asking at each moment.
   */
  label: string;
  toggle: () => void;
}

/**
 * One voice note's playback.
 *
 * `durationMs` is the wire's `duration_ms` and is preferred over the player's own
 * `duration` for the RESTING label, so a bubble shows a real length before the
 * audio has loaded — which is the entire reason the backend persists it. Once
 * loaded the player's duration wins for progress, because that is what
 * `currentTime` is measured against.
 */
export function useVoiceNotePlayback(
  source: VoiceNoteSource | null,
  durationMs: number | null,
): VoiceNotePlayback {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const playerDuration = status.duration > 0 ? status.duration : 0;
  const wireDuration = durationMs !== null && durationMs > 0 ? durationMs / 1000 : 0;
  const total = playerDuration || wireDuration;
  const elapsed = status.currentTime > 0 ? status.currentTime : 0;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;

  const toggle = useCallback(() => {
    if (!source) return;
    if (status.playing) {
      player.pause();
      return;
    }
    // A note played to the end leaves `currentTime` at the end, so the next tap
    // would be a no-op. Rewind first.
    if (status.didJustFinish || (total > 0 && elapsed >= total - 0.05)) {
      void player.seekTo(0);
    }
    // The ringer switch must not silence a clinician's reply.
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    player.play();
  }, [elapsed, player, source, status.didJustFinish, status.playing, total]);

  return {
    isPlaying: status.playing,
    isReady: Boolean(source) && status.isLoaded,
    progress,
    label: formatDuration(Math.round((elapsed > 0 ? elapsed : total) * 1000)),
    toggle,
  };
}

export interface VoicePlayButtonProps {
  playback: VoiceNotePlayback;
  /** Glyph colour token. */
  glyphToken: ColorToken;
  /** Fill token, or undefined for no fill. */
  fillToken?: ColorToken;
  fillAlpha?: number;
  /**
   * Named in the label so a screen reader says which note. "Play voice note" on
   * a transcript of six is six identical buttons.
   */
  label: string;
}

export function VoicePlayButton({
  playback,
  glyphToken,
  fillToken,
  fillAlpha,
  label,
}: VoicePlayButtonProps) {
  const glyph = useTokenColor(glyphToken);
  const fill = useTokenColor(fillToken ?? "surface", fillAlpha);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playback.isPlaying ? `Pause ${label}` : `Play ${label}`}
      accessibilityState={{ selected: playback.isPlaying }}
      onPress={playback.toggle}
      // 44x44 drawn, per docs/MOBILE_UX.md and the frames.
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: fillToken ? fill : "transparent",
      }}
    >
      <Icon chrome={playback.isPlaying ? "pause" : "play-arrow"} size={24} color={glyph} />
    </Pressable>
  );
}

/**
 * The body of an outgoing voice-note bubble: play/pause, waveform, duration.
 *
 * Sits on `primary`, so every colour is an `on-primary` wash rather than a
 * literal — `#ffffff` at 20% is invisible on the pale teal `primary` takes in
 * dark mode, which is the defect the whole bubble was retokenised to fix.
 */
export function VoiceNoteBubbleBody({
  threadId,
  attachmentId,
  localUri,
  durationMs,
}: {
  threadId?: string;
  attachmentId?: string;
  /** Present while the note is still on this device — a send in flight, or failed. */
  localUri?: string;
  durationMs: number | null;
}) {
  const remote = useRemoteVoiceNoteSource(
    attachmentId ? threadId : undefined,
    attachmentId ? attachmentId : undefined,
  );
  const local = useLocalVoiceNoteSource(localUri ?? null);
  // The LOCAL file wins while it exists. It is the same audio, it needs no
  // request, and it is the only copy that can be played back after a failed
  // upload — which is what makes the failure recoverable rather than terminal.
  const playback = useVoiceNotePlayback(local ?? remote, durationMs);

  return (
    <View className="flex-row items-center gap-base">
      <VoicePlayButton
        playback={playback}
        glyphToken="on-primary"
        fillToken="on-primary"
        fillAlpha={0.2}
        label="voice note"
      />
      <VoiceWaveform
        progress={playback.progress}
        playedToken="on-primary"
        restToken="on-primary"
        restAlpha={0.4}
      />
      <Text className="font-label-sm text-label-sm text-on-primary/75">{playback.label}</Text>
    </View>
  );
}
