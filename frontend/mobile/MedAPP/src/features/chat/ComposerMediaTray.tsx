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
// FLAGGED FOR DESIGN: neither composer frame draws a pending-attachment state or
// a recording state at all — the mic and paperclip were drawn as decoration. This
// tray is therefore built from existing system parts only (InfoCallout, Icon, the
// surface-container + outline-variant + radius/full vocabulary the input pill
// already uses) rather than inventing a treatment. It needs a designer pass
// before it ships: specifically whether the recording state should take over the
// whole pill (the WhatsApp idiom) instead of stacking above it.
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

export function ComposerMediaTray({ media }: { media: ComposerMedia }) {
  const { attachment, isRecording, recordingMillis, notice } = media;
  const mutedGlyph = useTokenColor("on-surface-variant");
  const errorGlyph = useTokenColor("on-error-container");

  if (!attachment && !isRecording && !notice) return null;

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

      {isRecording ? (
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

      {attachment && !isRecording ? (
        <View
          className="flex-row items-center gap-sm rounded-full border border-outline-variant bg-surface-container-high px-sm py-xs"
          testID="composer-attachment-chip"
        >
          <Icon chrome={KIND_GLYPH[attachment.kind]} size={20} color={mutedGlyph} />
          <View className="min-w-0 flex-1">
            <Text className="font-label-md text-label-md text-on-surface" numberOfLines={1}>
              {attachment.name}
            </Text>
            {/* "Not sent yet" is stated in words rather than implied by the chip's
                position, because there is no upload endpoint and the file is
                device-local until one exists. See ./useComposerMedia. */}
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
