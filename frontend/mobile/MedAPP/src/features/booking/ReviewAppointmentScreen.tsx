// Review Appointment screen — translated from the Stitch "Review
// Appointment" HTML.
//
// Entry point: SelectTimeSlotScreen → "Book Now"
//
// Per the user spec this screen offers three affordances:
//   - Confirm Booking → BookingConfirmedScreen
//   - Cancel         → router.back() to SelectTimeSlot, no state changes
//   - Edit           → router.back() so the user can adjust slot/type/reason
//
// Translation rules:
//   - backdrop-blur sticky header → opaque bg-surface/80 + border + shadow.
//   - 2-col md:grid sections (Time & Schedule + Service Details) →
//     stacked single column on mobile (we don't have md+ widths).
//   - Map image + location chip → kept; tapping "Get Directions" stubs
//     to a Linking.openURL once we have a real address. Currently a noop.
//   - "Secure encrypted checkout" footer note preserved beneath CTA.
//   - BottomNav suppressed (transactional journey, matches SelectTimeSlot).
//   - history_edu → history (closest). calendar_today → calendar-today.
//   - schedule → schedule.
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
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Defaults — used only when no params were passed by the previous screen.
// ---------------------------------------------------------------------------

const FALLBACK = {
  practitionerName: "Dr. Julian Sterling",
  practitionerSpecialty: "Senior Cardiologist",
  practitionerAvatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAiCdPvTk5RydHAjrMHk72Eu7sJRi3EI57s2zitwSnJw6fR-Ha-75XWdA2MjoxR9CgW1wk4Y8yWmBM9J3gwdHmLwACfEvc95ECOnqZEK6DpOt3Oo7QykCYlrP8rJJWJufV5bAB3vX_s7TNJHzOGgSULtrFO6uXN_V3vctBselslwyizvCrqX9Nt3f-WdJe5uLMji_TUyIxJIg3P9U5o7jTAfkBlf9jQB3IC9HNo2nT-65KTN6CRo5NF1wubrcTf-0jyGZE5avuAlAfI",
  facility: "Mayo Clinic",
  address: "200 First St SW, Rochester, MN 55905",
  mapUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBCOTvYsWV2PFO0EtmEWCfHutvCkwuSh5d8aUo1P0HPth1GgB-5Wo3rQNnjqVyuY6lsIvYBM-t0uaYle-DYA6zc4o-b6RK1nTuOAhL_BwE4b0aeuUtAwI3znBb4wG5m9N-jiut88YG49JLwik87wzlxiJ1Ril6E6SL8KCfWig9-XBeDz0lpccIi1ksW5hMU7iPmwadTOpw7Bz2Xnvp2lUIrnrBT0FwLu0qRiLQOFFJuY6eScX-ADTfJILoi0_T8Ii5YNw7ODwaOakto",
  duration: "45 Minutes",
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function ReviewAppointmentScreen() {
  const params = useLocalSearchParams<{
    practitionerName?: string;
    practitionerSpecialty?: string;
    practitionerAvatar?: string;
    date?: string;
    time?: string;
    type?: string;
    reason?: string;
  }>();

  const appt = {
    practitionerName: params.practitionerName ?? FALLBACK.practitionerName,
    practitionerSpecialty:
      params.practitionerSpecialty ?? FALLBACK.practitionerSpecialty,
    practitionerAvatar: params.practitionerAvatar ?? FALLBACK.practitionerAvatar,
    date: params.date ?? "Tuesday, Oct 24, 2023",
    time: params.time ?? "10:30 AM",
    type: params.type ?? "Standard Consultation",
    reason: params.reason ?? "",
  };

  const confirm = () => {
    router.replace({
      // Route added this iteration — typedRoutes regenerates on dev server start.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: "/(app)/booking-confirmed" as any,
      params: {
        practitionerName: appt.practitionerName,
        practitionerSpecialty: appt.practitionerSpecialty,
        practitionerAvatar: appt.practitionerAvatar,
        date: appt.date,
        time: appt.time,
        type: appt.type,
      },
    });
  };

  const edit = () => router.back();
  const cancel = () => router.back();

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* App bar */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-1 flex-row items-center gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="arrow-back" size={24} color="#00685f" />
            </Pressable>
            <Text
              className="font-headline-md text-primary"
              style={{ fontSize: 18, fontWeight: "700" }}
              numberOfLines={1}
            >
              Review Appointment
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
            className="rounded-full p-sm active:scale-95"
          >
            <MaterialIcons name="notifications" size={24} color="#00685f" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ------------------------------------------------------------
              Specialist card
          ------------------------------------------------------------ */}
          <View
            className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
            style={cardShadow}
          >
            <View className="flex-row items-center gap-md">
              <View className="relative">
                <Image
                  source={{ uri: appt.practitionerAvatar }}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: "rgba(0,104,95,0.15)",
                  }}
                  accessibilityLabel={appt.practitionerName}
                />
                <View
                  className="absolute items-center justify-center rounded-full bg-primary"
                  style={{
                    bottom: -6,
                    right: -6,
                    padding: 3,
                    borderWidth: 2,
                    borderColor: "#ffffff",
                  }}
                >
                  <MaterialIcons name="check-circle" size={16} color="#ffffff" />
                </View>
              </View>
              <View className="flex-1">
                <View className="mb-xs flex-row flex-wrap gap-xs">
                  <TagPill label="Cardiology" tone="primary" />
                  <TagPill label="Top Rated" tone="tertiary" />
                </View>
                <Text
                  className="text-primary"
                  style={{ fontSize: 19, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {appt.practitionerName}
                </Text>
                <Text
                  className="font-body-md text-on-surface-variant"
                  numberOfLines={1}
                  style={{ fontSize: 13 }}
                >
                  {appt.practitionerSpecialty} • Mayo Clinic
                </Text>
                <View className="mt-xs flex-row items-center gap-xs">
                  <MaterialIcons name="star" size={16} color="#00685f" />
                  <Text
                    className="font-label-md text-on-surface"
                    style={{ fontWeight: "700" }}
                  >
                    4.9
                  </Text>
                  <Text className="font-label-sm text-outline">(1,240 Reviews)</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------------------
              Time & Schedule
          ------------------------------------------------------------ */}
          <SectionCard title="Time & Schedule" className="mt-md">
            <DetailRow
              icon="calendar-today"
              iconBg="rgba(0,131,120,0.12)"
              iconColor="#00685f"
              label="Date"
              value={appt.date}
            />
            <DetailRow
              icon="schedule"
              iconBg="rgba(0,131,120,0.12)"
              iconColor="#00685f"
              label="Time"
              value={`${appt.time} (Local time)`}
            />
          </SectionCard>

          {/* ------------------------------------------------------------
              Service details
          ------------------------------------------------------------ */}
          <SectionCard title="Service Details" className="mt-md">
            <DetailRow
              icon="medical-services"
              iconBg="rgba(33,112,228,0.12)"
              iconColor="#0058be"
              label="Type"
              value={appt.type}
            />
            <DetailRow
              icon="history"
              iconBg="rgba(33,112,228,0.12)"
              iconColor="#0058be"
              label="Duration"
              value={FALLBACK.duration}
            />
            {appt.reason ? (
              <DetailRow
                icon="note"
                iconBg="rgba(33,112,228,0.12)"
                iconColor="#0058be"
                label="Reason"
                value={appt.reason}
              />
            ) : null}
          </SectionCard>

          {/* ------------------------------------------------------------
              Location
          ------------------------------------------------------------ */}
          <View
            className="mt-md overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest"
            style={cardShadow}
          >
            <View className="p-md">
              <Text
                className="font-label-md text-outline mb-xs"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                  fontSize: 11,
                }}
              >
                Location
              </Text>
              <Text
                className="font-headline-md text-on-surface"
                style={{ fontSize: 18, fontWeight: "700" }}
              >
                {FALLBACK.facility}
              </Text>
              <Text
                className="font-body-md text-on-surface-variant mt-xs"
                style={{ fontSize: 14 }}
              >
                {FALLBACK.address}
              </Text>
            </View>
            <View style={{ position: "relative", height: 160, width: "100%" }}>
              <Image
                source={{ uri: FALLBACK.mapUri }}
                style={{ width: "100%", height: "100%" }}
                accessibilityLabel="Map of clinic"
              />
              <View
                style={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={[
                    {
                      backgroundColor: "#ffffff",
                      padding: 10,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: "#00685f",
                    },
                    pinShadow,
                  ]}
                >
                  <MaterialIcons name="location-on" size={28} color="#00685f" />
                </View>
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 12,
                  right: 12,
                  backgroundColor: "rgba(245, 250, 248, 0.92)",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.4)",
                }}
              >
                <MaterialIcons name="directions" size={16} color="#00685f" />
                <Text
                  className="font-label-md text-on-surface"
                  style={{ fontSize: 13, fontWeight: "600" }}
                >
                  Get Directions
                </Text>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------------------
              Cancellation policy info
          ------------------------------------------------------------ */}
          <View
            className="mt-md flex-row gap-sm rounded-xl border p-sm"
            style={{
              backgroundColor: "rgba(0,88,190,0.05)",
              borderColor: "rgba(0,88,190,0.15)",
            }}
          >
            <MaterialIcons name="info" size={20} color="#0058be" />
            <Text
              className="text-on-secondary-container flex-1"
              style={{ fontSize: 13, lineHeight: 19 }}
            >
              Free cancellation until 24 hours before the appointment. After
              that, a $10 processing fee may apply.
            </Text>
          </View>

          {/* ------------------------------------------------------------
              Action buttons
          ------------------------------------------------------------ */}
          <View className="mt-md">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm booking"
              onPress={confirm}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  paddingVertical: 16,
                  borderRadius: 12,
                  backgroundColor: pressed ? "#004d46" : "#00685f",
                },
                confirmShadow,
              ]}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#ffffff",
                  letterSpacing: 0.2,
                }}
              >
                Confirm Booking
              </Text>
              <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
            </Pressable>

            <View className="mt-sm flex-row gap-sm">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit appointment"
                onPress={edit}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: "#00685f",
                  backgroundColor: pressed
                    ? "rgba(0,104,95,0.08)"
                    : "transparent",
                })}
              >
                <MaterialIcons name="edit" size={18} color="#00685f" />
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: "#00685f" }}
                >
                  Edit
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel appointment"
                onPress={cancel}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: "#ba1a1a",
                  backgroundColor: pressed
                    ? "rgba(186,26,26,0.08)"
                    : "transparent",
                })}
              >
                <MaterialIcons name="close" size={18} color="#ba1a1a" />
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: "#ba1a1a" }}
                >
                  Cancel
                </Text>
              </Pressable>
            </View>

            <View className="mt-md flex-row items-center justify-center gap-xs">
              <MaterialIcons name="lock" size={14} color="#6d7a77" />
              <Text className="font-label-sm text-on-surface-variant">
                Secure encrypted checkout
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-xl border border-outline-variant/20 bg-surface-container-low p-md ${className ?? ""}`}
    >
      <Text
        className="font-label-md text-outline mb-md"
        style={{
          textTransform: "uppercase",
          letterSpacing: 1.2,
          fontSize: 11,
        }}
      >
        {title}
      </Text>
      <View className="gap-md">{children}</View>
    </View>
  );
}

function DetailRow({
  icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: IconName;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-md">
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={icon} size={22} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="font-label-sm text-on-surface-variant" style={{ fontSize: 12 }}>
          {label}
        </Text>
        <Text
          className="font-label-md text-on-surface mt-xs"
          style={{ fontSize: 15, fontWeight: "600" }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function TagPill({
  label,
  tone,
}: {
  label: string;
  tone: "primary" | "tertiary";
}) {
  const bg =
    tone === "primary" ? "rgba(0,104,95,0.1)" : "rgba(0,88,190,0.1)";
  const color = tone === "primary" ? "#00685f" : "#0058be";
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          color,
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
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

const cardShadow =
  Platform.select({
    ios: {
      shadowColor: "#475569",
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
    },
    web: { boxShadow: "0px 3px 12px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};

const confirmShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    web: { boxShadow: "0px 5px 12px rgba(0, 104, 95, 0.3)" },
    android: { elevation: 5 },
  }) || {};

const pinShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    web: { boxShadow: "0px 3px 8px rgba(0, 0, 0, 0.15)" },
    android: { elevation: 4 },
  }) || {};
