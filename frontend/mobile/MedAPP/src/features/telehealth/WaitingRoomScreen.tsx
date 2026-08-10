import { useMemo, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, DockedActionBar, InfoCallout } from "@/components/ui";
import {
  ConnectionStatus,
  HardwareCheckRow,
  LeaveCallDialog,
  MediaControl,
  ProviderIdentity,
  VideoParticipant,
} from "./components";
import { parseTelehealthSessionParams, type TelehealthRouteParams } from "./session";
import { useAuthStore } from "@/store/auth-store";

type WaitingState = "waiting" | "ready" | "permissions-blocked" | "offline";

type RawParams = TelehealthRouteParams & {
  state?: WaitingState;
  remoteReady?: string;
  doctorName?: string;
  doctorSpecialty?: string;
  doctorAvatar?: string;
};

const JULIAN = {
  id: "julian-sterling",
  name: "Dr. Julian Sterling",
  specialty: "Cardiologist",
};

function initialsFor(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function WaitingRoomScreen() {
  const raw = useLocalSearchParams() as RawParams;
  const user = useAuthStore((store) => store.user);
  const session = useMemo(
    () =>
      parseTelehealthSessionParams({
        ...raw,
        providerId: raw.providerId ?? JULIAN.id,
        providerName: raw.providerName ?? raw.doctorName ?? JULIAN.name,
        providerSpecialty:
          raw.providerSpecialty ?? raw.doctorSpecialty ?? JULIAN.specialty,
        providerAvatar: raw.providerAvatar ?? raw.doctorAvatar,
        patientId: raw.patientId ?? user?.id ?? "current-patient",
        patientName: raw.patientName ?? user?.displayName ?? "Patient",
      }),
    [raw, user?.displayName, user?.id],
  );

  const initialState: WaitingState =
    raw.state === "permissions-blocked" || raw.state === "offline"
      ? raw.state
      : raw.remoteReady === "true" || raw.state === "ready"
        ? "ready"
        : "waiting";
  const [state, setState] = useState<WaitingState>(initialState);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const patientView = session.viewerRole === "patient";
  const remoteName = patientView ? session.providerName : session.patientName;
  const localName = patientView ? session.patientName : session.providerName;
  const localAvatar = patientView ? session.patientAvatar : session.providerAvatar;
  const waitingLabel = patientView ? "Waiting for provider" : "Waiting for patient";

  const join = () => {
    if (state !== "ready") return;
    router.replace({
      pathname: "/(app)/telemedicine-consultation",
      params: {
        ...session,
        viewerRole: session.viewerRole,
      },
    } as unknown as Href);
  };

  const leave = () => {
    setLeaveOpen(false);
    router.back();
  };

  return (
    <DetailShell
      title="Waiting room"
      backAccessibilityLabel="Leave waiting room"
      onBack={() => setLeaveOpen(true)}
      claimsBottomInset={false}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: 124,
          gap: 12,
        }}
      >
        <View className="gap-1">
          <Text className="font-headline-lg text-headline-lg text-on-surface">
            {state === "ready"
              ? patientView
                ? "Your provider is ready"
                : "Your patient is ready"
              : state === "permissions-blocked"
                ? "Allow device access"
                : state === "offline"
                  ? "Can’t open this visit"
                  : patientView
                    ? "Check your setup"
                    : `Waiting for ${session.patientName ?? "patient"}`}
          </Text>
          <Text className="font-body-md text-body-md text-on-surface-variant">
            {state === "ready"
              ? "Join now to begin the scheduled video visit."
              : `You’ll join when ${remoteName ?? "the other participant"} is ready.`}
          </Text>
        </View>

        {patientView ? (
          <Card className="p-4">
            <ProviderIdentity
              name={session.providerName ?? JULIAN.name}
              specialty={session.providerSpecialty ?? JULIAN.specialty}
              supportingText="Available for video visits"
              avatarUri={session.providerAvatar}
              initials={initialsFor(session.providerName ?? JULIAN.name)}
            />
          </Card>
        ) : (
          <Card className="p-4">
            <ProviderIdentity
              name={session.patientName ?? "Patient"}
              specialty="Scheduled video visit"
              avatarUri={session.patientAvatar}
              initials={initialsFor(session.patientName ?? "Patient")}
            />
          </Card>
        )}

        {state !== "offline" ? (
          <VideoParticipant
            name={localName ?? "You"}
            avatarUri={localAvatar}
            initials={initialsFor(localName ?? "You")}
            cameraOn={cameraOn}
            microphoneOn={microphoneOn}
            local
            compact
            className="h-[152px] w-28 self-center"
          />
        ) : null}

        {state === "permissions-blocked" ? (
          <InfoCallout tone="error">
            <View className="gap-3">
              <Text className="font-body-md text-body-md text-on-error-container">
                Microphone and camera permission is required before joining.
              </Text>
              <Button
                label="Open settings"
                variant="outline"
                size="md"
                pill={false}
                shadow={false}
                onPress={() => void Linking.openSettings()}
              />
            </View>
          </InfoCallout>
        ) : state === "offline" ? (
          <>
            <ConnectionStatus
              tone="offline"
              title="Session unavailable"
              detail="Reconnect, then try again. No visit details were changed."
            />
            <Button
              label="Try again"
              variant="outline"
              size="docked"
              pill={false}
              shadow={false}
              onPress={() => setState("waiting")}
            />
          </>
        ) : (
          <Card className="gap-1 p-3">
            <HardwareCheckRow
              kind="microphone"
              label="Microphone"
              status={microphoneOn ? "ready" : "off"}
            />
            <HardwareCheckRow
              kind="camera"
              label="Camera"
              status={cameraOn ? "ready" : "off"}
            />
            <HardwareCheckRow kind="connection" label="Connection" status="ready" />
          </Card>
        )}

        {state !== "offline" ? (
          <View
            accessibilityRole="toolbar"
            accessibilityLabel="Device controls"
            className="flex-row items-center justify-center gap-4"
          >
            <MediaControl
              kind="microphone"
              active={microphoneOn}
              label={microphoneOn ? "Mute microphone" : "Unmute microphone"}
              onPress={() => setMicrophoneOn((value) => !value)}
            />
            <MediaControl
              kind="camera"
              active={cameraOn}
              label={cameraOn ? "Turn camera off" : "Turn camera on"}
              onPress={() => setCameraOn((value) => !value)}
            />
            <MediaControl
              kind="settings"
              label="Device settings"
              onPress={() => void Linking.openSettings()}
            />
          </View>
        ) : null}
      </ScrollView>

      <DockedActionBar
        primary={{
          label: state === "ready" ? "Join video visit" : state === "offline" ? "Try again" : waitingLabel,
          disabled: state !== "ready" && state !== "offline",
          onPress: state === "offline" ? () => setState("waiting") : join,
        }}
        testID="waiting-room-action"
      />

      <LeaveCallDialog
        visible={leaveOpen}
        mode="waiting-room"
        participantName={remoteName}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={leave}
      />
    </DetailShell>
  );
}
