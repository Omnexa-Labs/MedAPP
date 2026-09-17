// Photograph a prescription label.
//
// Frame: UI_screens/Patient_facing_screens/add_medication_smart_scan_flow (the
// "Take Photo or Upload" card) and .../smart_scan_preview_verification (the
// captured-image review).
//
// ===========================================================================
// THE CAMERA IS REAL. THE "AI EXTRACTION" IS NOT, AND IS NOT CLAIMED.
// ===========================================================================
// `expo-camera@~55.0.21` was added for this screen, so the viewfinder, the
// permission prompt and the capture are genuine. What does NOT exist is the thing
// the frame promises underneath the card — "AI will automatically extract
// medication details for you" and, on the next frame, "AI Extraction Complete".
//
// There is no prescription reader anywhere in this product. The only
// image-extraction agent is lab_reader_agent, which reads LAB REPORTS against
// agents/prompts/_lab_reader_extraction.md; pointing a medication label at it
// would return lab analytes or nothing. So this screen does not say extraction
// happened, does not show ticked "verified" fields, and does not pre-fill
// anything. It captures a photo and says so.
//
// That wording is the whole point. A screen that announced "AI Extraction
// Complete" over fields the patient actually typed themselves would be inviting
// them to trust a transcription no machine performed — on a drug name and a dose.
//
// ===========================================================================
// NOT TESTABLE IN EXPO GO
// ===========================================================================
// expo-camera is a native module and Expo Go ships its own set, so the viewfinder
// only appears in a development build. The permission-denied and
// permission-undetermined branches ARE reachable in Expo Go and in tests, which
// is why they are separate components rather than early returns.
//
// SDK 55 API, per https://docs.expo.dev/versions/v55.0.0/sdk/camera/ :
//   `CameraView`, `useCameraPermissions()` -> [PermissionResponse | null, request],
//   `permission.granted`, `ref.takePictureAsync()` -> CameraCapturedPicture.

import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, Icon, InfoCallout } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

/**
 * What the flow gets back from a capture.
 *
 * Only the fields this app has a use for. `CameraCapturedPicture` also carries
 * `base64` and `exif`, and neither is requested: base64 of a full-resolution
 * photo is a multi-megabyte string held in JS memory, and EXIF on a photo of a
 * prescription label carries GPS coordinates of wherever the patient keeps their
 * medicines. Not asking for it is the only way not to handle it.
 */
export type CapturedLabel = {
  uri: string;
  width: number;
  height: number;
};

export function MedicationScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [captured, setCaptured] = useState<CapturedLabel | null>(null);

  return (
    <DetailShell
      title="Photograph label"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/active-medications" as Href);
      }}
    >
      <View className="flex-1 px-4 pt-6">
        {captured ? (
          <CapturedReview captured={captured} onRetake={() => setCaptured(null)} />
        ) : permission?.granted ? (
          <Viewfinder onCaptured={setCaptured} />
        ) : permission?.canAskAgain === false ? (
          <PermissionBlocked />
        ) : (
          <PermissionPrompt onAllow={requestPermission} pending={permission === null} />
        )}
      </View>
    </DetailShell>
  );
}

/**
 * Before the OS prompt. Explains the purpose BEFORE triggering it, because the
 * system dialog is one-shot: a patient who declines it cannot be asked again from
 * inside the app, only from Settings.
 */
function PermissionPrompt({ onAllow, pending }: { onAllow: () => void; pending: boolean }) {
  const primary = useTokenColor("primary");

  return (
    <Card className="p-5" testID="scan-permission-prompt">
      <View className="h-12 w-12 items-center justify-center rounded-md bg-primary-tint">
        <Icon chrome="photo-camera" size={24} color={primary} />
      </View>
      <Text className="mt-4 font-headline-md text-headline-md text-on-surface">
        Photograph the label
      </Text>
      <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
        Use the photo as a temporary reference while entering your medicine. It is not uploaded or
        saved with the medication. You will type the details yourself; nothing is extracted.
      </Text>
      <View className="mt-5">
        <Button
          label={pending ? "Checking permission…" : "Allow camera access"}
          onPress={onAllow}
          disabled={pending}
          testID="scan-allow-camera"
        />
      </View>
    </Card>
  );
}

/**
 * The patient declined and `canAskAgain` is false, so `requestPermission()` would
 * resolve denied without showing anything. An "Allow camera access" button here
 * would be a control that provably does nothing — so it links to Settings, which
 * is the only place the decision can still be changed.
 */
function PermissionBlocked() {
  return (
    <Card className="p-5" testID="scan-permission-blocked">
      <Text className="font-headline-md text-headline-md text-on-surface">
        Camera access is off
      </Text>
      <Text className="mt-2 font-body-md text-body-md text-on-surface-variant">
        MedApp cannot open the camera because access was declined. You can turn it back on in
        Settings, or add the medication by typing its details instead.
      </Text>
      <View className="mt-5 gap-3">
        <Button
          label="Open Settings"
          onPress={() => {
            void Linking.openSettings();
          }}
          testID="scan-open-settings"
        />
        <Button
          label="Type the details instead"
          variant="secondary"
          onPress={() => router.replace("/(app)/add-medication" as Href)}
          testID="scan-manual-instead"
        />
      </View>
    </Card>
  );
}

function Viewfinder({ onCaptured }: { onCaptured: (captured: CapturedLabel) => void }) {
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const capture = useCallback(async () => {
    // Guards a second tap while the first shutter is in flight. Without it two
    // captures race and the later one wins, which on a slow device means the
    // review screen shows a photo the patient did not think they took.
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const photo = await cameraRef.current?.takePictureAsync();
      if (!photo) {
        setFailed(true);
        return;
      }
      onCaptured({ uri: photo.uri, width: photo.width, height: photo.height });
    } catch {
      // A real failure — no storage, camera taken by another app. Reported rather
      // than swallowed, and it does NOT advance the flow.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onCaptured]);

  return (
    <View className="flex-1">
      <View className="overflow-hidden rounded-md bg-surface-container-high" style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" testID="scan-viewfinder" />
      </View>

      <Text className="mt-3 font-body-md text-body-md text-on-surface-variant">
        Fill the frame with the label. Supports labels, boxes and printed prescriptions.
      </Text>

      {failed ? (
        <View className="mt-3" accessibilityRole="alert">
          <InfoCallout tone="error" testID="scan-capture-failed">
            The photo could not be taken, so nothing has been attached. Try again, or type the
            details instead.
          </InfoCallout>
        </View>
      ) : null}

      <View className="mt-4 pb-4">
        <Button
          label={busy ? "Taking photo…" : "Take photo"}
          onPress={() => void capture()}
          disabled={busy}
          testID="scan-capture"
        />
      </View>
    </View>
  );
}

/**
 * The captured photo, before it is carried into the form.
 *
 * This is where the frame puts "AI Extraction Complete" over four ticked fields.
 * It says the opposite, because the opposite is true — and it says it in the
 * error tone, not as a friendly aside, so it is not mistaken for a progress note.
 */
function CapturedReview({ captured, onRetake }: { captured: CapturedLabel; onRetake: () => void }) {
  return (
    <View className="flex-1">
      <InfoCallout tone="error" testID="scan-no-extraction-notice">
        Nothing is extracted from this photo. Use it as a temporary reference while entering the
        medicine on the next step. The photo will not be saved with the record.
      </InfoCallout>

      <View
        className="mt-4 overflow-hidden rounded-md bg-surface-container-high"
        style={{ flex: 1 }}
      >
        <Image
          source={{ uri: captured.uri }}
          // `contain`, not `cover`: cropping a photo of a label can cut the dose
          // off the edge, and the point of keeping it is that it stays readable.
          contentFit="contain"
          style={{ flex: 1 }}
          accessibilityLabel="The prescription label you photographed"
          testID="scan-captured-image"
        />
      </View>

      <View className="mt-4 gap-3 pb-4">
        <Button
          label="Use this photo"
          // Object form, matching every other push in the app. It also removes the
          // need to encode the uri by hand: expo-router serialises `params`, and a
          // `file://` uri is full of slashes that would otherwise be parsed as
          // extra path segments and lose the photo.
          onPress={() =>
            router.push({
              pathname: "/(app)/add-medication",
              params: { labelUri: captured.uri },
            } as Href)
          }
          testID="scan-use-photo"
        />
        <Button label="Retake" variant="secondary" onPress={onRetake} testID="scan-retake" />
      </View>
    </View>
  );
}
