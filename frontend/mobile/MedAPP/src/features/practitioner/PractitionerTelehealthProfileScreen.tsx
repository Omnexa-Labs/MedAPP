// Specialist — Telehealth Profile screen — translated from the Stitch HTML
// "Doctor Profile - MedApp" design.
//
// Distinct from PractitionerSocialProfileScreen, which shows the social
// identity (posts, followers, reviews tab). This screen is the booking
// surface: services, education, availability, and the "Book Appointment" CTA.
//
// Entry points:
//   - Find Care screen → PersonCard → "View Profile"
//
// Route: app/(app)/practitioner-telehealth-profile.tsx
// Params: { id?: string } — practitioner ID for future API lookup.
//         Seed data stands in until GET /v1/practitioners/:id ships.
//
// Translation calls:
//   - .glass-header backdrop-blur → opaque bg-surface/80 + border + shadow.
//   - .premium-gradient (linear-gradient 135deg) → bg-primary; RN cannot
//     compose CSS gradients without expo-linear-gradient.
//   - lg:grid-cols-3 two-column layout → single column stacked (mobile only).
//   - -skew-x-12 background accent → dropped (CSS transforms not supported).
//   - aspect-video image containers → fixed height (aspectRatio: 16/9).
//   - group-hover:scale-105 / hover:* → dropped.
//   - Play-button overlay on videos → always visible (no hover in RN).
//   - Sticky "Book Appointment" CTA → absolute z-30 just above BottomNav.
//   - Material Symbols → MaterialIcons nearest equivalents:
//       cardiology       → favorite
//       nutrition        → local-dining
//       contact_emergency → local-hospital
//       play_circle      → play-circle-filled
//       person_search    → manage-search
//       medical_services → medical-services
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

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
import { BottomNav } from "@/features/home/components/BottomNav";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

// ---------------------------------------------------------------------------
// Seed data — mirrors the Stitch comp. Replace with API call once the
// practitioner service exposes GET /v1/practitioners/:id.
// ---------------------------------------------------------------------------

interface TelehealthReview {
  id: string;
  initials: string;
  name: string;
  timeAgo: string;
  rating: number; // 1–5; renders filled/empty stars
  body: string;
}

const SEED_REVIEWS: TelehealthReview[] = [
  {
    id: "r1",
    initials: "SW",
    name: "Sarah Williams",
    timeAgo: "2 days ago",
    rating: 5,
    body: '"Dr. Sterling is incredibly thorough. He took the time to explain my diagnostic results in a way I could actually understand. Highly recommended!"',
  },
  {
    id: "r2",
    initials: "MR",
    name: "Michael Reed",
    timeAgo: "1 week ago",
    rating: 4,
    body: '"The facility is top-notch and the staff was very professional. Very pleased with my routine check-up."',
  },
];

const DOCTOR_AVATAR_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuA_JcN85zIIU6ER9XmbdkTvBA0Mt3-7ykGkTIEWgpWUhaMtD-Ol_HyWmmSiNUckDoWwX4UMKFZnGBLFwz_zesQYTp2vnH4xva4_68nVxNt-ulFBPlqyIGAQaFtbN_18kHJBquw_0sZLB6hVgFffJNxWx7ywNF0AQjsJJNGTkp9DtZGidCFF3Bvj7u8FrdAIAdPe0atfaP1H368UW-2C6eBxS-Pui5BMjU-BnwBM_Lmj-qseQFCmaYbgyujYMu818W73bYg_eSNTA3dQ";

const VIDEO_1_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAmykLuqDrkiryLlHQd67Iw_UTOrNMMHnlQIxmlHfzZJkqHmyEdY7jls0JUamQoNAwzTZQTg31Sg1AQ9Bg5vToKZY6wISps8bZWY4DiknqF9SBSejRW9A4hTSUFLiTh7M7nzhbdxAPEXGetfAxCRVG150LZydypE9aDUbwtTq0XOVzAgEV3wUhsDkg2hwOuYAXF28XbZnC3GM-zFiAULlmoXnVS9ybJl2JNj1nPN-xBaUD0ND-2BrODEAJAIclpDkeTvT9949wiDcJ8";

const VIDEO_2_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBuZRjoag4DW2hjU-UWh23y4UVe23pS-R3tiKHrcI-tUtVFgYeb4MfKfB-YoPmnNUxiNdv8gNsnI3-BC3RFnEgSZtYqMBqi3ZHXFLKFOu22RzGbTWag8VS8dcCDXWRwpBI7xNZM-WCyhL4CbRJ-4E-siPs_ICD1EcOxmgt6-0YvRkEp5z2yTK8m9tO13QL9wXSZITOm8-Ed0pKbRygCmS2DQ_iu8bg-Pf9ZLrRj7hrRQ-fr80ff4OS5si2lzBdb409xBM6TUh7_x9g_";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function PractitionerTelehealthProfileScreen() {
  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" />
      <SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
        {/* App bar */}
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
              <MaterialIcons name="arrow-back" size={24} color="#00685f" />
            </Pressable>
            <Text className="font-headline-md text-headline-md text-primary">MedApp</Text>
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

        {/* Scrollable content — paddingBottom clears both the sticky CTA and BottomNav */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 168 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero Section ─────────────────────────────────────────── */}
          <View
            className="mt-base rounded-xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden"
            style={cardShadow}
          >
            <View className="flex-row gap-md p-md">
              {/* Doctor photo */}
              <View
                className="h-32 w-32 shrink-0 overflow-hidden rounded-xl border-4 border-surface-container-lowest"
                style={avatarShadow}
              >
                <Image
                  source={{ uri: DOCTOR_AVATAR_URI }}
                  className="h-full w-full"
                  accessibilityLabel="Dr. Julian Sterling"
                />
              </View>

              {/* Info block */}
              <View className="flex-1 justify-between gap-sm">
                {/* Badges row */}
                <View className="flex-row flex-wrap items-center gap-sm">
                  <View className="flex-row items-center gap-xs rounded-full bg-primary/10 px-sm py-xs">
                    <MaterialIcons name="check-circle" size={14} color="#00685f" />
                    <Text className="font-label-sm text-label-sm text-primary">
                      Board Certified
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-xs">
                    <MaterialIcons name="star" size={14} color="#eab308" />
                    <Text className="font-label-md text-label-md text-on-surface">4.9</Text>
                    <Text className="font-label-sm text-label-sm text-on-surface-variant">
                      (1,240)
                    </Text>
                  </View>
                </View>

                {/* Name + specialty */}
                <View>
                  <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
                    Dr. Julian Sterling, MD
                  </Text>
                  <Text className="font-label-md text-label-md text-primary mt-xs">
                    Senior Cardiologist & Internal Medicine
                  </Text>
                </View>

                {/* Experience + Location */}
                <View className="gap-xs">
                  <StatRow icon="work" label="Experience" value="15+ Years" />
                  <StatRow icon="location-on" label="Location" value="Mayo Clinic, Rochester" />
                </View>
              </View>
            </View>
          </View>

          {/* ── About Section ────────────────────────────────────────── */}
          <SectionHeader icon="manage-search" title="About Dr. Sterling" />
          <View
            className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
            style={cardShadow}
          >
            <Text className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Dr. Julian Sterling is a world-renowned cardiologist specializing in advanced
              cardiac imaging and preventive heart care. With over 15 years of clinical
              practice, he has dedicated his career to integrating cutting-edge medical
              technology with a patient-centered approach. He focuses on early detection of
              cardiovascular diseases and personalized treatment plans that empower patients
              to take control of their heart health.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Read full biography"
              className="mt-md flex-row items-center gap-xs active:opacity-70"
            >
              <Text className="font-label-md text-label-md text-primary">
                Read full biography
              </Text>
              <MaterialIcons name="arrow-forward" size={18} color="#00685f" />
            </Pressable>
          </View>

          {/* ── Specialized Services ─────────────────────────────────── */}
          <SectionHeader icon="medical-services" title="Specialized Services" />
          <View className="gap-md">
            {/* Primary card — full width */}
            <View
              className="rounded-xl border border-primary/10 bg-primary/5 p-md"
              style={cardShadow}
            >
              <MaterialIcons name="favorite" size={32} color="#00685f" />
              <Text
                className="font-label-md text-on-surface mt-sm"
                style={{ fontSize: 17 }}
              >
                Advanced Cardiac Imaging
              </Text>
              <Text className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                State-of-the-art 3D echocardiography and MRI diagnostics for precise heart
                health mapping.
              </Text>
              {/* Tech avatar stack */}
              <View className="mt-md flex-row items-center gap-xs">
                <View className="h-7 w-7 -mr-2 rounded-full border-2 border-surface-container-lowest bg-primary-fixed" />
                <View className="h-7 w-7 -mr-2 rounded-full border-2 border-surface-container-lowest bg-secondary-fixed" />
                <View className="h-7 w-7 rounded-full border-2 border-surface-container-lowest bg-tertiary-fixed" />
                <Text className="font-label-sm text-label-sm text-on-surface-variant ml-sm">
                  +4 Techs
                </Text>
              </View>
            </View>

            {/* Two-column row */}
            <View className="flex-row gap-md">
              <ServiceMiniCard
                icon="monitor-heart"
                title="Heart Rate Analysis"
                subtitle="24-hour ambulatory monitoring."
              />
              <ServiceMiniCard
                icon="local-dining"
                title="Lifestyle Coaching"
                subtitle="Nutrition plans for hypertension."
              />
            </View>

            {/* Wide post-op card */}
            <View
              className="flex-row items-center gap-md rounded-xl border border-outline-variant/30 bg-surface-container-highest/50 p-md"
              style={cardShadow}
            >
              <View className="h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white">
                <MaterialIcons name="emergency" size={36} color="#00685f" />
              </View>
              <View className="flex-1">
                <Text className="font-label-md text-on-surface" style={{ fontSize: 15 }}>
                  Post-Operative Care
                </Text>
                <Text className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                  Comprehensive recovery tracking and virtual check-ins for heart surgery
                  patients.
                </Text>
              </View>
            </View>
          </View>

          {/* ── Patient Education ─────────────────────────────────────── */}
          <View className="mt-lg mb-md flex-row items-center justify-between">
            <View className="flex-row items-center gap-sm">
              <MaterialIcons name="play-circle-filled" size={22} color="#00685f" />
              <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
                Patient Education
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View channel"
              hitSlop={6}
            >
              <Text className="font-label-md text-label-md text-primary">View Channel</Text>
            </Pressable>
          </View>
          <View className="flex-row gap-md">
            <VideoCard
              uri={VIDEO_1_URI}
              duration="12:45"
              title="Understanding Atrial Fibrillation"
              subtitle="Preventive Cardiology Series"
            />
            <VideoCard
              uri={VIDEO_2_URI}
              duration="08:20"
              title="Dietary Habits for a Stronger Heart"
              subtitle="Wellness & Nutrition"
            />
          </View>

          {/* ── Clinic Availability ───────────────────────────────────── */}
          <SectionHeader icon="calendar-today" title="Clinic Availability" />
          <View
            className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-md"
            style={cardShadow}
          >
            <AvailabilityRow label="Monday – Friday" value="09:00 – 18:00" valueColor="#00685f" />
            <AvailabilityRow label="Wait Time" value="~ 15 Minutes" />
            <View className="flex-row items-center justify-between py-sm">
              <Text className="font-label-sm text-label-sm text-on-surface-variant">
                Accepting New Patients
              </Text>
              <View className="h-2.5 w-2.5 rounded-full bg-primary" />
            </View>

            {/* Emergency note */}
            <View className="mt-sm flex-row items-center gap-sm rounded-lg bg-primary/10 p-sm">
              <MaterialIcons name="local-hospital" size={20} color="#00685f" />
              <Text
                className="font-label-sm text-label-sm text-on-primary-fixed-variant flex-1"
                style={{ fontSize: 11, lineHeight: 16 }}
              >
                Dr. Sterling is available for emergency cardiac consultations via tele-health.
              </Text>
            </View>
          </View>

          {/* ── Reviews ───────────────────────────────────────────────── */}
          <View className="mt-lg mb-md flex-row items-center justify-between">
            <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
              Reviews
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="See all reviews" hitSlop={6}>
              <Text className="font-label-md text-label-md text-primary">See All</Text>
            </Pressable>
          </View>
          <View className="gap-md">
            {SEED_REVIEWS.map((r) => (
              <TelehealthReviewCard key={r.id} review={r} />
            ))}
          </View>
        </ScrollView>

        {/* ── Sticky "Book Appointment" CTA ───────────────────────────
            Sits above the BottomNav (z-50) at z-30. The CTA bottom
            value clears the BottomNav height (~80px) with an 8px gap. */}
        <View
          style={{
            position: "absolute",
            bottom: 82,
            left: 16,
            right: 16,
            zIndex: 30,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book appointment with Dr. Julian Sterling"
            onPress={() =>
              // Route added this iteration — typedRoutes will pick it up on
              // next dev server start; cast bypasses the strict union check.
              router.push({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pathname: "/(app)/select-time-slot" as any,
                params: {
                  practitionerName: "Dr. Julian Sterling",
                  practitionerSpecialty: "Cardiologist",
                },
              })
            }
            style={({ pressed }) => [
              {
                width: "100%",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                borderRadius: 12,
                paddingVertical: 16,
                backgroundColor: pressed ? "#004d46" : "#00685f",
              },
              bookingBtnShadow,
            ]}
          >
            <MaterialIcons name="calendar-month" size={22} color="#ffffff" />
            <Text
              style={{
                color: "#ffffff",
                fontFamily: "Inter",
                fontSize: 16,
                fontWeight: "600",
                letterSpacing: 0.14,
              }}
            >
              Book Appointment
            </Text>
          </Pressable>
        </View>

        <BottomNav
          active="home"
          onTabPress={(key) => {
            if (key === "home") router.back();
            else if (key === "inbox") router.push("/(app)/inbox" as Href);
          }}
        />
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section primitives
// ---------------------------------------------------------------------------

function SectionHeader({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View className="mt-lg mb-md flex-row items-center gap-sm">
      <MaterialIcons name={icon} size={22} color="#00685f" />
      <Text className="font-headline-md text-on-surface" style={{ fontSize: 20 }}>
        {title}
      </Text>
    </View>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-sm">
      <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-container">
        <MaterialIcons name={icon} size={16} color="#00685f" />
      </View>
      <View>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
        <Text className="font-label-md text-label-md text-on-surface">{value}</Text>
      </View>
    </View>
  );
}

function ServiceMiniCard({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
}) {
  return (
    <View
      className="flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      <MaterialIcons name={icon} size={24} color="#00685f" />
      <Text className="font-label-md text-on-surface mt-sm mb-xs" style={{ fontSize: 14 }}>
        {title}
      </Text>
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{subtitle}</Text>
    </View>
  );
}

function VideoCard({
  uri,
  duration,
  title,
  subtitle,
}: {
  uri: string;
  duration: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-1 active:opacity-90"
    >
      {/* Thumbnail — aspect-video (16:9) */}
      <View
        className="w-full overflow-hidden rounded-xl border border-outline-variant/30 mb-sm"
        style={{ aspectRatio: 16 / 9, ...cardShadow }}
      >
        <Image source={{ uri }} className="h-full w-full" accessibilityLabel={title} />
        {/* Play button — always visible on mobile (no hover) */}
        <View className="absolute inset-0 items-center justify-center">
          <View
            className="h-12 w-12 items-center justify-center rounded-full bg-white/90"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <MaterialIcons name="play-arrow" size={28} color="#00685f" />
          </View>
        </View>
        {/* Duration badge */}
        <View
          className="absolute bottom-2 right-2 rounded px-xs py-xs"
          style={{ backgroundColor: "rgba(23,29,28,0.70)" }}
        >
          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "700" }}>{duration}</Text>
        </View>
      </View>
      <Text className="font-label-md text-label-md text-on-surface">{title}</Text>
      <Text className="font-label-sm text-label-sm text-on-surface-variant mt-xs">{subtitle}</Text>
    </Pressable>
  );
}

function AvailabilityRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-outline-variant/10 py-sm">
      <Text className="font-label-sm text-label-sm text-on-surface-variant">{label}</Text>
      <Text
        className="font-label-md text-label-md"
        style={{ color: valueColor ?? "#171d1c" }}
      >
        {value}
      </Text>
    </View>
  );
}

function TelehealthReviewCard({ review }: { review: TelehealthReview }) {
  return (
    <View
      className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-md"
      style={cardShadow}
    >
      <View className="flex-row items-start justify-between mb-sm">
        <View className="flex-row items-center gap-sm">
          <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-container">
            <Text className="font-label-md text-label-md text-primary" style={{ fontSize: 12 }}>
              {review.initials}
            </Text>
          </View>
          <View>
            <Text className="font-label-md text-label-md text-on-surface">{review.name}</Text>
            <Text style={{ fontSize: 10, color: "#3d4947" }}>{review.timeAgo}</Text>
          </View>
        </View>
        {/* Stars */}
        <View className="flex-row gap-xs">
          {Array.from({ length: 5 }).map((_, i) => (
            <MaterialIcons
              key={i}
              name={i < review.rating ? "star" : "star-border"}
              size={14}
              color="#eab308"
            />
          ))}
        </View>
      </View>
      <Text
        className="font-label-sm text-label-sm text-on-surface-variant"
        style={{ fontStyle: "italic", lineHeight: 20 }}
      >
        {review.body}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local primitives. Promote to components/ui once a second screen needs them.
// ---------------------------------------------------------------------------

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

const avatarShadow =
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

const bookingBtnShadow =
  Platform.select({
    ios: {
      shadowColor: "#00685f",
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    web: { boxShadow: "0px 8px 16px rgba(0, 104, 95, 0.35)" },
    android: { elevation: 8 },
  }) || {};
