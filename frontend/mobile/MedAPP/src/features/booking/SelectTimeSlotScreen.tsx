// Select Time & Consultation Type screen — translated from the Stitch
// "Book Appointment" HTML.
//
// Entry points (all "Book Appointment" CTAs in the app):
//   - PractitionerTelehealthProfileScreen → "Book Appointment"
//   - (future) Any partner / clinic detail screen with a booking CTA
//
// This is a PUSHED, task-focused screen. Per the Stitch comp:
//   - BottomNav is suppressed (transactional journey).
//   - Sticky "Book Now" CTA at the bottom advances to ReviewAppointment.
//
// Translation rules (HTML → React Native):
//   - backdrop-blur header / action bar → opaque bg-surface/80 + border + shadow.
//   - hover:* / focus:ring → dropped.
//   - overflow-x-auto → horizontal ScrollView with showsHorizontalScrollIndicator={false}.
//   - 3-col grid for time slots → flex-row flex-wrap with width: "31%".
//   - calendar_add_on → event-available (closest MaterialIcons match).
//   - verified → check-circle (consistent with other profile screens).
//   - wb_sunny → wb-sunny; light_mode → light-mode.
//   - Doctor + slots are seeded; replace with useQuery(["practitioner", id])
//     and useQuery(["slots", id, date]) once /v1/practitioners and
//     /v1/slots ship.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding expo-* APIs.

import { useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_DOCTOR = {
  name: "Dr. Sarah Jenkins",
  specialty: "Senior Cardiologist",
  rating: 4.9,
  reviewCount: "1.2k",
  avatarUri:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDl7Ao6Zlxrvg6hZCBJTCl40sfWi4jza2v_8V2IvenJxJRKcNiS5oSwi_3sak71g9LTAwWORqC63YbXcdPYebOLPq7sqLDZ3gK1ge88lmh8urol79cqtLcvqFW2FQgsaVKt3XZVUdomuZCytDil2ZqoQVZ1cY5BIkgZlao0j2WEiUZ42sDIx2QIJ6DWDYMaJG6IN22BOtX0PgVgM2tMFIe3uJHq2nh9Maeqz2xK3p5gtus1s64KG66RTL6zJ_k4rxovmczrWcxNaiqo",
};

type DateOption = { id: string; day: string; date: number };
const DATE_OPTIONS: DateOption[] = [
  { id: "mon-12", day: "Mon", date: 12 },
  { id: "tue-13", day: "Tue", date: 13 },
  { id: "wed-14", day: "Wed", date: 14 },
  { id: "thu-15", day: "Thu", date: 15 },
  { id: "fri-16", day: "Fri", date: 16 },
  { id: "sat-17", day: "Sat", date: 17 },
];

const MORNING_SLOTS = ["09:00 AM", "09:30 AM", "10:00 AM", "10:45 AM", "11:30 AM"];
const AFTERNOON_SLOTS = [
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:15 PM",
  "04:00 PM",
  "05:00 PM",
];

type ConsultationType =
  | "Standard Consultation"
  | "Follow-up Visit"
  | "Specialist Review"
  | "Diagnostic Report";
const CONSULTATION_TYPES: ConsultationType[] = [
  "Standard Consultation",
  "Follow-up Visit",
  "Specialist Review",
  "Diagnostic Report",
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SelectTimeSlotScreen() {
  const params = useLocalSearchParams<{
    practitionerName?: string;
    practitionerSpecialty?: string;
    practitionerAvatar?: string;
  }>();

  const doctor = {
    name: params.practitionerName ?? SEED_DOCTOR.name,
    specialty: params.practitionerSpecialty ?? SEED_DOCTOR.specialty,
    avatarUri: params.practitionerAvatar ?? SEED_DOCTOR.avatarUri,
    rating: SEED_DOCTOR.rating,
    reviewCount: SEED_DOCTOR.reviewCount,
  };

  const [selectedDateId, setSelectedDateId] = useState<string>("tue-13");
  const [selectedSlot, setSelectedSlot] = useState<string>("10:00 AM");
  const [selectedType, setSelectedType] =
    useState<ConsultationType>("Standard Consultation");
  const [reason, setReason] = useState("");

  const selectedDate = useMemo(
    () => DATE_OPTIONS.find((d) => d.id === selectedDateId) ?? DATE_OPTIONS[0],
    [selectedDateId],
  );

  const canProceed = Boolean(selectedDate && selectedSlot && selectedType);

  const proceedToReview = () => {
    if (!canProceed) return;
    router.push({
      // Route added this iteration — typedRoutes regenerates on dev server start.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pathname: "/(app)/review-appointment" as any,
      params: {
        practitionerName: doctor.name,
        practitionerSpecialty: doctor.specialty,
        practitionerAvatar: doctor.avatarUri,
        date: `${selectedDate.day}, May ${selectedDate.date}`,
        time: selectedSlot,
        type: selectedType,
        reason,
      },
    });
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* ----------------------------------------------------------------
            App bar
        ---------------------------------------------------------------- */}
        <View
          className="flex-row items-center justify-between border-b border-outline-variant/30 bg-surface/80 px-gutter py-sm"
          style={appBarShadow}
        >
          <View className="flex-row items-center gap-sm">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              className="rounded-full p-xs active:scale-95"
            >
              <MaterialIcons name="arrow-back" size={24} color="#3d4947" />
            </Pressable>
            <Text className="font-headline-md text-headline-md text-primary">
              MedApp
            </Text>
          </View>
          <View className="h-8 w-8 overflow-hidden rounded-full border border-outline-variant">
            <Image
              source={{
                uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuDMSBkhqGrvc8C1JrlKyqgnYmqSa2gepW2UOHo6CAxJkVHLcxBK1wDjDNxw_AH7iZGJAf5wCsLhREDddUnIAMIpDLLGyCZewtsj4PjRxgd1tQ-52UbY9rxJtDY4Za25IE9bSn_R5kthRlpfb-ui-psa7vfupGNp_W3Scx7tkhWsBUT27nkY5LsdwwnB8JROivIHQO6TI184sOcLVh7XyyagrEJVtu9_LtZHcNSuUw3bdr0b1qLuG2geAHz156xdoScVg5ZkC5mQw6FU",
              }}
              className="h-full w-full"
              accessibilityLabel="Your profile"
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ------------------------------------------------------------
              Doctor info card
          ------------------------------------------------------------ */}
          <View className="px-gutter pt-md pb-base">
            <View
              className="flex-row items-center gap-md rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-md"
              style={cardShadow}
            >
              <View className="relative">
                <Image
                  source={{ uri: doctor.avatarUri }}
                  style={{ width: 80, height: 80, borderRadius: 12 }}
                  accessibilityLabel={doctor.name}
                />
                <View
                  className="absolute items-center justify-center rounded-full bg-primary"
                  style={{ bottom: -4, right: -4, padding: 3 }}
                >
                  <MaterialIcons name="check-circle" size={16} color="#ffffff" />
                </View>
              </View>
              <View className="flex-1">
                <Text
                  className="font-headline-md text-on-surface"
                  style={{ fontSize: 18, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {doctor.name}
                </Text>
                <Text className="font-body-md text-on-surface-variant" numberOfLines={1}>
                  {doctor.specialty}
                </Text>
                <View className="mt-xs flex-row items-center gap-xs">
                  <MaterialIcons name="star" size={18} color="#0058be" />
                  <Text
                    className="font-label-md text-on-surface"
                    style={{ fontWeight: "700" }}
                  >
                    {doctor.rating}
                  </Text>
                  <Text className="font-label-sm text-outline">
                    ({doctor.reviewCount} reviews)
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ------------------------------------------------------------
              Date selector
          ------------------------------------------------------------ */}
          <View className="mt-md">
            <View className="mb-sm flex-row items-center justify-between px-gutter">
              <Text
                className="font-headline-md text-on-surface"
                style={{ fontSize: 18, fontWeight: "700" }}
              >
                Select Date
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="See full calendar"
                hitSlop={6}
                className="active:scale-95"
              >
                <Text className="font-label-md text-primary">See Calendar</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: 12,
                paddingHorizontal: 24,
                paddingVertical: 4,
              }}
            >
              {DATE_OPTIONS.map((d) => {
                const active = d.id === selectedDateId;
                return (
                  <Pressable
                    key={d.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.day} ${d.date}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedDateId(d.id)}
                    style={({ pressed }) => [
                      {
                        minWidth: 64,
                        height: 80,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active
                          ? "#00685f"
                          : "#f0f5f2",
                        borderWidth: active ? 0 : 1,
                        borderColor: "rgba(188,201,198,0.5)",
                        opacity: pressed ? 0.85 : 1,
                      },
                      active ? dateActiveShadow : undefined,
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "500",
                        color: active ? "#ffffff" : "#3d4947",
                        opacity: active ? 0.9 : 1,
                      }}
                    >
                      {d.day}
                    </Text>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "700",
                        color: active ? "#ffffff" : "#171d1c",
                        marginTop: 2,
                      }}
                    >
                      {d.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ------------------------------------------------------------
              Time slots
          ------------------------------------------------------------ */}
          <View className="mt-lg px-gutter">
            <Text
              className="font-headline-md text-on-surface mb-md"
              style={{ fontSize: 18, fontWeight: "700" }}
            >
              Available Slots
            </Text>

            <SlotGroup
              icon="wb-sunny"
              label="Morning"
              slots={MORNING_SLOTS}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
            />
            <SlotGroup
              icon="light-mode"
              label="Afternoon"
              slots={AFTERNOON_SLOTS}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
            />
          </View>

          {/* ------------------------------------------------------------
              Consultation type chips
          ------------------------------------------------------------ */}
          <View className="mt-sm">
            <View className="px-gutter mb-sm">
              <Text
                className="font-headline-md text-on-surface"
                style={{ fontSize: 18, fontWeight: "700" }}
              >
                Consultation Type
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: 10,
                paddingHorizontal: 24,
                paddingVertical: 4,
              }}
            >
              {CONSULTATION_TYPES.map((t) => {
                const active = t === selectedType;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityLabel={t}
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedType(t)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: active ? 0 : 1,
                      borderColor: "rgba(188,201,198,0.5)",
                      backgroundColor: active
                        ? "#00685f"
                        : "#e4e9e7",
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: active ? "#ffffff" : "#3d4947",
                      }}
                    >
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ------------------------------------------------------------
              Reason for visit
          ------------------------------------------------------------ */}
          <View className="mt-lg mb-md px-gutter">
            <Text className="font-label-md text-on-surface mb-sm">
              Reason for Visit
            </Text>
            <View
              className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest"
              style={cardShadow}
            >
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Describe your symptoms or reason for the appointment…"
                placeholderTextColor="#6d7a77"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{
                  minHeight: 96,
                  padding: 16,
                  fontSize: 16,
                  lineHeight: 22,
                  color: "#171d1c",
                }}
                accessibilityLabel="Reason for visit"
              />
            </View>
          </View>
        </ScrollView>

        {/* ----------------------------------------------------------------
            Sticky bottom action bar
        ---------------------------------------------------------------- */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
          }}
        >
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: "#f5faf8" }}>
            <View
              className="border-t border-outline-variant/20 bg-surface px-gutter py-md"
              style={actionBarShadow}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Book now"
                onPress={proceedToReview}
                disabled={!canProceed}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    paddingVertical: 16,
                    borderRadius: 999,
                    backgroundColor: !canProceed
                      ? "#bcc9c6"
                      : pressed
                        ? "#004d46"
                        : "#00685f",
                  },
                  canProceed ? bookButtonShadow : undefined,
                ]}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: "#ffffff",
                    letterSpacing: 0.2,
                  }}
                >
                  Book Now
                </Text>
                <MaterialIcons name="event-available" size={20} color="#ffffff" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Slot group — Morning / Afternoon section
// ---------------------------------------------------------------------------

function SlotGroup({
  icon,
  label,
  slots,
  selected,
  onSelect,
}: {
  icon: IconName;
  label: string;
  slots: string[];
  selected: string;
  onSelect: (slot: string) => void;
}) {
  return (
    <View className="mb-lg">
      <View className="mb-sm flex-row items-center gap-xs">
        <MaterialIcons name={icon} size={20} color="#515f74" />
        <Text
          className="font-label-md text-secondary"
          style={{ textTransform: "uppercase", letterSpacing: 1 }}
        >
          {label}
        </Text>
      </View>
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
        {slots.map((s) => {
          const active = s === selected;
          return (
            <View key={s} style={{ width: "33.333%", padding: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label} slot ${s}`}
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(s)}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: active ? "#00685f" : "rgba(188,201,198,0.5)",
                  backgroundColor: active
                    ? "#008378"
                    : "#ffffff",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: active ? "#f4fffc" : "#171d1c",
                  }}
                >
                  {s}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
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
    android: { elevation: 2 },
  }) || {};

const dateActiveShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    web: { boxShadow: "0px 4px 10px rgba(0, 104, 95, 0.25)" },
    android: { elevation: 5 },
  }) || {};

const actionBarShadow =
  Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
    },
    web: { boxShadow: "0px -2px 8px rgba(0, 0, 0, 0.06)" },
    android: { elevation: 6 },
  }) || {};

const bookButtonShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    web: { boxShadow: "0px 5px 12px rgba(0, 104, 95, 0.3)" },
    android: { elevation: 6 },
  }) || {};
