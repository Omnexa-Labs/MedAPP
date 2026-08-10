import { useEffect, useMemo, useState } from "react";
import { BackHandler, Linking, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, InfoCallout } from "@/components/ui";
import { useResolvedScheme } from "@/lib/theme";
import {
  CallControlsBar,
  ConnectionStatus,
  LeaveCallDialog,
  VideoParticipant,
} from "./components";
import { parseTelehealthSessionParams, type TelehealthRouteParams } from "./session";

type CallState = "active" | "reconnecting" | "failed";
type RawParams = TelehealthRouteParams & {
  state?: CallState;
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

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, "0")}:${(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function TelemedicineConsultationScreen() {
  const raw = useLocalSearchParams() as RawParams;
  const { scheme } = useResolvedScheme();
  const session = useMemo(
    () =>
      parseTelehealthSessionParams({
        ...raw,
        providerId: raw.providerId ?? JULIAN.id,
        providerName: raw.providerName ?? raw.doctorName ?? JULIAN.name,
        providerSpecialty:
          raw.providerSpecialty ?? raw.doctorSpecialty ?? JULIAN.specialty,
        providerAvatar: raw.providerAvatar ?? raw.doctorAvatar,
      }),
    [raw],
  );

  const patientView = session.viewerRole === "patient";
  const remoteName =
    (patientView ? session.providerName : session.patientName) ??
    (patientView ? JULIAN.name : "Patient");
  const remoteAvatar = patientView ? session.providerAvatar : session.patientAvatar;
  const localName =
    (patientView ? session.patientName : session.providerName) ??
    (patientView ? "Patient" : JULIAN.name);
  const localAvatar = patientView ? session.patientAvatar : session.providerAvatar;

  const [callState, setCallState] = useState<CallState>(
    raw.state === "reconnecting" || raw.state === "failed" ? raw.state : "active",
  );
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [endOpen, setEndOpen] = useState(false);

  useEffect(() => {
    if (callState === "failed") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setEndOpen(true);
      return true;
    });
    return () => subscription.remove();
  }, []);

  const endCall = () => {
    setEndOpen(false);
    router.back();
  };

  if (callState === "failed") {
    return (
      <View className="flex-1 bg-background">
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <SafeAreaView className="flex-1 px-4" edges={["top", "left", "right", "bottom"]}>
          <View className="flex-row items-center justify-between py-5">
            <View>
              <Text className="font-label-md text-label-md text-on-surface">
                Video consultation
              </Text>
              <Text className="font-label-sm text-label-sm text-on-surface-variant">—</Text>
            </View>
          </View>
          <View className="flex-1 items-center justify-center">
            <Card className="w-full gap-4">
              <InfoCallout tone="error">
                The call ended unexpectedly. Check your connection and try again.
              </InfoCallout>
              <Button
                label="Try again"
                size="docked"
                pill={false}
                shadow={false}
                onPress={() => setCallState("reconnecting")}
              />
              <Button
                label="Leave visit"
                variant="outline"
                size="docked"
                pill={false}
                shadow={false}
                onPress={endCall}
              />
            </Card>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <SafeAreaView className="flex-1 px-6" edges={["top", "left", "right", "bottom"]}>
        <View className="h-16 flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <Text
              className="font-label-md text-label-md text-on-surface"
              numberOfLines={1}
            >
              {remoteName}
            </Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              Video consultation
            </Text>
          </View>
          <Text
            accessibilityLabel="Call duration"
            accessible={false}
            className="font-label-md text-label-md text-on-surface"
          >
            {formatDuration(seconds)}
          </Text>
        </View>

        <View className="relative">
          <VideoParticipant
            name={remoteName}
            avatarUri={remoteAvatar}
            initials={initialsFor(remoteName)}
            cameraOn
            microphoneOn
            className="h-[360px] w-full"
          />
          <VideoParticipant
            name={localName}
            avatarUri={localAvatar}
            initials={initialsFor(localName)}
            cameraOn={cameraOn}
            microphoneOn={microphoneOn}
            local
            compact
            className="absolute bottom-3 right-0 h-[152px] w-28"
          />
        </View>

        <View className="mt-3 gap-2">
          <ConnectionStatus
            compact
            tone={callState === "reconnecting" ? "reconnecting" : "connected"}
            title={
              callState === "reconnecting"
                ? "Reconnecting…"
                : "Connection available"
            }
          />
          <Card className="gap-1 p-3">
            <Text className="font-label-md text-label-md text-on-surface">
              {callState === "reconnecting" ? "Keep this screen open" : "During your visit"}
            </Text>
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              {callState === "reconnecting"
                ? "Call controls remain available while MedApp restores the connection."
                : "Use the controls below to change your microphone, camera, or device settings."}
            </Text>
          </Card>
        </View>

        <View className="flex-1" />
        <CallControlsBar
          microphoneOn={microphoneOn}
          cameraOn={cameraOn}
          onToggleMicrophone={() => setMicrophoneOn((value) => !value)}
          onToggleCamera={() => setCameraOn((value) => !value)}
          onOpenSettings={() => void Linking.openSettings()}
          onEndCall={() => setEndOpen(true)}
          className="mb-2"
        />
      </SafeAreaView>

      <LeaveCallDialog
        visible={endOpen}
        mode="active-call"
        participantName={remoteName}
        onCancel={() => setEndOpen(false)}
        onConfirm={endCall}
      />
    </View>
  );
}
