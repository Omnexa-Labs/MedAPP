// ComposerMediaTray — the strip that sits between the chat canvas and the input
// pill, showing whatever the composer is currently holding: a pending
// attachment, a live recording, or a failure notice.
//
// Shared by AiAssistantScreen and ChatThreadScreen because both composers grew
// the same two controls, and an attachment chip that looks different in the two
// threads is the drift the shared-component layer exists to stop. It is NOT in
// src/components/ui: there is no Figma frame for it, so it is not part of the
// design system yet.
//
// ~~FLAGGED FOR DESIGN~~ ANSWERED 2026-08-08, and the answer was the WhatsApp
// idiom. The flag read: "whether the recording state should take over the whole
// pill instead of stacking above it". The voice-note frames on the Messaging page
// (`voice_note — 1..9`, each with a DARK proof beneath it) take over the pill, so
// THE RECORDING AND REVIEW STATES HAVE MOVED OUT OF THIS FILE into
// ./VoiceNoteComposer, which draws them inside the pill.
//
// What is left here is what still stacks above the pill and always did: the
// notice, and the chip for a picked FILE. A document has no in-pill state to take
// over — there is nothing to scrub and nothing to time — so it keeps the chip.
//
// docs/BRAND.md compliance notes for a reviewer:
//   - every glyph goes through <Icon />; this file imports no icon library.
//   - every colour is a token, via a NativeWind class or useTokenColor. No hexes.
//   - the two controls it renders (remove attachment, discard recording) are
//     44x44, per docs/MOBILE_UX.md. The recording dot is decoration, not a target.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API here.
// This file uses none — the SDK 55 surface lives in ./useComposerMedia.

import { Pressable, Text, View } from "react-native";
import { Icon, InfoCallout } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import {
  formatDuration,
  type ComposerAttachmentKind,
  type ComposerMedia,
} from "./useComposerMedia";

/**
 * Chrome, not clinical: a paperclip'd document and a microphone are UI concepts,
 * so they come from the chrome half of the icon gate rather than Health Icons
 * (docs/BRAND.md — Health Icons is the CLINICAL vocabulary).
 */
const KIND_GLYPH: Record<ComposerAttachmentKind, "description" | "mic"> = {
  file: "description",
  recording: "mic",
};

export function ComposerMediaTray({
  media,
  showRecordingState = true,
}: {
  media: ComposerMedia;
  /**
   * False for a composer that draws the recording and review states INSIDE its
   * pill (ChatThreadScreen, via ./VoiceNoteComposer). True — the default — keeps
   * the stacked bar for AiAssistantScreen, whose pill has no in-place treatment
   * and no frame asking for one.
   *
   * A prop rather than two trays: this file exists because two composers had two
   * copies of the same chip, and splitting it again for one differing row would
   * undo that.
   */
  showRecordingState?: boolean;
}) {
  const { attachment, isRecording, recordingMillis, notice } = media;
  const mutedGlyph = useTokenColor("on-surface-variant");
  const errorGlyph = useTokenColor("on-error-container");

  // A voice note is drawn inside the pill when the caller says so, and the tray
  // must not also draw a chip for it — the same capture would appear twice, once
  // as a scrubber and once as a filename.
  const showsAttachment =
    Boolean(attachment) && (showRecordingState || attachment?.kind !== "recording");
  const showsRecording = isRecording && showRecordingState;
  if (!showsAttachment && !showsRecording && !notice) return null;

  return (
    <View className="mx-md mb-xs gap-xs">
      {notice ? (
        <InfoCallout tone="error" testID="composer-media-notice">
          <View className="gap-xs">
            <Text className="font-body-md text-body-md text-on-error-container">
              {notice.message}
            </Text>
            {/* InfoCallout is deliberately non-dismissible as a POLICY note, but a
                transient failure has to be clearable or it outlives its cause.
                Rendered as the callout's own last-line text action — the exact
                case its `children: ReactNode` escape hatch documents. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
              onPress={media.dismissNotice}
              className="h-11 justify-center active:opacity-70"
            >
              <Text className="font-label-md text-label-md text-on-error-container underline">
                Dismiss
              </Text>
            </Pressable>
          </View>
        </InfoCallout>
      ) : null}

      {showsRecording ? (
        <View
          className="flex-row items-center gap-sm rounded-full border border-error/40 bg-error-container px-sm py-xs"
          testID="composer-recording-bar"
        >
          {/* Colour is never the only signal: the words "Recording" carry it. */}
          <View className="h-2 w-2 rounded-full bg-error" />
          <Icon chrome="mic" size={20} color={errorGlyph} />
          <Text className="flex-1 font-label-md text-label-md text-on-error-container">
            Recording · {formatDuration(recordingMillis)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard recording"
            onPress={() => void media.cancelRecording()}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon chrome="delete-outline" size={22} color={errorGlyph} />
          </Pressable>
        </View>
      ) : null}

      {attachment && showsAttachment && !isRecording ? (
        <View
          className="flex-row items-center gap-sm rounded-full border border-outline-variant bg-surface-container-high px-sm py-xs"
          testID="composer-attachment-chip"
        >
          <Icon chrome={KIND_GLYPH[attachment.kind]} size={20} color={mutedGlyph} />
          <View className="min-w-0 flex-1">
            <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
              {attachment.name}
            </Text>
            {/* "Not sent yet" is stated in words rather than implied by the
                chip's position. The upload exists now, but it does not run until
                SEND — the file is genuinely still device-local while this chip is
                on screen. See ChatThreadScreen's VOICE NOTES block. */}
            <Text className="font-label-sm text-label-sm text-on-surface-variant" numberOfLines={1}>
              {attachment.meta} · not sent yet
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove attachment ${attachment.name}`}
            onPress={media.clearAttachment}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon chrome="close" size={22} color={mutedGlyph} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
