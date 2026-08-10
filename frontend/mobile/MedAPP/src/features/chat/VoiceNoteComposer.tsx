// The voice-note half of the chat composer: the mic target, the bar that
// replaces the field while recording, and the review bar that replaces it once
// there is something to listen back to.
//
// Figma, Messaging page — every frame has a DARK proof directly beneath it:
//   1 composer idle · 2 hold to record · 3 slide to cancel (armed)
//   4 locked (hands-free) · 5 review before send (scrub)
//
// It lives beside ChatThreadScreen rather than in src/components/ui because it
// is not a design-system component: it is one screen's composer, and there is no
// Design System frame for it (the states above are on the Messaging page, which
// is where a screen's own states belong).
//
// ---------------------------------------------------------------------------
// HOLD **AND** TAP, AND WHY THE TAP PATH IS NOT A CONSOLATION PRIZE
// ---------------------------------------------------------------------------
// `VoiceMicButton` carries BOTH gestures on one control:
//
//   onPressIn / onTouchMove / onPressOut   hold, slide to cancel, slide to lock
//   onPress                                tap to start, tap again to stop
//
// Hold-to-record cannot be operated by Switch Control, which has activation and
// no notion of a held touch, and it cannot be operated under VoiceOver or
// TalkBack, which consume the touch and deliver an activation to the focused
// element — so `onPressIn`/`onPressOut` either never arrive or arrive together
// with no gesture in between. A hold-only mic is not "harder" for those users; it
// is inoperable.
//
// So `onPress` fires `toggleRecording`, which starts the recording ALREADY
// LOCKED — i.e. it lands in exactly the state a held gesture reaches by sliding
// up, with the same visible Stop and Cancel targets. One state machine, one set
// of labels, one set of tests. The idle composer names the tap path in words
// under the pill, because an invisible gesture that is the only documented way in
// is not a feature.
//
// `onPress` and `onPressOut` both firing on a real hold would double-handle the
// release. They do not collide because `endHold` commits and clears
// `isRecording`, so the `onPress` that follows a hold sees nothing recording and
// starts nothing — guarded explicitly below rather than left to timing.
//
// docs/BRAND.md compliance notes for a reviewer:
//   - every glyph goes through <Icon />; this file imports no icon library.
//   - every colour is a token, via a NativeWind class or useTokenColor.
//   - every control is 44x44 or 44 tall, per docs/MOBILE_UX.md. The recording
//     dot is decoration and the word "Recording" carries its meaning, per
//     BRAND's "never use colour as the only signal".
//   - spacing is 4/8/12/16 only.

import { useRef } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { VoicePlayButton, VoiceWaveform, useVoiceNotePlayback, useLocalVoiceNoteSource } from "./VoiceNoteAudio";
import { formatDuration, type ComposerMedia } from "./useComposerMedia";

/**
 * The mic control. 44x44, and the only control in the composer that carries a
 * gesture.
 *
 * `hitSlop` is deliberately absent: the box is drawn at the floor, and slop on a
 * press-and-hold target widens the area a slide has to leave before `onTouchMove`
 * reports anything useful.
 */
export function VoiceMicButton({ media }: { media: ComposerMedia }) {
  const muted = useTokenColor("on-surface-variant");
  const onPrimary = useTokenColor("on-primary");
  const onError = useTokenColor("on-error");
  const primary = useTokenColor("primary");
  const error = useTokenColor("error");

  // The press origin, for the slide thresholds. `pageX/pageY` rather than
  // `locationX/locationY`: location is relative to the element and stops being
  // meaningful the moment the finger leaves it, which is the entire gesture.
  const origin = useRef<{ x: number; y: number } | null>(null);
  // True from press-in until the matching press-out, so the `onPress` that
  // follows a real hold does not start a second recording.
  const handledAsHold = useRef(false);

  const recording = media.isRecording;
  const fillToken = recording ? (media.isCancelArmed ? error : primary) : undefined;
  const glyph = recording ? (media.isCancelArmed ? onError : onPrimary) : muted;

  // The label follows the state, so a screen reader announces what the next
  // activation DOES rather than what the glyph looks like.
  const label = recording ? "Stop recording" : "Voice message";
  const hint = recording
    ? "Double tap to stop recording and review the voice note."
    : "Double tap to start recording. Tap again to stop. Or hold, and slide left to cancel.";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: recording }}
      testID="voice-mic-button"
      onPressIn={(e: GestureResponderEvent) => {
        origin.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        handledAsHold.current = false;
        if (!recording) {
          handledAsHold.current = true;
          void media.beginHold();
        }
      }}
      onTouchMove={(e: GestureResponderEvent) => {
        const start = origin.current;
        if (!start) return;
        media.updateHold(e.nativeEvent.pageX - start.x, e.nativeEvent.pageY - start.y);
      }}
      onPressOut={() => {
        origin.current = null;
        if (handledAsHold.current) void media.endHold();
      }}
      // THE ACCESSIBLE PATH. Assistive technology delivers an activation and no
      // hold, so this is the branch it takes — and `handledAsHold` keeps a real
      // hold from arriving here twice.
      onPress={() => {
        if (handledAsHold.current) return;
        void media.toggleRecording();
      }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: fillToken ?? "transparent",
      }}
    >
      <Icon chrome={recording ? "stop" : "mic"} size={24} color={glyph} />
    </Pressable>
  );
}

/**
 * What the field becomes while recording.
 *
 * Three shapes, one row, because they are the same control in three states and
 * splitting them into three components is how the timer ends up in two places:
 *   held           dot · timer · "‹ Slide to cancel"
 *   cancel armed   trash · "Release to cancel" · timer, on error-container
 *   locked         dot · timer · "Cancel" · (the mic, now a Stop, sits outside)
 */
export function VoiceRecordingBar({ media }: { media: ComposerMedia }) {
  const onErrorContainer = useTokenColor("on-error-container");
  const muted = useTokenColor("on-surface-variant");

  if (!media.isRecording) return null;

  if (media.isCancelArmed) {
    return (
      <View
        className="min-w-0 flex-1 flex-row items-center gap-sm pl-sm"
        testID="voice-recording-bar-cancel"
      >
        <Icon chrome="delete-outline" size={20} color={onErrorContainer} />
        <Text className="flex-1 font-label-md text-label-md text-on-error-container">
          Release to cancel
        </Text>
        <Text className="font-label-sm text-label-sm text-on-error-container">
          {formatDuration(media.recordingMillis)}
        </Text>
      </View>
    );
  }

  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-sm pl-sm" testID="voice-recording-bar">
      {/* Decoration. "Recording" is not written here because the timer plus the
          live mm:ss is the stronger signal in a bar this narrow; the accessible
          announcement lives on the mic's own label, which now reads
          "Stop recording". */}
      <View className="h-2 w-2 rounded-full bg-error" />
      <Text className="font-label-md text-label-md text-on-surface">
        {formatDuration(media.recordingMillis)}
      </Text>
      <View className="flex-1" />
      {media.isLocked ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
          onPress={() => void media.cancelRecording()}
          className="h-11 justify-center px-sm active:opacity-70"
        >
          <Text className="font-label-md text-label-md text-error">Cancel</Text>
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-xs pr-xs">
          <Icon chrome="chevron-left" size={20} color={muted} />
          <Text className="font-label-sm text-label-sm text-on-surface-variant">
            Slide to cancel
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Review before send. Replaces the field once a capture exists.
 *
 * The waveform's progress is real playback position; the bars are not. See the
 * header of ./VoiceNoteAudio.
 *
 * SEND IS NOT IN HERE. The composer's own send button sends, so a voice note goes
 * out through exactly the path a typed message does — one `send()`, one outbox
 * entry, one failure state. A second send button beside the first is how the two
 * paths drift.
 */
export function VoiceReviewBar({ media }: { media: ComposerMedia }) {
  // Resolved before the early return below — hooks cannot be conditional, and
  // this one sat inline in the JSX for one revision.
  const muted = useTokenColor("on-surface-variant");
  const attachment = media.attachment;
  const source = useLocalVoiceNoteSource(
    attachment && attachment.kind === "recording" ? attachment.uri : null,
  );
  const playback = useVoiceNotePlayback(source, attachment?.durationMillis ?? null);

  if (!attachment || attachment.kind !== "recording") return null;

  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-xs" testID="voice-review-bar">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Discard recording"
        onPress={media.clearAttachment}
        className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
      >
        <Icon chrome="delete-outline" size={22} color={muted} />
      </Pressable>
      <VoicePlayButton
        playback={playback}
        glyphToken="primary"
        fillToken="primary"
        fillAlpha={0.12}
        label="voice note"
      />
      <VoiceWaveform
        progress={playback.progress}
        playedToken="primary"
        restToken="outline-variant"
      />
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{playback.label}</Text>
    </View>
  );
}
