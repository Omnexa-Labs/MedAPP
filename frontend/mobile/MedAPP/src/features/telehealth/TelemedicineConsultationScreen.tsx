// Telemedicine Consultation screen — the live video-call view.
// Translated from the Stitch "Telemedicine Consultation" HTML.
//
// Entry point: WaitingRoomScreen advances here once the doctor joins
// (router.replace, so back goes to the previous page, not back into
// the waiting room).
//
// Layout: full-screen doctor video with a translucent top/bottom UI
// scaffold and a picture-in-picture patient view in the top-right.
//
// Translation rules:
//   - linear-gradient overlay (top/bottom darkening) → kept as solid
//     positioned Views with low opacity at top and bottom.
//   - backdrop-blur-md control bar → translucent dark surface with
//     white border instead. RN can't backdrop-blur cheaply.
//   - animate-pulse red dot → reanimated opacity loop.
//   - call_end → call-end. verified_user → verified-user.
//   - BottomNav suppressed (focused, immersive journey).
//   - Status bar light because the canvas is dark.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
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

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const FALLBACK = {
  doctorName: "Dr. Sterling",
  doctorVideoUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuA5JyCjdhlDhB1rwbrI8IGTqpoQlgRzDrWiKRhI4h1O4TzBGTV1vYm7HR3Wxj-BuTpSK1zI8q8cffofIbGr89ycU_M2yu00KRHB6EFmUUm6XYVg5NaqmifTk9NmPLGSr52blEXT3-v1F288wpAl8aw2a2QdIIPcaZu-3Bh0XL5DLQbrpd_OE56w9Uq5GWi5QXhx-J1gnr6kkT0zRtbs4bLYhffL5o6OkbLTAUEKnHeAk5KHkZVrr9n40K-9vPcd6NwO9qGHtylIV4Tn",
  patientVideoUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBIePICaTM6PUUbFl-s2ZwB5BgGh36gfMJAYjBNuqcOtlNjagxZVOA5LYuvzR22oH7UEiBy6qApFU-xsaXa8Tk_-RP_3tiab2X75yEOiI_nCR1mBPqrKmy6PoALYwPWPW1MU2MVgnLPtUpR9r1p7Z3PMcxEPzwpIYM1IiEbgIaFTTbAB2AtP2bI_fMEzmYXPFn24q5OqWwTCvyvACmZF6UqEkGEOS47digHltNRtm_b-yq18bUa_wwoatV55jTbW7M3yzpKV44VXr0Q",
};

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function TelemedicineConsultationScreen() {
  const params = useLocalSearchParams<{
    doctorName?: string;
    doctorSpecialty?: string;
    doctorAvatar?: string;
  }>();

  const doctor = {
    name: params.doctorName ?? FALLBACK.doctorName,
    specialty: params.doctorSpecialty ?? "",
  };

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [duration, setDuration] = useState(0); // seconds since join

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Call duration timer.
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Pulse animation on the red "LIVE" dot.
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const endCall = () => {
    // Stop the timer immediately so we don't tick while unmounting.
    if (timerRef.current) clearInterval(timerRef.current);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#171d1c" }}>
      <StatusBar style="light" />

      {/* ----------------------------------------------------------------
          Doctor full-screen video (background)
      ---------------------------------------------------------------- */}
      <Image
        source={{ uri: FALLBACK.doctorVideoUri }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        accessibilityLabel={`${doctor.name} on video call`}
      />

      {/* Top + bottom darkening overlays for UI legibility */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 180,
          backgroundColor: "rgba(23,29,28,0.55)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          backgroundColor: "rgba(23,29,28,0.6)",
        }}
      />

      <SafeAreaView
        style={{ flex: 1 }}
        edges={["top", "left", "right", "bottom"]}
      >
        {/* ----------------------------------------------------------------
            Top bar — Secure HD badge + doctor name + duration
        ---------------------------------------------------------------- */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingTop: 12,
          }}
        >
          {/* Secure HD badge */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: "rgba(0,131,120,0.4)",
              borderWidth: 1,
              borderColor: "rgba(137,245,231,0.4)",
            }}
          >
            <MaterialIcons name="verified-user" size={16} color="#89f5e7" />
            <Text
              style={{
                color: "#f4fffc",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Secure HD
            </Text>
          </View>

          {/* Doctor name + live duration */}
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                color: "#ffffff",
                fontSize: 18,
                fontWeight: "700",
                textShadowColor: "rgba(0,0,0,0.4)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
              numberOfLines={1}
            >
              {doctor.name}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <Animated.View
                style={[
                  {
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#ba1a1a",
                  },
                  pulseStyle,
                ]}
              />
              <Text
                style={{
                  color: "rgba(255,255,255,0.9)",
                  fontSize: 13,
                  fontWeight: "600",
                  letterSpacing: 0.3,
                }}
              >
                {formatTime(duration)}
              </Text>
            </View>
          </View>
        </View>

        {/* ----------------------------------------------------------------
            Patient picture-in-picture
        ---------------------------------------------------------------- */}
        <View
          style={[
            {
              position: "absolute",
              top: 80,
              right: 16,
              width: 110,
              height: 150,
              borderRadius: 14,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.35)",
            },
            pipShadow,
          ]}
        >
          {cameraOn ? (
            <Image
              source={{ uri: FALLBACK.patientVideoUri }}
              style={{ width: "100%", height: "100%" }}
              accessibilityLabel="Your camera preview"
            />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: "#1a1a1a",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="videocam-off" size={28} color="#bcc9c6" />
            </View>
          )}
          <View
            style={{
              position: "absolute",
              bottom: 6,
              left: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "rgba(0,0,0,0.5)",
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            <MaterialIcons
              name={micOn ? "mic" : "mic-off"}
              size={12}
              color="#ffffff"
            />
            <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "600" }}>
              You
            </Text>
          </View>
        </View>

        {/* ----------------------------------------------------------------
            Connection tooltip (bottom-left)
        ---------------------------------------------------------------- */}
        <View
          style={{
            position: "absolute",
            left: 16,
            bottom: 160,
          }}
        >
          <View
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 14,
                backgroundColor: "rgba(245,250,248,0.9)",
                borderWidth: 1,
                borderColor: "rgba(188,201,198,0.4)",
              },
              tooltipShadow,
            ]}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "#d8e2ff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="info" size={18} color="#0058be" />
            </View>
            <View>
              <Text style={{ color: "#171d1c", fontSize: 13, fontWeight: "600" }}>
                Stable Connection
              </Text>
              <Text style={{ color: "#3d4947", fontSize: 10 }}>
                Your latency is 15ms
              </Text>
            </View>
          </View>
        </View>

        {/* ----------------------------------------------------------------
            Call controls bottom bar
        ---------------------------------------------------------------- */}
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 10,
                borderRadius: 32,
                backgroundColor: "rgba(23,29,28,0.55)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
              },
              controlsShadow,
            ]}
          >
            <ControlButton
              icon={micOn ? "mic" : "mic-off"}
              active={micOn}
              onPress={() => setMicOn((v) => !v)}
              label={micOn ? "Mute microphone" : "Unmute microphone"}
            />
            <ControlButton
              icon={cameraOn ? "videocam" : "videocam-off"}
              active={cameraOn}
              onPress={() => setCameraOn((v) => !v)}
              label={cameraOn ? "Turn camera off" : "Turn camera on"}
            />
            <ControlButton
              icon="chat-bubble"
              active
              onPress={() => {
                // TODO: open in-call chat side panel once the messaging
                // service supports session-scoped threads.
              }}
              label="Open in-call chat"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End call"
              onPress={endCall}
              style={({ pressed }) => [
                {
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "#8b0000" : "#ba1a1a",
                },
                endCallShadow,
              ]}
            >
              <MaterialIcons name="call-end" size={30} color="#ffffff" />
            </Pressable>
          </View>

          <Text
            style={{
              marginTop: 12,
              textAlign: "center",
              color: "rgba(255,255,255,0.6)",
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 1.6,
            }}
          >
            END-TO-END ENCRYPTED
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Control button
// ---------------------------------------------------------------------------

function ControlButton({
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
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active
          ? "rgba(255,255,255,0.14)"
          : "rgba(186,26,26,0.6)",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MaterialIcons name={icon} size={26} color="#ffffff" />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

const pipShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.35)" },
    android: { elevation: 8 },
  }) || {};

const tooltipShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    web: { boxShadow: "0px 3px 10px rgba(0, 0, 0, 0.12)" },
    android: { elevation: 4 },
  }) || {};

const controlsShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    web: { boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.3)" },
    android: { elevation: 8 },
  }) || {};

const endCallShadow =
  Platform.select({
    ios: {
      shadowColor: "#ba1a1a",
      shadowOpacity: 0.4,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    web: { boxShadow: "0px 6px 14px rgba(186, 26, 26, 0.4)" },
    android: { elevation: 8 },
  }) || {};
