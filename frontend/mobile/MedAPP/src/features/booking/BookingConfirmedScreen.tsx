// Booking Confirmed (success / splash) screen — translated from the
// Stitch "Booking Confirmed" HTML.
//
// Entry point: ReviewAppointment → "Confirm Booking"
//
// Per the comp: BottomNav suppressed (focused success splash). The header
// uses a "close" affordance (not a back arrow) since this is the terminal
// step of the booking flow — tapping close returns the user to Home, NOT
// back to Review, so they can't re-confirm. Standard iOS / Android success
// convention.
//
// Translation rules:
//   - bg-gradient-to-bl corner → solid colored View placed absolutely.
//   - check_circle hero → check-circle icon, sized 48 in a 96-circle.
//   - video_chat → video-call (closest equivalent in MaterialIcons).
//   - calendar_today → calendar-today.
//   - event_available → event-available (for "Add to Calendar").
//   - list_alt → list-alt (for "View My Appointments").
//   - share → ios-share (the platform-agnostic share icon).
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding expo-* APIs.

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
import { router, useLocalSearchParams, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

const FALLBACK = {
  practitionerName: "Dr. Sarah Jenkins",
  practitionerSpecialty: "Senior Cardiologist",
  practitionerAvatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBY0HJu9pclri3oxwL_s4FE5tEf3lzQMD37ejrTkRzvXtQ8mhAvPdb5tj8oZ8SGGGSW1N_zMsEz3ztpdqOjnz2trJqlzRRZkkNKEbSa2zRV3Yt0xpr9RZBXFLEbQIEH5wDzJ2y1v1p5OHWC7m1un8ls5PG3Gjci_lP1om6nj9dIptXOuKeRYJEye9_XFqz2OvPiAubVT-boQ1wKZK4owZBQ2yPBIU6RKDuCryTkV9e_V0sbN-aciOCLw5_l-Fz01jY1KdlcQ6KHCVIM",
};

export function BookingConfirmedScreen() {
  const params = useLocalSearchParams<{
    practitionerName?: string;
    practitionerSpecialty?: string;
    practitionerAvatar?: string;
    date?: string;
    time?: string;
    type?: string;
  }>();

  const appt = {
    practitionerName: params.practitionerName ?? FALLBACK.practitionerName,
    practitionerSpecialty:
      params.practitionerSpecialty ?? FALLBACK.practitionerSpecialty,
    practitionerAvatar:
      params.practitionerAvatar ?? FALLBACK.practitionerAvatar,
    date: params.date ?? "Tuesday, Oct 24, 2023",
    time: params.time ?? "10:30 AM — 11:00 AM",
    type: params.type ?? "Video Call",
  };

  const close = () => router.replace("/(app)" as Href);
  const goToAppointments = () =>
    router.replace("/(app)/appointments" as Href);
  const addToCalendar = () => {
    // TODO: hook into expo-calendar when ready. For now, advance to
    // the appointments screen since calendar permissions need a separate
    // permission flow.
    goToAppointments();
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
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={close}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="close" size={24} color="#00685f" />
            </Pressable>
            <Text
              className="font-headline-md text-primary"
              style={{ fontSize: 18, fontWeight: "700" }}
            >
              Booking Confirmed
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share appointment"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="ios-share" size={22} color="#00685f" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 32,
            alignItems: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ------------------------------------------------------------
              Success hero
          ------------------------------------------------------------ */}
          <View
            style={[
              {
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: "#008378",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
              },
              heroShadow,
            ]}
          >
            <MaterialIcons name="check-circle" size={56} color="#ffffff" />
          </View>
          <Text
            className="text-on-surface mb-xs text-center"
            style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.2 }}
          >
            Appointment Confirmed!
          </Text>
          <Text
            className="font-body-md text-on-surface-variant text-center"
            style={{ maxWidth: 280, lineHeight: 22 }}
          >
            Your video consultation has been successfully scheduled.
          </Text>

          {/* ------------------------------------------------------------
              Appointment detail card
          ------------------------------------------------------------ */}
          <View
            className="mt-lg w-full overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
            style={cardShadow}
          >
            {/* Decorative corner accent */}
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 96,
                height: 96,
                backgroundColor: "rgba(137,245,231,0.25)",
                borderBottomLeftRadius: 96,
              }}
              pointerEvents="none"
            />

            <View className="mb-md flex-row items-center gap-md">
              <Image
                source={{ uri: appt.practitionerAvatar }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  borderWidth: 2,
                  borderColor: "#008378",
                }}
                accessibilityLabel={appt.practitionerName}
              />
              <View className="flex-1">
                <Text
                  className="text-on-surface"
                  style={{ fontSize: 17, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {appt.practitionerName}
                </Text>
                <Text
                  className="font-label-md text-primary mt-xs"
                  numberOfLines={1}
                >
                  {appt.practitionerSpecialty}
                </Text>
              </View>
            </View>

            <View className="h-px w-full bg-outline-variant/20 mb-md" />

            <View className="gap-md">
              <View className="flex-row items-start gap-md">
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: "#d5e3fc",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="calendar-today" size={20} color="#515f74" />
                </View>
                <View className="flex-1">
                  <Text
                    className="font-label-sm text-on-surface-variant mb-xs"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      fontSize: 11,
                    }}
                  >
                    Date & Time
                  </Text>
                  <Text
                    className="font-body-md text-on-surface"
                    style={{ fontWeight: "600", fontSize: 15 }}
                  >
                    {appt.date}
                  </Text>
                  <Text
                    className="font-body-md text-on-surface-variant"
                    style={{ fontSize: 14 }}
                  >
                    {appt.time}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-start gap-md">
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: "#d8e2ff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name="video-call" size={22} color="#0058be" />
                </View>
                <View className="flex-1">
                  <Text
                    className="font-label-sm text-on-surface-variant mb-xs"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      fontSize: 11,
                    }}
                  >
                    Consultation Type
                  </Text>
                  <View className="flex-row items-center gap-xs">
                    <Text
                      className="font-body-md text-on-surface"
                      style={{ fontWeight: "600", fontSize: 15 }}
                    >
                      {appt.type}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: "#89f5e7",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: "#005049",
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                        }}
                      >
                        Remote
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------------------
              Preparation checklist
          ------------------------------------------------------------ */}
          <View
            className="mt-lg w-full rounded-xl border border-outline-variant/20 bg-surface-container-low p-md"
          >
            <View className="mb-sm flex-row items-center gap-xs">
              <MaterialIcons name="lightbulb" size={18} color="#0058be" />
              <Text
                className="font-label-md text-on-surface"
                style={{ fontWeight: "600" }}
              >
                Before your appointment
              </Text>
            </View>
            <View className="gap-sm">
              <ChecklistItem text="Test your microphone and camera" />
              <ChecklistItem text="Join the link 5 minutes before start" />
            </View>
          </View>

          {/* ------------------------------------------------------------
              Action buttons
          ------------------------------------------------------------ */}
          <View className="mt-xl w-full gap-md">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to calendar"
              onPress={addToCalendar}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: pressed ? "#004d46" : "#00685f",
                },
                actionShadow,
              ]}
            >
              <MaterialIcons name="event-available" size={22} color="#ffffff" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#ffffff" }}>
                Add to Calendar
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View my appointments"
              onPress={goToAppointments}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                height: 56,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: "#00685f",
                backgroundColor: pressed ? "rgba(0,104,95,0.08)" : "#f5faf8",
              })}
            >
              <MaterialIcons name="list-alt" size={22} color="#00685f" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#00685f" }}>
                View My Appointments
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-sm">
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: "rgba(0,104,95,0.12)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name="check" size={14} color="#00685f" />
      </View>
      <Text className="font-label-md text-on-surface-variant" style={{ fontSize: 14 }}>
        {text}
      </Text>
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

const heroShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.25,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    web: { boxShadow: "0px 10px 30px rgba(0, 106, 97, 0.25)" },
    android: { elevation: 6 },
  }) || {};

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 20px rgba(71, 85, 105, 0.06)" },
    android: { elevation: 3 },
  }) || {};

const actionShadow =
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
