// Appointment Management screen — translated from the Stitch
// "Clinical Vitality - Appointments" HTML.
//
// Entry points:
//   - BookingConfirmedScreen → "View My Appointments"
//   - HomeScreen → Upcoming Appointments section header → "View All"
//   - (future) Any "My Appointments" entry across the app
//
// This is a root-level destination screen — it shows BottomNav with
// Home active (no dedicated tab for appointments in BottomNav, so we keep
// home highlighted since it's the entry path most users will use).
//
// Translation rules:
//   - sticky glass-nav header → opaque bg-surface/80 + border + shadow.
//   - tabs (Upcoming | Past) → segmented control with bottom underline.
//   - status pills (Confirmed / In Review / Completed) → inline-coloured pills.
//   - Past tab uses muted/grayscale cards with "View Summary" CTA.
//   - location_on → location-on. calendar_today → calendar-today.
//   - grid_view → "Home" stays active since there is no Appointments tab.
//   - Seed data with two upcoming + two past appointments. Replace with
//     useQuery(["appointments"]) once GET /v1/appointments ships.

import { useState } from "react";
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
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/auth-store";
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

type AppointmentStatus = "confirmed" | "in_review" | "completed";

interface UpcomingAppointment {
  id: string;
  doctorName: string;
  specialty: string;
  facility: string;
  avatarUri: string;
  status: Exclude<AppointmentStatus, "completed">;
  dateLabel: string; // "Tuesday, Oct 24 • 10:30 AM"
  consultationType: string;
}

interface PastAppointment {
  id: string;
  doctorName: string;
  specialty: string;
  facility: string;
  completedLabel: string; // "Completed on Monday, Sep 12 • 09:00 AM"
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const UPCOMING_APPOINTMENTS: UpcomingAppointment[] = [
  {
    id: "u1",
    doctorName: "Dr. Julian Sterling",
    specialty: "Senior Cardiologist",
    facility: "Mayo Clinic",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAiCdPvTk5RydHAjrMHk72Eu7sJRi3EI57s2zitwSnJw6fR-Ha-75XWdA2MjoxR9CgW1wk4Y8yWmBM9J3gwdHmLwACfEvc95ECOnqZEK6DpOt3Oo7QykCYlrP8rJJWJufV5bAB3vX_s7TNJHzOGgSULtrFO6uXN_V3vctBselslwyizvCrqX9Nt3f-WdJe5uLMji_TUyIxJIg3P9U5o7jTAfkBlf9jQB3IC9HNo2nT-65KTN6CRo5NF1wubrcTf-0jyGZE5avuAlAfI",
    status: "confirmed",
    dateLabel: "Tuesday, Oct 24 • 10:30 AM",
    consultationType: "Standard Consultation",
  },
  {
    id: "u2",
    doctorName: "Dr. Sarah Chen",
    specialty: "Neurologist",
    facility: "City General Hospital",
    avatarUri:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDl7Ao6Zlxrvg6hZCBJTCl40sfWi4jza2v_8V2IvenJxJRKcNiS5oSwi_3sak71g9LTAwWORqC63YbXcdPYebOLPq7sqLDZ3gK1ge88lmh8urol79cqtLcvqFW2FQgsaVKt3XZVUdomuZCytDil2ZqoQVZ1cY5BIkgZlao0j2WEiUZ42sDIx2QIJ6DWDYMaJG6IN22BOtX0PgVgM2tMFIe3uJHq2nh9Maeqz2xK3p5gtus1s64KG66RTL6zJ_k4rxovmczrWcxNaiqo",
    status: "in_review",
    dateLabel: "Thursday, Oct 26 • 02:15 PM",
    consultationType: "Follow-up Visit",
  },
];

const PAST_APPOINTMENTS: PastAppointment[] = [
  {
    id: "p1",
    doctorName: "Dr. Aris Thorne",
    specialty: "Physiotherapist",
    facility: "Wellness Hub",
    completedLabel: "Completed on Monday, Sep 12 • 09:00 AM",
  },
  {
    id: "p2",
    doctorName: "Dr. Emily Watts",
    specialty: "General Practitioner",
    facility: "Mayo Clinic",
    completedLabel: "Completed on Friday, Aug 28 • 11:30 AM",
  },
];

const STATUS_STYLES: Record<
  UpcomingAppointment["status"],
  { bg: string; text: string; label: string }
> = {
  confirmed: {
    bg: "rgba(0,104,95,0.12)",
    text: "#00685f",
    label: "Confirmed",
  },
  in_review: {
    bg: "rgba(0,131,120,0.15)",
    text: "#008378",
    label: "In Review",
  },
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AppointmentManagementScreen() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || "there";
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* ----------------------------------------------------------------
            App bar — root tab style (avatar + MedApp + notifications)
        ---------------------------------------------------------------- */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <View className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary/20">
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  className="h-full w-full"
                  accessibilityLabel="Your profile"
                />
              ) : (
                <View className="h-full w-full items-center justify-center bg-primary-container">
                  <Text className="font-label-md text-label-md text-on-primary-container">
                    {firstName[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
              )}
            </View>
            <Text className="font-headline-md text-headline-md text-primary">
              MedApp
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
            paddingBottom: 140,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title + subtitle */}
          <Text
            className="text-on-surface mb-xs"
            style={{
              fontSize: 28,
              fontWeight: "700",
              letterSpacing: -0.3,
            }}
          >
            Appointments
          </Text>
          <Text className="font-body-md text-on-surface-variant mb-md">
            Manage your clinical sessions and history.
          </Text>

          {/* Tabs */}
          <View
            className="mb-md flex-row border-b border-outline-variant/40"
            style={{ marginHorizontal: -4 }}
          >
            <TabButton
              label="Upcoming"
              active={tab === "upcoming"}
              onPress={() => setTab("upcoming")}
            />
            <TabButton
              label="Past"
              active={tab === "past"}
              onPress={() => setTab("past")}
            />
          </View>

          {/* List */}
          <View className="gap-md">
            {tab === "upcoming"
              ? UPCOMING_APPOINTMENTS.map((a) => (
                  <UpcomingCard key={a.id} appointment={a} />
                ))
              : PAST_APPOINTMENTS.map((a) => (
                  <PastCard key={a.id} appointment={a} />
                ))}
          </View>
        </ScrollView>

        <BottomNav
          active="home"
          onTabPress={(key) => {
            if (key === "home") router.replace("/(app)" as Href);
            else if (key === "overview") router.push("/(app)/overview" as Href);
            else if (key === "inbox") router.push("/(app)/inbox" as Href);
            else if (key === "community") router.push("/(app)/community" as Href);
            else if (key === "lifestyle") router.push("/(app)/lifestyle" as Href);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 14,
        alignItems: "center",
        borderBottomWidth: 2,
        borderBottomColor: active ? "#00685f" : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: active ? "#00685f" : "#3d4947",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Upcoming card
// ---------------------------------------------------------------------------

function UpcomingCard({
  appointment,
}: {
  appointment: UpcomingAppointment;
}) {
  const statusStyle = STATUS_STYLES[appointment.status];

  return (
    <View
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      {/* Header row */}
      <View className="mb-md flex-row items-start justify-between gap-sm">
        <View className="flex-1 flex-row items-center gap-md">
          <Image
            source={{ uri: appointment.avatarUri }}
            style={{ width: 56, height: 56, borderRadius: 12 }}
            accessibilityLabel={appointment.doctorName}
          />
          <View className="flex-1">
            <Text
              className="text-on-surface"
              style={{ fontSize: 15, fontWeight: "600" }}
              numberOfLines={1}
            >
              {appointment.doctorName}
            </Text>
            <Text
              className="text-primary mt-xs"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
              numberOfLines={1}
            >
              {appointment.specialty}
            </Text>
            <View className="mt-xs flex-row items-center gap-xs">
              <MaterialIcons name="location-on" size={14} color="#3d4947" />
              <Text
                className="text-on-surface-variant"
                style={{ fontSize: 12 }}
                numberOfLines={1}
              >
                {appointment.facility}
              </Text>
            </View>
          </View>
        </View>

        {/* Status pill */}
        <View
          style={{
            backgroundColor: statusStyle.bg,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <Text
            style={{
              color: statusStyle.text,
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Date/Time strip */}
      <View
        className="mb-md flex-row items-center gap-sm rounded-lg bg-surface-container-low p-sm"
      >
        <MaterialIcons name="calendar-today" size={20} color="#00685f" />
        <View className="flex-1">
          <Text
            className="text-on-surface"
            style={{ fontSize: 14, fontWeight: "600" }}
          >
            {appointment.dateLabel}
          </Text>
          <Text
            className="text-on-surface-variant mt-xs"
            style={{
              fontSize: 10,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {appointment.consultationType}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View className="flex-row gap-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reschedule appointment"
          onPress={() =>
            router.push({
              // Route added this iteration — typedRoutes regenerates on dev server start.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pathname: "/(app)/select-time-slot" as any,
              params: {
                practitionerName: appointment.doctorName,
                practitionerSpecialty: appointment.specialty,
                practitionerAvatar: appointment.avatarUri,
              },
            })
          }
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: "#00685f",
            backgroundColor: pressed
              ? "rgba(0,104,95,0.08)"
              : "transparent",
            alignItems: "center",
          })}
        >
          <Text style={{ color: "#00685f", fontSize: 14, fontWeight: "600" }}>
            Reschedule
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel appointment"
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: "#ba1a1a",
            backgroundColor: pressed
              ? "rgba(186,26,26,0.08)"
              : "transparent",
            alignItems: "center",
          })}
          onPress={() => {
            // TODO: hook into DELETE /v1/appointments/:id once ready.
          }}
        >
          <Text style={{ color: "#ba1a1a", fontSize: 14, fontWeight: "600" }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Past card
// ---------------------------------------------------------------------------

function PastCard({ appointment }: { appointment: PastAppointment }) {
  return (
    <View
      className="rounded-xl border border-surface-container-highest bg-surface-container p-md"
      style={{ opacity: 0.85 }}
    >
      <View className="mb-md flex-row items-start justify-between gap-sm">
        <View className="flex-1 flex-row items-center gap-md">
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: "#d6dbd9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="person" size={28} color="#6d7a77" />
          </View>
          <View className="flex-1">
            <Text
              className="text-on-surface"
              style={{ fontSize: 15, fontWeight: "600" }}
              numberOfLines={1}
            >
              {appointment.doctorName}
            </Text>
            <Text
              className="text-outline mt-xs"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
              numberOfLines={1}
            >
              {appointment.specialty}
            </Text>
            <View className="mt-xs flex-row items-center gap-xs">
              <MaterialIcons name="location-on" size={14} color="#3d4947" />
              <Text
                className="text-on-surface-variant"
                style={{ fontSize: 12 }}
                numberOfLines={1}
              >
                {appointment.facility}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#dee4e1",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: "#3d4947", fontSize: 11, fontWeight: "700" }}>
            Completed
          </Text>
        </View>
      </View>

      <Text
        className="text-on-surface-variant"
        style={{ fontSize: 11, marginBottom: 12 }}
      >
        {appointment.completedLabel}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View summary for appointment with ${appointment.doctorName}`}
        onPress={() => {
          // TODO: route to consultation summary screen once ready.
        }}
        style={({ pressed }) => ({
          width: "100%",
          paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: pressed ? "#d6dbd9" : "#dee4e1",
          alignItems: "center",
        })}
      >
        <Text style={{ color: "#171d1c", fontSize: 13, fontWeight: "600" }}>
          View Summary
        </Text>
      </Pressable>
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
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 16px rgba(71, 85, 105, 0.05)" },
    android: { elevation: 2 },
  }) || {};
