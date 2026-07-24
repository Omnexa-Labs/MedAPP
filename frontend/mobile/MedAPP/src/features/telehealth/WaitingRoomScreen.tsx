// Waiting Room screen — translated from the Stitch "Video Consultation"
// HTML.
//
// Entry points:
//   - HomeScreen → Upcoming Appointments → "Join Call"
//   - AppointmentManagementScreen → "Join Call" (when added)
//
// Flow: This screen simulates the patient waiting for the doctor. After
// ~6s of "Testing equipment" + "Waiting for Doctor...", the doctor "joins"
// — the CTA flips to "Join Call" and auto-navigates to
// TelemedicineConsultationScreen.
//
// BottomNav suppressed (focused journey, matches the AiAssistantScreen
// and chat-thread convention).
//
// Translation rules:
//   - bg-inverse-surface aspect-video preview → fallback Image with overlays.
//   - animate-pulse → reanimated opacity loop on the live-preview dot.
//   - bg-surface/20 backdrop-blur button → rgba(255,255,255,0.18) +
//     border, no real blur on RN.
//   - fact_check → fact-check. sensors → sensors. account_circle →
//     account-circle. wifi → wifi. check_circle → check-circle.
//   - 2-column lg layout → stacked on mobile.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useAuthStore } from "@/store/auth-store";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const FALLBACK = {
  doctorName: "Dr. Sterling",
  doctorSpecialty: "Cardiologist • 15 Years Exp.",
  doctorAvatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA3aEgB735H_y6AwCFDenAcyrPd6rLbwlJe5L5Wp1Aja40Qk_hXH0r-ipBmmZfmr0gglvvty1v1T1t1UqAZRP822tKEgeO7FQBJyN4VQjggUNP-XOCjkRQ1qZ2BFHNXBFuaKOATcTAYK5yUK4bjqxwPAw2g6WZPdiMoG-ILAY-Fv5c_9QVrPuNf8ATTDryWhSoByIfZ-qFyqHU3WSc-qA0rxbBOl83XiQXrooff_qCPm0O8jxtiF7kYX28aEGA30i5XobXzU5KGZ1WH",
  cameraPreviewUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCxF2Vxy8bsUkfO8fOIOsNhF31hOUUhzdNi0BkX-ijDB9h6fCUxp1xI5a8HSz4jl5eIcyIvamD4VRygk14QVbR0zg3CNVGYMndDw6dbwojWlEyp7XAUP9tDeeFSN3SX-e9i1hRgyJd170JLPgzsEzdn8fkxtKMTbB7Op84d5IjTz4NAH5VyT1__jrvCySC9ZKtJcyF10bL0n858pqU1qeY-99hF9ezBptv5ADxVf0EUK-aTAW6wvllA2BnNs-OVbtRw1K6VrB_Y_6T8",
};

// How long to simulate the "Doctor is preparing" wait before flipping the
// CTA. Kept short for demo realism.
const DOCTOR_JOIN_DELAY_MS = 6000;

export function WaitingRoomScreen() {
  const params = useLocalSearchParams<{
    doctorName?: string;
    doctorSpecialty?: string;
    doctorAvatar?: string;
  }>();

  const user = useAuthStore((s) => s.user);
  const patientFirstName = user?.displayName?.trim().split(/\s+/)[0] || "you";

  const doctor = {
    name: params.doctorName ?? FALLBACK.doctorName,
    specialty: params.doctorSpecialty ?? FALLBACK.doctorSpecialty,
    avatar: params.doctorAvatar ?? FALLBACK.doctorAvatar,
  };

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [doctorReady, setDoctorReady] = useState(false);

  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pulse animation on the "Live Preview" dot.
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Simulate the doctor joining the call.
  useEffect(() => {
    joinTimer.current = setTimeout(() => {
      setDoctorReady(true);
    }, DOCTOR_JOIN_DELAY_MS);
    return () => {
      if (joinTimer.current) clearTimeout(joinTimer.current);
    };
  }, []);

  const joinCall = () => {
    if (!doctorReady) return;
    router.replace({
      // Route added this iteration — typedRoutes regenerates on dev server start.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: "/(app)/telemedicine-consultation" as any,
      params: {
        doctorName: doctor.name,
        doctorSpecialty: doctor.specialty,
        doctorAvatar: doctor.avatar,
      },
    });
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right", "bottom"]}>
        {/* App bar */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leave waiting room"
              hitSlop={8}
              onPress={() => router.back()}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="arrow-back" size={24} color="#00685f" />
            </Pressable>
            <Text className="font-headline-md text-headline-md text-primary">
              MedApp
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="more-vert" size={22} color="#00685f" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 24,
            paddingBottom: 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <View className="mb-md items-center">
            <Text
              className="text-on-surface text-center"
              style={{
                fontSize: 28,
                fontWeight: "700",
                letterSpacing: -0.3,
                marginBottom: 6,
              }}
            >
              Video Consultation
            </Text>
            <Text
              className="font-body-md text-on-surface-variant text-center"
              style={{ fontSize: 15 }}
            >
              {doctor.name} will join you shortly
            </Text>
          </View>

          {/* ------------------------------------------------------------
              Camera preview
          ------------------------------------------------------------ */}
          <View
            className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest"
            style={cardShadow}
          >
            <View
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: 16 / 9,
                backgroundColor: "#2c3130",
              }}
            >
              {cameraOn ? (
                <Image
                  source={{ uri: FALLBACK.cameraPreviewUri }}
                  style={{ width: "100%", height: "100%", opacity: 0.85 }}
                  accessibilityLabel="Camera preview"
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <MaterialIcons name="videocam-off" size={48} color="#bcc9c6" />
                  <Text style={{ color: "#bcc9c6", fontSize: 13 }}>
                    Camera is off
                  </Text>
                </View>
              )}

              {/* Live Preview badge */}
              <View
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: "rgba(0,131,120,0.85)",
                }}
              >
                <Animated.View
                  style={[
                    {
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#89f5e7",
                    },
                    pulseStyle,
                  ]}
                />
                <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "700" }}>
                  Live Preview
                </Text>
              </View>

              {/* Camera controls */}
              <View
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 0,
                  right: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <CamControl
                  icon={micOn ? "mic" : "mic-off"}
                  active={micOn}
                  onPress={() => setMicOn((v) => !v)}
                  label={micOn ? "Mute microphone" : "Unmute microphone"}
                />
                <CamControl
                  icon={cameraOn ? "videocam" : "videocam-off"}
                  active={cameraOn}
                  onPress={() => setCameraOn((v) => !v)}
                  label={cameraOn ? "Turn camera off" : "Turn camera on"}
                />
                <CamControl
                  icon="settings"
                  active
                  onPress={() => {
                    // TODO: open device selection sheet.
                  }}
                  label="Device settings"
                />
              </View>
            </View>

            <View
              className="flex-row items-center justify-between bg-surface-container-low p-md"
            >
              <View className="flex-row items-center gap-sm">
                <MaterialIcons name="account-circle" size={22} color="#00685f" />
                <Text
                  className="font-label-md text-on-surface"
                  numberOfLines={1}
                >
                  {patientFirstName} (You)
                </Text>
              </View>
              <Text
                className="font-label-sm text-on-surface-variant"
                style={{ fontStyle: "italic" }}
              >
                {doctorReady ? "Doctor ready" : "Testing equipment…"}
              </Text>
            </View>
          </View>

          {/* ------------------------------------------------------------
              Hardware check
          ------------------------------------------------------------ */}
          <View
            className="mt-md rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
            style={cardShadow}
          >
            <View className="mb-md flex-row items-center gap-xs">
              <MaterialIcons name="fact-check" size={20} color="#00685f" />
              <Text
                className="text-on-surface"
                style={{ fontSize: 16, fontWeight: "700" }}
              >
                Hardware Check
              </Text>
            </View>
            <View className="gap-sm">
              <HardwareItem icon="mic" label="Microphone" ok={micOn} />
              <HardwareItem icon="videocam" label="Camera" ok={cameraOn} />
              <HardwareItem icon="wifi" label="Connection" ok />
            </View>
          </View>

          {/* ------------------------------------------------------------
              Doctor info card
          ------------------------------------------------------------ */}
          <View
            className="mt-md rounded-xl p-md"
            style={{ backgroundColor: "#008378" }}
          >
            <View className="flex-row items-center gap-md">
              <Image
                source={{ uri: doctor.avatar }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.3)",
                }}
                accessibilityLabel={doctor.name}
              />
              <View className="flex-1">
                <Text
                  style={{
                    color: "#f4fffc",
                    fontSize: 18,
                    fontWeight: "700",
                    lineHeight: 22,
                  }}
                  numberOfLines={1}
                >
                  {doctor.name}
                </Text>
                <Text
                  style={{
                    color: "rgba(244,255,252,0.9)",
                    fontSize: 13,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {doctor.specialty}
                </Text>
              </View>
            </View>
            <View
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                backgroundColor: "rgba(244,255,252,0.12)",
              }}
            >
              <Text
                style={{
                  color: "#f4fffc",
                  fontSize: 13,
                  lineHeight: 19,
                  fontStyle: "italic",
                }}
              >
                {doctorReady
                  ? `"Hi ${patientFirstName}, I'm ready when you are. Tap Join Call to start the consultation."`
                  : `"Hello ${patientFirstName}! I'm just finishing up with another patient. I'll be with you in about 2 minutes."`}
              </Text>
            </View>
          </View>

          {/* ------------------------------------------------------------
              Action button
          ------------------------------------------------------------ */}
          <View className="mt-lg">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                doctorReady ? "Join call" : "Waiting for doctor"
              }
              accessibilityState={{ disabled: !doctorReady }}
              onPress={joinCall}
              disabled={!doctorReady}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  paddingVertical: 16,
                  borderRadius: 12,
                  backgroundColor: !doctorReady
                    ? "#bcc9c6"
                    : pressed
                      ? "#004d46"
                      : "#00685f",
                },
                doctorReady ? joinShadow : undefined,
              ]}
            >
              <MaterialIcons
                name={doctorReady ? "videocam" : "sensors"}
                size={22}
                color="#ffffff"
              />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#ffffff" }}>
                {doctorReady ? "Join Call" : "Waiting for Doctor…"}
              </Text>
            </Pressable>
            <Text
              className="font-label-sm text-on-surface-variant mt-sm text-center"
            >
              {doctorReady
                ? "Tap to start your consultation"
                : "The Join Call button will enable automatically"}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function CamControl({
  icon,
  active,
  onPress,
  label,
}: {
  icon: IconName;
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active
          ? "rgba(255,255,255,0.18)"
          : "rgba(186,26,26,0.65)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.25)",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <MaterialIcons name={icon} size={22} color="#ffffff" />
    </Pressable>
  );
}

function HardwareItem({
  icon,
  label,
  ok,
}: {
  icon: IconName;
  label: string;
  ok: boolean;
}) {
  return (
    <View
      className="flex-row items-center justify-between rounded-lg border border-outline-variant/20 bg-surface-container-low p-sm"
    >
      <View className="flex-row items-center gap-sm">
        <MaterialIcons name={icon} size={20} color="#00685f" />
        <Text className="font-body-md text-on-surface">{label}</Text>
      </View>
      <MaterialIcons
        name={ok ? "check-circle" : "error"}
        size={20}
        color={ok ? "#00685f" : "#ba1a1a"}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

const appBarShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    web: { boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.04)" },
    android: { elevation: 3 },
  }) || {};

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.05,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 3 },
  }) || {};

const joinShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    web: { boxShadow: "0px 6px 14px rgba(0, 104, 95, 0.3)" },
    android: { elevation: 6 },
  }) || {};
